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
// Reliability layer (all keep the 1:1 handshake above intact):
//   • Media is OPTIONAL — a denied/absent camera or mic no longer fails the join.
//   • Initial mic/cam enabled state is caller-controlled (OFF by default).
//   • Screen share swaps the outgoing VIDEO track via replaceTrack (no
//     renegotiation) and restores the camera on stop.
//   • Chat + remote screen-share state ride the SAME poll loop.
//   • RECONNECTION: a live call that drops to 'disconnected' gets a short grace
//     window, then the host triggers an ICE RESTART (fresh candidates / relay
//     path) without tearing down media. A 'failed' state restarts immediately.
//     Network changes (Wi-Fi↔mobile, sleep/wake) also trigger an ICE restart via
//     the browser 'online' event.
//   • ADAPTIVE VIDEO: outgoing video bitrate/degradation is tuned to the measured
//     connection so weak networks degrade video gracefully while audio survives.
//   • QUALITY: real WebRTC getStats (RTT, packet loss, jitter) drives an honest
//     Excellent/Good/Fair/Poor signal — never a fake timer.

export type PeerStatus = 'idle' | 'connecting' | 'waiting' | 'connected' | 'reconnecting' | 'failed';
export type PeerQuality = 'unknown' | 'excellent' | 'good' | 'fair' | 'poor';

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

const POLL_MS = 400;              // signaling poll cadence (faster = quicker setup)
const HEARTBEAT_MS = 1500;
const OFFER_STUCK_MS = 6000;
const STATS_MS = 3000;            // connection-quality sampling cadence
const DISCONNECT_GRACE_MS = 3500; // wait this long on 'disconnected' before ICE restart

