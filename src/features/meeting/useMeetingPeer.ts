import { useCallback, useEffect, useRef, useState } from 'react';
import type { IceServer } from '@/services/api';
import { sendSignal, pollSignals, clearSignals, Signal } from '@/features/meeting/signaling';

// A 1:1 WebRTC peer connection driven by the Mongo-polled signaling relay.
//
// Design goals: connect FAST and RELIABLY regardless of who opens the link
// first, and survive page refreshes that leave stale signals behind.
//
//  • Identity is the MEETING ROLE ('staff' | 'patient') — there is exactly one
//    of each in a 1:1 room, so we address everything by role and BROADCAST.
//    This removes fragile per-connection peer-id targeting (the source of
//    "stuck connecting" when a stale peer id from a previous tab was targeted).
//  • A JOIN HEARTBEAT is re-broadcast every ~1.5s until connected, so the two
//    sides always discover each other no matter the join order, and recover if
//    one refreshes.
//  • The STAFF (host) is the sole offerer; it clears the room's stale signals on
//    start and (re)offers whenever it sees the patient and isn't yet connected,
//    rolling back a stuck offer so negotiation never dead-ends.
//  • The async media boot is guarded by a per-run flag so React StrictMode's
//    mount→unmount→mount in dev can't stomp the live connection.

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
const OFFER_RETRY_MS = 4000;

export function useMeetingPeer({ token, role, iceServers, enabled, onAppSignal }: Options) {
  const onAppSignalRef = useRef(onAppSignal);
  onAppSignalRef.current = onAppSignal;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<PeerStatus>('idle');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState('');

  const isOfferer = role === 'staff';

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const lastSignalId = useRef<string | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const lastOfferAt = useRef(0);
  const sawRemote = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const disposed = useRef(false);

  // Broadcast a signal to the other role (from = our role).
  const send = useCallback(
    (kind: Signal['kind'], data?: any) => sendSignal({ token, from: role, to: null, kind, data }),
    [token, role]
  );

  const flushCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const queued = pendingCandidates.current;
    pendingCandidates.current = [];
    for (const c of queued) {
      try { await pc.addIceCandidate(c); } catch (err) { console.error('addIceCandidate(flush)', err); }
    }
  }, []);

  // Offerer only: (re)create the offer. Rolls back a stale, unanswered offer so a
  // dropped answer doesn't permanently wedge negotiation.
  const makeOffer = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !isOfferer) return;
    if (pc.connectionState === 'connected') return;
    const now = Date.now();
    if (pc.signalingState !== 'stable') {
      if (now - lastOfferAt.current < OFFER_RETRY_MS) return; // an offer is still pending
      try { await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit); } catch { /* not supported / not needed */ }
    }
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      lastOfferAt.current = Date.now();
      send('offer', pc.localDescription);
    } catch (err) {
      console.error('makeOffer error', err);
    }
  }, [isOfferer, send]);

  const handleSignal = useCallback(
    async (sig: Signal) => {
      const pc = pcRef.current;
      if (!pc) return;

      // Any message from the other side means they're here.
      if (!sawRemote.current) { sawRemote.current = true; setStatus((s) => (s === 'connected' ? s : 'connecting')); }

      switch (sig.kind) {
        case 'join': {
          // The other side is present — the offerer (re)starts negotiation.
          if (isOfferer) await makeOffer();
          break;
        }
        case 'offer': {
          if (isOfferer) break; // host never accepts an offer
          await pc.setRemoteDescription(new RTCSessionDescription(sig.data));
          await flushCandidates();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send('answer', pc.localDescription);
          break;
        }
        case 'answer': {
          if (!isOfferer) break;
          // Only accept an answer we're actually waiting for (ignore stale ones).
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(sig.data));
            await flushCandidates();
          }
          break;
        }
        case 'ice': {
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
        default:
          break;
      }
    },
    [isOfferer, makeOffer, flushCandidates, send]
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
    // Per-run guard so a StrictMode remount can't let this run's async work
    // touch the next run's connection.
    let active = true;
    setStatus('connecting');
    setError('');
    sawRemote.current = false;
    lastSignalId.current = null;
    lastOfferAt.current = 0;

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
      // Reflect current toggle intent onto the tracks.
      stream.getAudioTracks().forEach((t) => (t.enabled = micOn));
      stream.getVideoTracks().forEach((t) => (t.enabled = camOn));

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      pc.onicecandidate = (e) => { if (e.candidate) send('ice', e.candidate.toJSON()); };
      pc.ontrack = (e) => { const [s] = e.streams; if (s) setRemoteStream(s); };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'connected') setStatus('connected');
        else if (st === 'failed') setStatus('failed');
        else if (st === 'disconnected') setStatus('connecting');
      };
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed' && isOfferer) makeOffer();
      };

      // Host starts from a clean slate so stale signals from earlier attempts
      // can't confuse this negotiation.
      if (isOfferer) await clearSignals(token);
      if (!active) return;

      setStatus('waiting');
      await send('join', { role });
      poll();

      // Keep announcing presence until connected, so discovery/recovery is fast
      // regardless of who joined first or refreshed.
      heartbeatTimer.current = setInterval(() => {
        if (disposed.current) return;
        if (pcRef.current?.connectionState !== 'connected') {
          send('join', { role });
          if (isOfferer && sawRemote.current) makeOffer();
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
