import { useCallback, useEffect, useRef, useState } from 'react';
import type { IceServer } from '@/services/api';
import { sendSignal, pollSignals, clearSignals, Signal } from '@/features/meeting/signaling';

// A 1:1 WebRTC peer connection driven by the Mongo-polled signaling relay, using
// the standard **perfect negotiation** pattern so it connects reliably from any
// network and never desyncs.
//
// Why perfect negotiation: the earlier hand-rolled "offerer re-offers / rolls
// back" logic could cross an offer with a stale answer, which the browser
// rejects with "m-lines order in answer doesn't match offer". Perfect
// negotiation instead lets BOTH peers create offers freely and resolves any
// collision deterministically by politeness (the patient is polite and rolls
// back; the host is impolite and wins), which is glare- and m-line-safe.
//
//   • Identity is the MEETING ROLE ('staff' | 'patient') — exactly one of each
//     in a 1:1 room — so signals are broadcast and role-addressed.
//   • A join heartbeat (1.5s) handles discovery/recovery regardless of order.
//   • Lobby signals ('knock'/'admit'/'deny') are ignored by the media peer.
//   • ICE is queued until the remote description is set; ICE failure triggers a
//     restart (which renegotiates a fresh path without dropping media).
//   • StrictMode-safe: the async boot is bound to a per-run `active` flag.

export type PeerStatus = 'idle' | 'connecting' | 'waiting' | 'connected' | 'failed';

interface Options {
  token: string;
  role: 'staff' | 'patient';
  iceServers: IceServer[];
  enabled: boolean;
  onAppSignal?: (data: any) => void;
}

const POLL_MS = 500;
const HEARTBEAT_MS = 1500;