// Adaptive outgoing-video ceilings per measured quality tier (bits/sec). Audio
// is never capped, so it stays intelligible as video degrades.
const VIDEO_BITRATE: Record<Exclude<PeerQuality, 'unknown'>, number> = {
  excellent: 1_500_000,
  good: 900_000,
  fair: 400_000,
  poor: 150_000,
};

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
  const [quality, setQuality] = useState<PeerQuality>('unknown');
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
  const statsTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);
  // Quality bookkeeping across stats samples.
  const prevStats = useRef<{ lost: number; recv: number } | null>(null);
  const appliedTier = useRef<PeerQuality>('unknown');
  const sharingRef = useRef(false); sharingRef.current = sharingScreen;
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
  //   • not once connected (unless iceRestart),
  //   • and — crucially — NOT once we already have the patient's answer and ICE
  //     is progressing. `iceRestart` bypasses that guard to recover a call.
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
      if (iceRestart) console.info('[meeting] host issued ICE restart');
    } catch (err) {
      console.error('makeOffer error', err);
    }
  }, [isHost, send]);

  // Apply an outgoing-video bitrate ceiling + a degradation preference that keeps
  // audio/framerate sane under pressure. Called whenever the measured tier moves.
  const applyVideoTier = useCallback(async (tier: Exclude<PeerQuality, 'unknown'>) => {
    const pc = pcRef.current;
    if (!pc) return;
    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (!sender) return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].maxBitrate = VIDEO_BITRATE[tier];
      // Poor networks: also cap the capture scale so encoder isn't overwhelmed.
      params.encodings[0].scaleResolutionDownBy = tier === 'poor' ? 2 : 1;
      (params as any).degradationPreference = 'balanced';
      await sender.setParameters(params);
    } catch (err) {
      // setParameters can reject if encodings shape changed mid-negotiation — the
      // next sample retries, so this is non-fatal.
      console.debug('applyVideoTier skipped', err);
    }
  }, []);

  // Sample real WebRTC stats and derive an honest quality tier from RTT + inbound
  // packet loss. Also nudges the adaptive video bitrate when the tier changes.
  const sampleQuality = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || pc.connectionState !== 'connected') return;
    let rtt = 0;
    let lost = 0;
    let recv = 0;
    try {
      const stats = await pc.getStats();
      stats.forEach((r: any) => {
        if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) {
          if (typeof r.currentRoundTripTime === 'number') rtt = r.currentRoundTripTime;
        }
        if (r.type === 'remote-inbound-rtp' && typeof r.roundTripTime === 'number' && !rtt) {
          rtt = r.roundTripTime;
        }
        if (r.type === 'inbound-rtp' && !r.isRemote) {
          lost += r.packetsLost || 0;
          recv += r.packetsReceived || 0;
        }
      });
    } catch { return; }

    // Loss over the last interval (delta), guarding the first sample.
    let lossFrac = 0;
    if (prevStats.current) {
      const dLost = Math.max(0, lost - prevStats.current.lost);
      const dRecv = Math.max(0, recv - prevStats.current.recv);
      const total = dLost + dRecv;
      if (total > 0) lossFrac = dLost / total;
    }
    prevStats.current = { lost, recv };

    const rttTier: PeerQuality = rtt < 0.15 ? 'excellent' : rtt < 0.3 ? 'good' : rtt < 0.5 ? 'fair' : 'poor';
    const lossTier: PeerQuality = lossFrac < 0.02 ? 'excellent' : lossFrac < 0.05 ? 'good' : lossFrac < 0.1 ? 'fair' : 'poor';
    const order: PeerQuality[] = ['excellent', 'good', 'fair', 'poor'];
    const tier = order[Math.max(order.indexOf(rttTier), order.indexOf(lossTier))];

    setQuality(tier);
    if (tier !== 'unknown' && tier !== appliedTier.current) {
      appliedTier.current = tier;
      void applyVideoTier(tier as Exclude<PeerQuality, 'unknown'>);
    }
  }, [applyVideoTier]);

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
          setQuality('unknown');
          prevStats.current = null;
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
    setQuality('unknown');
    sawRemote.current = false;
    wasConnected.current = false;
    lastSignalId.current = null;
    lastOfferAt.current = 0;
    pendingCandidates.current = [];
    prevStats.current = null;
    appliedTier.current = 'unknown';

    (async () => {
      // Media is OPTIONAL. A denied/missing camera or mic must NOT block the
      // join — the meeting still works (view/listen only). We try once for both,
      // then continue with whatever we got (possibly nothing). Errors are mapped
      // to a clear, actionable message per DOMException name.
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (err) {
        console.warn('getUserMedia unavailable, joining without local media', err);
        if (active) setError(mediaErrorMessage(err));
      }
      if (!active) { stream?.getTracks().forEach((t) => t.stop()); return; }

      if (stream) {
        localRef.current = stream;
        setLocalStream(stream);
        cameraTrackRef.current = stream.getVideoTracks()[0] || null;
        // Hint the encoder that this is camera motion (helps rate control).
        stream.getVideoTracks().forEach((t) => { try { (t as any).contentHint = 'motion'; } catch { /* ignore */ } });
        stream.getAudioTracks().forEach((t) => { try { (t as any).contentHint = 'speech'; } catch { /* ignore */ } });
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

      const pc = new RTCPeerConnection({
        iceServers,
        // Pre-gather a small pool so the first offer already carries candidates,
        // shaving a round-trip off setup on the polled relay.
        iceCandidatePoolSize: 4,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      });
      pcRef.current = pc;

      // No onnegotiationneeded handler on purpose: offers are driven explicitly
      // by the host on patient 'join', never automatically (which would offer
      // into an empty room and cause glare).
      pc.onicecandidate = (e) => { if (e.candidate) send('ice', e.candidate.toJSON()); };
      pc.ontrack = (e) => { const [s] = e.streams; if (s) setRemoteStream(s); };

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'connected') {
          wasConnected.current = true;
          if (disconnectTimer.current) { clearTimeout(disconnectTimer.current); disconnectTimer.current = null; }
          setStatus('connected');
          logSelectedCandidate(pc);
        } else if (st === 'failed') {
          setStatus('failed');
          // Recover immediately: fresh candidates / relay path, media intact.
          if (isHost) makeOffer(true);
        } else if (st === 'disconnected') {
          setStatus(wasConnected.current ? 'reconnecting' : 'connecting');
          // A transient blip often self-heals; give it a grace window, then the
          // host forces an ICE restart rather than waiting for 'failed' (which
          // some browsers never reach, e.g. iOS Safari on network switch).
          if (!disconnectTimer.current) {
            disconnectTimer.current = setTimeout(() => {
              disconnectTimer.current = null;
              const cur = pcRef.current;
              if (cur && cur.connectionState !== 'connected' && isHost) makeOffer(true);
            }, DISCONNECT_GRACE_MS);
          }
        }
      };
      pc.oniceconnectionstatechange = () => {
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

      statsTimer.current = setInterval(() => { void sampleQuality(); }, STATS_MS);
    })();

    // Network came back (Wi-Fi↔mobile, sleep/wake, router reconnect): force a
    // fresh ICE gather so the call re-homes onto the new path automatically.
    const onOnline = () => {
      const cur = pcRef.current;
      if (!cur) return;
      if (cur.connectionState !== 'connected') {
        setStatus(wasConnected.current ? 'reconnecting' : 'connecting');
        send('join', { role });
        if (isHost) makeOffer(true);
      }
    };
    const onOffline = () => {
      if (wasConnected.current) setStatus('reconnecting');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      active = false;
      disposed.current = true;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      if (statsTimer.current) clearInterval(statsTimer.current);
      if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
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
        ? { video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' } }
        : { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      const track = kind === 'video' ? s.getVideoTracks()[0] : s.getAudioTracks()[0];
      if (!track) return false;
      try { (track as any).contentHint = kind === 'video' ? 'motion' : 'speech'; } catch { /* ignore */ }
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
        // Re-apply the current bitrate tier to the (new) video sender.
        if (kind === 'video' && appliedTier.current !== 'unknown') {
          void applyVideoTier(appliedTier.current as Exclude<PeerQuality, 'unknown'>);
        }
      }
      setError('');
      return true;
    } catch (err) {
      console.warn('acquireKind failed', kind, err);
      setError(mediaErrorMessage(err, kind));
      return false;
    }
  }, [isHost, makeOffer, applyVideoTier]);

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
    try { (screenTrack as any).contentHint = 'detail'; } catch { /* ignore */ }
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
    if (sharingRef.current) void stopScreenShare();
    else void startScreenShare();
  }, [startScreenShare, stopScreenShare]);

  const sendApp = useCallback((data: any) => send('ai', data), [send]);
  const sendChat = useCallback((data: { name: string; text: string; at: number }) => send('chat', data), [send]);

  return {
    localStream, remoteStream, screenStream,
    status, quality, micOn, camOn, sharingScreen,
    toggleMic, toggleCam, toggleScreenShare,
    error, sendApp, sendChat, peerId: role,
  };
}

