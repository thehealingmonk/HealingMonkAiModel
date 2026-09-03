import { useCallback, useEffect, useRef, useState } from 'react';
import type { IceServer } from '@/services/api';
import { sendSignal, pollSignals, Signal } from '@/features/meeting/signaling';

// A 1:1 WebRTC peer connection driven by the Mongo-polled signaling relay.
//
// Negotiation is glare-free by role: the STAFF side is the sole offerer, the
// PATIENT side only ever answers. Presence is exchanged with a join/presence
// handshake so the two peers discover each other regardless of who opened the
// link first. ICE candidates that arrive before the remote description is set
// are queued. On ICE failure the offerer restarts ICE automatically.

export type PeerStatus = 'idle' | 'connecting' | 'waiting' | 'connected' | 'failed';

interface Options {
  token: string;
  role: 'staff' | 'patient';
  iceServers: IceServer[];
  // Off until the caller resolves the room and passes real ice servers.
  enabled: boolean;
  // Optional app-level messages over the same channel (e.g. staff telling the
  // patient the AI assessment just started/stopped).
  onAppSignal?: (data: any) => void;
}

const POLL_MS = 800;

function randomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useMeetingPeer({ token, role, iceServers, enabled, onAppSignal }: Options) {
  // Keep the latest callback in a ref so the stable poll/handler closures always
  // call the current one without re-subscribing.
  const onAppSignalRef = useRef(onAppSignal);
  onAppSignalRef.current = onAppSignal;
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<PeerStatus>('idle');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState('');

  const peerId = useRef<string>(randomId());
  const remotePeerId = useRef<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const lastSignalId = useRef<string | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const makingOffer = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);

  const isOfferer = role === 'staff';

  const send = useCallback(
    (kind: Signal['kind'], data?: any, to?: string | null) =>
      sendSignal({ token, from: peerId.current, to: to ?? remotePeerId.current, kind, data }),
    [token]
  );

  // Build the peer connection, wiring ICE, track and (re)connection handlers.
  const createPc = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (e) => {
      if (e.candidate) send('ice', e.candidate.toJSON());
    };

    pc.ontrack = (e) => {
      // The remote stream is the same object across tracks; adopt it once.
      const [stream] = e.streams;
      if (stream) setRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') setStatus('connected');
      else if (st === 'connecting' || st === 'new') setStatus((s) => (s === 'connected' ? s : 'connecting'));
      else if (st === 'failed') setStatus('failed');
    };

    pc.oniceconnectionstatechange = () => {
      // Recover a dropped connection: the offerer restarts ICE, which renegotiates
      // a fresh path (e.g. after a network switch) without tearing down media.
      if ((pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') && isOfferer) {
        makeOffer(true);
      }
    };

    return pc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iceServers, isOfferer, send]);

  // Offerer only: create/refresh the offer and push it to the patient.
  const makeOffer = useCallback(
    async (iceRestart = false) => {
      const pc = pcRef.current;
      if (!pc || !isOfferer) return;
      try {
        makingOffer.current = true;
        const offer = await pc.createOffer({ iceRestart });
        if (pc.signalingState !== 'stable' && !iceRestart) return;
        await pc.setLocalDescription(offer);
        send('offer', pc.localDescription);
      } catch (err) {
        console.error('makeOffer error', err);
      } finally {
        makingOffer.current = false;
      }
    },
    [isOfferer, send]
  );

  const flushCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const queued = pendingCandidates.current;
    pendingCandidates.current = [];
    for (const c of queued) {
      try {
        await pc.addIceCandidate(c);
      } catch (err) {
        console.error('addIceCandidate (flush) error', err);
      }
    }
  }, []);

  // Handle one inbound signal.
  const handleSignal = useCallback(
    async (sig: Signal) => {
      const pc = pcRef.current;
      if (!pc) return;

      // Learn the peer's id from the first thing we hear from them.
      if (!remotePeerId.current && sig.from) remotePeerId.current = sig.from;

      switch (sig.kind) {
        case 'join': {
          // Someone (re)joined. Acknowledge with our presence so they learn our
          // id, then — if we're the offerer — (re)start negotiation.
          remotePeerId.current = sig.from;
          await send('presence', { role }, sig.from);
          if (isOfferer) makeOffer();
          break;
        }
        case 'presence': {
          remotePeerId.current = sig.from;
          if (isOfferer && pc.signalingState === 'stable') makeOffer();
          break;
        }
        case 'offer': {
          if (isOfferer) break; // offerer never accepts an offer (no glare)
          await pc.setRemoteDescription(new RTCSessionDescription(sig.data));
          await flushCandidates();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send('answer', pc.localDescription);
          break;
        }
        case 'answer': {
          if (!isOfferer) break;
          await pc.setRemoteDescription(new RTCSessionDescription(sig.data));
          await flushCandidates();
          break;
        }
        case 'ice': {
          if (pc.remoteDescription) {
            try {
              await pc.addIceCandidate(sig.data);
            } catch (err) {
              console.error('addIceCandidate error', err);
            }
          } else {
            pendingCandidates.current.push(sig.data);
          }
          break;
        }
        case 'bye': {
          // The other side left; drop the remote view but keep our media so the
          // room can reconnect if they come back.
          remotePeerId.current = null;
          setRemoteStream(null);
          setStatus('waiting');
          break;
        }
        case 'ai': {
          onAppSignalRef.current?.(sig.data);
          break;
        }
        default:
          break;
      }
    },
    [role, isOfferer, makeOffer, flushCandidates, send]
  );

  // Poll loop for inbound signals.
  const poll = useCallback(async () => {
    if (disposed.current) return;
    const signals = await pollSignals(token, peerId.current, lastSignalId.current);
    for (const sig of signals) {
      lastSignalId.current = sig.id;
      // Guard against errors in one message stalling the batch.
      // eslint-disable-next-line no-await-in-loop
      await handleSignal(sig).catch((e) => console.error('handleSignal error', e));
    }
    if (!disposed.current) pollTimer.current = setTimeout(poll, POLL_MS);
  }, [token, handleSignal]);

  // Boot: acquire media, build the connection, announce presence, start polling.
  useEffect(() => {
    if (!enabled) return;
    disposed.current = false;
    setStatus('connecting');

    (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: true,
        });
      } catch (err) {
        console.error('getUserMedia error', err);
        setError('Camera/microphone permission is required to join the meeting.');
        setStatus('failed');
        return;
      }
      if (disposed.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localRef.current = stream;
      setLocalStream(stream);

      const pc = createPc();
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      setStatus('waiting');
      // Announce we're here; the other side answers with presence and, if we're
      // the offerer, negotiation begins.
      await send('join', { role });
      poll();
    })();

    return () => {
      disposed.current = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      // Best-effort notify the peer, then tear down.
      send('bye').catch(() => {});
      pcRef.current?.close();
      pcRef.current = null;
      localRef.current?.getTracks().forEach((t) => t.stop());
      localRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token]);

  const toggleMic = useCallback(() => {
    const s = localRef.current;
    if (!s) return;
    const next = !micOn;
    s.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  }, [micOn]);

  const toggleCam = useCallback(() => {
    const s = localRef.current;
    if (!s) return;
    const next = !camOn;
    s.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  }, [camOn]);

  // Broadcast an app-level message to the other peer (e.g. AI on/off state).
  const sendApp = useCallback((data: any) => send('ai', data, null), [send]);

  return {
    localStream,
    remoteStream,
    status,
    micOn,
    camOn,
    toggleMic,
    toggleCam,
    error,
    sendApp,
    peerId: peerId.current,
  };
}
