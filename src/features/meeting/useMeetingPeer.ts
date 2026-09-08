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
//
// Phase-1 additions (all keep the 1:1 handshake above intact):
//   • Media is OPTIONAL — a denied/absent camera or mic no longer fails the join;
//     the peer connects with whatever tracks exist (or none).
//   • Initial mic/cam enabled state is caller-controlled (OFF by default, chosen
//     on the pre-join screen).
//   • Screen share swaps the outgoing VIDEO track via replaceTrack (no
//     renegotiation needed — same kind), and restores the camera track on stop.
//   • Chat + remote screen-share state ride the SAME poll loop as a new signal
//     `kind` ('chat' / 'screen'), so no extra pollers are spun up.
//   • A distinct 'reconnecting' status is surfaced once a live call drops, so the
//     UI can show recovery instead of a cold "connecting".

export type PeerStatus = 'idle' | 'connecting' | 'waiting' | 'connected' | 'reconnecting' | 'failed';

export interface ChatMessage {
  from: 'staff' | 'patient' | string;
  name: string;
  text: string;
  at: number;
}

interface Options {
  token: string;
  role: 'staff' | 'patient';
  iceServers: IceServer[];
  enabled: boolean;
  // Initial device state chosen on the pre-join screen (OFF by default).
  initialMicOn?: boolean;
  initialCamOn?: boolean;
  onAppSignal?: (data: any) => void;
  onChat?: (msg: ChatMessage) => void;
  // Remote peer started/stopped sharing their screen.
  onRemoteScreen?: (sharing: boolean) => void;
}

const POLL_MS = 500;
const HEARTBEAT_MS = 1500;
const OFFER_STUCK_MS = 6000;