// Map a getUserMedia DOMException to a clear, actionable message.
function mediaErrorMessage(err: unknown, kind?: 'audio' | 'video'): string {
  const name = (err as any)?.name || '';
  const dev = kind === 'audio' ? 'microphone' : kind === 'video' ? 'camera' : 'camera/microphone';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `${cap(dev)} permission is blocked. Allow it from the padlock in the address bar, then retry.`;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return `No ${dev} was detected on this device. You can still join to view and listen.`;
    case 'NotReadableError':
    case 'AbortError':
      return `Your ${dev} is in use by another app (close Zoom/Teams/Camera and retry).`;
    default:
      return `Joined without ${dev}. Enable it from the controls if your browser allows.`;
  }
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

// One-line diagnostic of which candidate pair (host / srflx / relay) won — the
// single most useful signal for "works on one network but not another".
function logSelectedCandidate(pc: RTCPeerConnection) {
  pc.getStats().then((stats) => {
    let pairId = '';
    const local: Record<string, any> = {};
    stats.forEach((r: any) => {
      if (r.type === 'transport' && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId;
      if (r.type === 'local-candidate') local[r.id] = r;
    });
    stats.forEach((r: any) => {
      if (r.type === 'candidate-pair' && (r.id === pairId || (r.nominated && r.state === 'succeeded'))) {
        const lc = local[r.localCandidateId];
        console.info('[meeting] connected via', lc?.candidateType || '?', 'candidate', lc?.protocol || '');
      }
    });
  }).catch(() => {});
}