export function useMeetingPeer({ token, role, iceServers, enabled, onAppSignal }: Options) {
  const onAppSignalRef = useRef(onAppSignal);
  onAppSignalRef.current = onAppSignal;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<PeerStatus>('idle');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState('');

  // The host is "impolite" (wins glare); the patient is "polite" (rolls back).
  const polite = role === 'patient';

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const lastSignalId = useRef<string | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const makingOffer = useRef(false);
  const ignoreOffer = useRef(false);
  const sawRemote = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const disposed = useRef(false);

  const send = useCallback(
    (kind: Signal['kind'], data?: any) => sendSignal({ token, from: role, to: null, kind, data }),
    [token, role]
  );

  const markRemote = useCallback(() => {
    if (!sawRemote.current) {
      sawRemote.current = true;
      setStatus((s) => (s === 'connected' ? s : 'connecting'));
    }
  }, []);

  const flushCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const queued = pendingCandidates.current;
    pendingCandidates.current = [];
    for (const c of queued) {
      try { await pc.addIceCandidate(c); } catch (err) { if (!ignoreOffer.current) console.error('addIceCandidate(flush)', err); }
    }
  }, []);

  const handleSignal = useCallback(
    async (sig: Signal) => {
      const pc = pcRef.current;
      if (!pc) return;

      switch (sig.kind) {
        case 'join': {
          // Presence only — perfect negotiation drives offers via
          // onnegotiationneeded, so we don't manually offer here.
          markRemote();
          break;
        }
        case 'sdp': {
          markRemote();
          const description = sig.data as RTCSessionDescriptionInit;
          const offerCollision =
            description.type === 'offer' && (makingOffer.current || pc.signalingState !== 'stable');
          ignoreOffer.current = !polite && offerCollision;
          if (ignoreOffer.current) return; // impolite peer ignores a colliding offer
          try {
            // Polite peer: setRemoteDescription implicitly rolls back its own
            // offer on collision (modern browsers), so m-lines stay consistent.
            await pc.setRemoteDescription(description);
            await flushCandidates();
            if (description.type === 'offer') {
              await pc.setLocalDescription(); // implicit createAnswer
              send('sdp', pc.localDescription);
            }
          } catch (err) {
            console.error('sdp handling error', err);
          }
          break;
        }
        case 'ice': {
          markRemote();
          if (pc.remoteDescription) {
            try { await pc.addIceCandidate(sig.data); } catch (err) { if (!ignoreOffer.current) console.error('addIceCandidate', err); }
          } else {
            pendingCandidates.current.push(sig.data);
          }
          break;
        }
        case 'bye': {
          sawRemote.current = false;
          setRemoteStream(null);
          setStatus('waiting');
          break;
        }
        case 'ai': {
          onAppSignalRef.current?.(sig.data);
          break;
        }
        // 'knock' / 'admit' / 'deny' are lobby-only — ignored by the media peer.
        default:
          break;
      }
    },
    [polite, flushCandidates, send, markRemote]
  );

  const poll = useCallback(async () => {
    if (disposed.current) return;
    const signals = await pollSignals(token, role, lastSignalId.current);
    for (const sig of signals) {
      lastSignalId.current = sig.id;
      // eslint-disable-next-line no-await-in-loop
      await handleSignal(sig).catch((e) => console.error('handleSignal error', e));
    }
    if (!disposed.current) pollTimer.current = setTimeout(poll, POLL_MS);
  }, [token, role, handleSignal]);

  useEffect(() => {
    if (!enabled) return;
    disposed.current = false;
    let active = true;
    setStatus('connecting');
    setError('');
    sawRemote.current = false;
    lastSignalId.current = null;
    makingOffer.current = false;
    ignoreOffer.current = false;

    (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: true,
        });
      } catch (err) {
        console.error('getUserMedia error', err);
        if (active) {
          setError('Allow camera & microphone access to join. (On phones the link must be opened over HTTPS.)');
          setStatus('failed');
        }
        return;
      }
      if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }

      localRef.current = stream;
      setLocalStream(stream);
      stream.getAudioTracks().forEach((t) => (t.enabled = micOn));
      stream.getVideoTracks().forEach((t) => (t.enabled = camOn));

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      // Perfect-negotiation handlers.
      pc.onnegotiationneeded = async () => {
        try {
          makingOffer.current = true;
          await pc.setLocalDescription(); // implicit createOffer
          send('sdp', pc.localDescription);
        } catch (err) {
          console.error('onnegotiationneeded error', err);
        } finally {
          makingOffer.current = false;
        }
      };
      pc.onicecandidate = (e) => { if (e.candidate) send('ice', e.candidate.toJSON()); };
      pc.ontrack = (e) => { const [s] = e.streams; if (s) setRemoteStream(s); };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'connected') setStatus('connected');
        else if (st === 'failed') setStatus('failed');
        else if (st === 'disconnected') setStatus('connecting');
      };
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          // Renegotiate a fresh path without tearing down media.
          try { pc.restartIce(); } catch { /* older browsers */ }
        }
      };

      // Adding tracks fires onnegotiationneeded → the initial offer is created
      // and broadcast; whoever joins later picks it up from the relay.
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // Host starts from a clean slate so stale SDP/candidates from an earlier
      // attempt can't confuse this negotiation.
      if (!polite) await clearSignals(token);
      if (!active) return;

      setStatus('waiting');
      await send('join', { role });
      poll();

      heartbeatTimer.current = setInterval(() => {
        if (disposed.current) return;
        if (pcRef.current?.connectionState !== 'connected') send('join', { role });
      }, HEARTBEAT_MS);
    })();

    return () => {
      active = false;
      disposed.current = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      send('bye').catch(() => {});
      pcRef.current?.close();
      pcRef.current = null;
      localRef.current?.getTracks().forEach((t) => t.stop());
      localRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token, role]);

  const toggleMic = useCallback(() => {
    const s = localRef.current; if (!s) return;
    const next = !micOn; s.getAudioTracks().forEach((t) => (t.enabled = next)); setMicOn(next);
  }, [micOn]);

  const toggleCam = useCallback(() => {
    const s = localRef.current; if (!s) return;
    const next = !camOn; s.getVideoTracks().forEach((t) => (t.enabled = next)); setCamOn(next);
  }, [camOn]);

  const sendApp = useCallback((data: any) => send('ai', data), [send]);

  return { localStream, remoteStream, status, micOn, camOn, toggleMic, toggleCam, error, sendApp, peerId: role };
}
