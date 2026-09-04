import { useCallback, useEffect, useRef, useState } from 'react';
import type { IceServer } from '@/services/api';
import { sendSignal, pollSignals, clearSignals, Signal } from '@/features/meeting/signaling';

// A 1:1 WebRTC peer connection over the Mongo-polled signaling relay.
//
// Negotiation is intentionally DETERMINISTIC (not "perfect negotiation") because
// the two peers join at very different times via a waiting room, which made the
// symmetric both-offer approach dead-lock:
//
//   • ONLY the host (role 'staff') ever creates an offer, and ONLY once it has
//     actually seen the patient's media peer join — never into an empty room and
//     never off a lobby 'knock'. This removes glare and the "m-lines order in
//     answer doesn't match offer" error entirely.
//   • The PATIENT only ever answers.
//   • Signals are broadcast + role-addressed (exactly one 'staff' and one
//     'patient' per room; the server filters `from != peer`).
//   • A join heartbeat (1.5s) drives discovery/recovery: the host (re)offers on
//     each patient join while not connected, and rolls back a stuck, unanswered
//     offer so negotiation never dead-ends.
//   • ICE is queued until the remote description is set. StrictMode-safe boot.

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
const OFFER_STUCK_MS = 6000;

export function useMeetingPeer({ token, role, iceServers, enabled, onAppSignal }: Options) {
  const onAppSignalRef = useRef(onAppSignal);
  onAppSignalRef.current = onAppSignal;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<PeerStatus>('idle');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState('');

  const isHost = role === 'staff'; // the sole offerer

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const lastSignalId = useRef<string | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const lastOfferAt = useRef(0);
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
      try { await pc.addIceCandidate(c); } catch (err) { console.error('addIceCandidate(flush)', err); }
    }
  }, []);

  // Host only: create + broadcast an offer. Guards ensure exactly one clean
  // negotiation at a time so we never crash an in-flight connection or reorder
  // m-lines:
  //   • only from a 'stable' signalingState (no offer already pending),
  //   • not once connected,
  //   • and — crucially — NOT once we already have the patient's answer and ICE
  //     is progressing (that spurious re-offer used to reset a connecting call).
  //     `iceRestart` bypasses that last guard to recover a failed connection.
  const makeOffer = useCallback(async (iceRestart = false) => {
    const pc = pcRef.current;
    if (!pc || !isHost) return;
    if (pc.connectionState === 'connected') return;
    if (pc.signalingState !== 'stable') return; // an offer is already pending
    if (!iceRestart && pc.remoteDescription && pc.connectionState !== 'failed') return; // already negotiated
    try {
      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      await pc.setLocalDescription(offer);
      lastOfferAt.current = Date.now();
      send('sdp', pc.localDescription);
    } catch (err) {
      console.error('makeOffer error', err);
    }
  }, [isHost, send]);

  const handleSignal = useCallback(
    async (sig: Signal) => {
      const pc = pcRef.current;
      if (!pc) return;

      switch (sig.kind) {
        case 'join': {
          // The other media peer is here. The host offers; the patient waits.
          markRemote();
          if (isHost) await makeOffer();
          break;
        }
        case 'sdp': {
          const desc = sig.data as RTCSessionDescriptionInit;
          if (desc.type === 'offer') {
            // Only the patient answers offers (the host never offers to itself).
            if (isHost) break;
            markRemote();
            await pc.setRemoteDescription(desc);
            await flushCandidates();
            await pc.setLocalDescription(); // implicit createAnswer
            send('sdp', pc.localDescription);
          } else if (desc.type === 'answer') {
            if (!isHost) break;
            markRemote();
            // Only accept an answer we're actually waiting for (drops stale ones,
            // which is what prevents the m-line mismatch error).
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(desc);
              await flushCandidates();
            }
          }
          break;
        }
        case 'ice': {
          markRemote();
          if (pc.remoteDescription) {
            try { await pc.addIceCandidate(sig.data); } catch (err) { console.error('addIceCandidate', err); }
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
    [isHost, makeOffer, flushCandidates, send, markRemote]
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
    lastOfferAt.current = 0;
    pendingCandidates.current = [];

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

      // Host clears the relay BEFORE creating the connection, so no offer we make
      // can ever be wiped by our own clear (the earlier dead-lock).
      if (isHost) await clearSignals(token);
      if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      // No onnegotiationneeded handler on purpose: offers are driven explicitly
      // by the host on patient 'join', never automatically (which would offer
      // into an empty room and cause glare).
      pc.onicecandidate = (e) => { if (e.candidate) send('ice', e.candidate.toJSON()); };
      pc.ontrack = (e) => { const [s] = e.streams; if (s) setRemoteStream(s); };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'connected') setStatus('connected');
        else if (st === 'failed') setStatus('failed');
        else if (st === 'disconnected') setStatus('connecting');
      };
      pc.oniceconnectionstatechange = () => {
        // Recover a failed connection: the host re-offers with an ICE restart
        // (fresh candidates/relay path) without tearing down the media tracks.
        if (pc.iceConnectionState === 'failed' && isHost) makeOffer(true);
      };

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      setStatus('waiting');
      await send('join', { role });
      poll();

      heartbeatTimer.current = setInterval(async () => {
        if (disposed.current) return;
        const cur = pcRef.current;
        if (!cur || cur.connectionState === 'connected') return;
        // Keep announcing presence so the peer discovers us / recovers.
        send('join', { role });
        if (isHost) {
          // Recover a stuck, unanswered offer, then (re)offer once we know the
          // patient is present.
          if (cur.signalingState === 'have-local-offer' && Date.now() - lastOfferAt.current > OFFER_STUCK_MS) {
            try { await cur.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit); } catch { /* ignore */ }
          }
          if (cur.signalingState === 'stable' && sawRemote.current) await makeOffer();
        }
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