export function useMeetingPeer({
  token, role, iceServers, enabled, initialMicOn = false, initialCamOn = false,
  onAppSignal, onChat, onRemoteScreen,
}: Options) {
  const onAppSignalRef = useRef(onAppSignal); onAppSignalRef.current = onAppSignal;
  const onChatRef = useRef(onChat); onChatRef.current = onChat;
  const onRemoteScreenRef = useRef(onRemoteScreen); onRemoteScreenRef.current = onRemoteScreen;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<PeerStatus>('idle');
  const [micOn, setMicOn] = useState(initialMicOn);
  const [camOn, setCamOn] = useState(initialCamOn);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [error, setError] = useState('');

  const isHost = role === 'staff'; // the sole offerer

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  // The original camera video track, kept referenced across a screen share so it
  // can be restored (and so its enabled state survives the swap).
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const lastSignalId = useRef<string | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const lastOfferAt = useRef(0);
  const sawRemote = useRef(false);
  const wasConnected = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const disposed = useRef(false);
  // Read-through refs so the media effect (which runs once per enable) always
  // sees the caller's latest initial-device choice without re-subscribing.
  const initialMicRef = useRef(initialMicOn); initialMicRef.current = initialMicOn;
  const initialCamRef = useRef(initialCamOn); initialCamRef.current = initialCamOn;

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
    if (pc.connectionState === 'connected' && !iceRestart) return;
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
          onRemoteScreenRef.current?.(false);
          setStatus('waiting');
          break;
        }
        case 'ai': {
          onAppSignalRef.current?.(sig.data);
          break;
        }
        case 'chat': {
          if (sig.data && typeof sig.data.text === 'string') {
            onChatRef.current?.({
              from: sig.from,
              name: String(sig.data.name || (sig.from === 'staff' ? 'Host' : 'Patient')),
              text: String(sig.data.text),
              at: Number(sig.data.at) || Date.now(),
            });
          }
          break;
        }
        case 'screen': {
          onRemoteScreenRef.current?.(!!sig.data?.on);
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
    wasConnected.current = false;
    lastSignalId.current = null;
    lastOfferAt.current = 0;
    pendingCandidates.current = [];

    (async () => {
      // Media is OPTIONAL. A denied/missing camera or mic must NOT block the
      // join — the meeting still works (view/listen only). We try once for both,
      // then continue with whatever we got (possibly nothing).
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: true,
        });
      } catch (err) {
        console.warn('getUserMedia unavailable, joining without local media', err);
        if (active) {
          setError('Joined without camera/microphone. Enable them from the controls if your browser allows.');
        }
      }
      if (!active) { stream?.getTracks().forEach((t) => t.stop()); return; }

      if (stream) {
        localRef.current = stream;
        setLocalStream(stream);
        cameraTrackRef.current = stream.getVideoTracks()[0] || null;
        // Apply the pre-join device choices (OFF by default).
        stream.getAudioTracks().forEach((t) => (t.enabled = initialMicRef.current));
        stream.getVideoTracks().forEach((t) => (t.enabled = initialCamRef.current));
        setMicOn(stream.getAudioTracks().length ? initialMicRef.current : false);
        setCamOn(stream.getVideoTracks().length ? initialCamRef.current : false);
      } else {
        setMicOn(false);
        setCamOn(false);
      }

      // Host clears the relay BEFORE creating the connection, so no offer we make
      // can ever be wiped by our own clear (the earlier dead-lock).
      if (isHost) await clearSignals(token);
      if (!active) { stream?.getTracks().forEach((t) => t.stop()); return; }

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      // No onnegotiationneeded handler on purpose: offers are driven explicitly
      // by the host on patient 'join', never automatically (which would offer
      // into an empty room and cause glare).
      pc.onicecandidate = (e) => { if (e.candidate) send('ice', e.candidate.toJSON()); };
      pc.ontrack = (e) => { const [s] = e.streams; if (s) setRemoteStream(s); };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'connected') { wasConnected.current = true; setStatus('connected'); }
        else if (st === 'failed') setStatus('failed');
        else if (st === 'disconnected') setStatus(wasConnected.current ? 'reconnecting' : 'connecting');
      };
      pc.oniceconnectionstatechange = () => {
        // Recover a failed connection: the host re-offers with an ICE restart
        // (fresh candidates/relay path) without tearing down the media tracks.
        if (pc.iceConnectionState === 'failed' && isHost) makeOffer(true);
      };

      // Ensure a VIDEO transceiver exists even when the camera is off/absent, so
      // the host can start a screen share later without a full renegotiation
      // (replaceTrack only works if a sender of that kind is already there).
      if (stream) {
        stream.getTracks().forEach((t) => pc.addTrack(t, stream!));
        if (!stream.getVideoTracks().length) {
          try { pc.addTransceiver('video', { direction: 'sendrecv' }); } catch { /* ignore */ }
        }
      } else {
        try { pc.addTransceiver('video', { direction: 'sendrecv' }); } catch { /* ignore */ }
        try { pc.addTransceiver('audio', { direction: 'sendrecv' }); } catch { /* ignore */ }
      }

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
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      localRef.current?.getTracks().forEach((t) => t.stop());
      localRef.current = null;
      cameraTrackRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token, role]);

  // Acquire a single kind of media on demand (used when the user turns on a
  // device they joined without, e.g. permission was granted after joining).
  const acquireKind = useCallback(async (kind: 'audio' | 'video') => {
    try {
      const constraints: MediaStreamConstraints = kind === 'video'
        ? { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } }
        : { audio: true };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      const track = kind === 'video' ? s.getVideoTracks()[0] : s.getAudioTracks()[0];
      if (!track) return false;
      const pc = pcRef.current;
      let local = localRef.current;
      if (!local) { local = new MediaStream(); localRef.current = local; }
      local.addTrack(track);
      setLocalStream(new MediaStream(local.getTracks()));
      if (kind === 'video') cameraTrackRef.current = track;
      // Attach to an existing empty sender if possible; otherwise addTrack.
      if (pc) {
        const sender = pc.getSenders().find((sn) => (sn.track?.kind ?? (kind === 'video' ? 'video' : 'audio')) === kind && !sn.track);
        if (sender) { try { await sender.replaceTrack(track); } catch { pc.addTrack(track, local); } }
        else {
          const kindSender = pc.getSenders().find((sn) => sn.track?.kind === kind);
          if (!kindSender) { pc.addTrack(track, local); if (isHost) makeOffer(); }
          else { try { await kindSender.replaceTrack(track); } catch { /* ignore */ } }
        }
      }
      return true;
    } catch (err) {
      console.warn('acquireKind failed', kind, err);
      setError(kind === 'video' ? 'Camera unavailable or blocked.' : 'Microphone unavailable or blocked.');
      return false;
    }
  }, [isHost, makeOffer]);

  const toggleMic = useCallback(() => {
    const s = localRef.current;
    const track = s?.getAudioTracks()[0];
    if (track) { const next = !micOn; track.enabled = next; setMicOn(next); return; }
    // No mic track yet — try to acquire one now, then enable it.
    acquireKind('audio').then((ok) => { if (ok) setMicOn(true); });
  }, [micOn, acquireKind]);

  const toggleCam = useCallback(() => {
    const track = cameraTrackRef.current || localRef.current?.getVideoTracks()[0];
    if (track) { const next = !camOn; track.enabled = next; setCamOn(next); return; }
    acquireKind('video').then((ok) => { if (ok) setCamOn(true); });
  }, [camOn, acquireKind]);

  // Screen share: swap the outgoing video track for a display capture, restore
  // the camera track on stop. replaceTrack keeps the SAME m-line/sender, so no
  // renegotiation is needed and the remote transparently sees the new content.
  const startScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || sharingScreen) return;
    let display: MediaStream;
    try {
      display = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
    } catch (err) {
      console.warn('getDisplayMedia cancelled/failed', err);
      return;
    }
    const screenTrack = display.getVideoTracks()[0];
    if (!screenTrack) { display.getTracks().forEach((t) => t.stop()); return; }
    screenTrackRef.current = screenTrack;
    const sender = pc.getSenders().find((sn) => sn.track?.kind === 'video')
      || pc.getSenders().find((sn) => !sn.track); // empty video sender (cam-off join)
    try {
      if (sender) await sender.replaceTrack(screenTrack);
      else { pc.addTrack(screenTrack, display); if (isHost) makeOffer(); }
    } catch (err) { console.error('replaceTrack(screen) error', err); }
    setScreenStream(display);
    setSharingScreen(true);
    send('screen', { on: true });
    // Stopping via the browser's native "Stop sharing" bar ends it too.
    screenTrack.onended = () => stopScreenShare();
  }, [sharingScreen, isHost, makeOffer, send]);

  const stopScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    const screenTrack = screenTrackRef.current;
    if (screenTrack) { screenTrack.onended = null; screenTrack.stop(); }
    screenTrackRef.current = null;
    if (pc) {
      const sender = pc.getSenders().find((sn) => sn.track === screenTrack)
        || pc.getSenders().find((sn) => sn.track?.kind === 'video')
        || pc.getSenders().find((sn) => !sn.track);
      const cam = cameraTrackRef.current;
      try { if (sender) await sender.replaceTrack(cam ?? null); } catch (err) { console.error('replaceTrack(restore) error', err); }
    }
    setScreenStream(null);
    setSharingScreen(false);
    send('screen', { on: false });
  }, [send]);

  const toggleScreenShare = useCallback(() => {
    if (sharingScreen) void stopScreenShare();
    else void startScreenShare();
  }, [sharingScreen, startScreenShare, stopScreenShare]);

  const sendApp = useCallback((data: any) => send('ai', data), [send]);
  const sendChat = useCallback((data: { name: string; text: string; at: number }) => send('chat', data), [send]);

  return {
    localStream, remoteStream, screenStream,
    status, micOn, camOn, sharingScreen,
    toggleMic, toggleCam, toggleScreenShare,
    error, sendApp, sendChat, peerId: role,
  };
}
