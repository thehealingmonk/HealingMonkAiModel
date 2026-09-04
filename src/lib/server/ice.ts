// ICE server configuration for the WebRTC peer connection.
//
// STUN lets the two browsers discover their public address so they can connect
// directly (peer-to-peer) on most networks. That is enough for same-network and
// many home/office setups and costs nothing.
//
// TURN relays media when a direct connection is impossible (symmetric NAT,
// strict corporate/mobile firewalls). It is optional and TURN-READY here: set
// TURN_URL / TURN_USERNAME / TURN_CREDENTIAL in the environment and it is served
// to clients automatically — no code change needed. The credentials stay
// server-side (delivered per-room via the room API), never hard-coded.

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

// Public STUN servers (Google's are free and widely used).
const STUN_SERVERS: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Free public TURN relay (Open Relay by Metered). TURN is what makes calls
// connect across the internet — between two devices on DIFFERENT networks,
// behind home/mobile/corporate NATs, STUN alone often fails, and the media has
// to be relayed. This zero-config default makes remote (e.g. far-away patient)
// calls work out of the box. For production scale/reliability, set your own
// TURN via the env vars below (self-hosted coturn or a paid provider), which is
// added on top of these.
const FREE_TURN: IceServer[] = [
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

export function getIceServers(): IceServer[] {
  const servers: IceServer[] = [...STUN_SERVERS, ...FREE_TURN];

  const turnUrl = process.env.TURN_URL;
  if (turnUrl) {
    // Allow a comma-separated list of TURN URLs (e.g. turn:… ,turns:…).
    const urls = turnUrl.split(',').map((u) => u.trim()).filter(Boolean);
    servers.push({
      urls,
      username: process.env.TURN_USERNAME || undefined,
      credential: process.env.TURN_CREDENTIAL || undefined,
    });
  }

  return servers;
}
