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

export function getIceServers(): IceServer[] {
  const servers: IceServer[] = [...STUN_SERVERS];

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
