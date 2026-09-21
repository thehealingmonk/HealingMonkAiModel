// ICE server configuration for the WebRTC peer connection.
//
// WebRTC connects two browsers directly. To do that across the internet each
// side must (a) discover its public address and (b) find a network path that
// isn't blocked by NAT/firewalls. That needs two kinds of server:
//
//   STUN  — tells a browser its own public IP:port so the two peers can try a
//           DIRECT peer-to-peer path. Enough on the same LAN and on many home
//           networks. Free, stateless, low cost.
//
//   TURN  — a media RELAY used when a direct path is impossible: symmetric NAT,
//           strict corporate/university/hospital firewalls, or mobile carrier
//           CGNAT. Without a WORKING TURN, calls between two different networks
//           frequently fail — this is the single most common cause of "connects
//           on mobile but not on the laptop" and "works on one Wi-Fi, not the
//           other". TURN must be reachable over several transports because
//           networks block them selectively:
//             • UDP  (fastest, preferred)          — udp/3478 or udp/443
//             • TCP  (survives UDP-blocking nets)   — tcp/443?transport=tcp
//             • TLS  (turns:, looks like HTTPS)     — turns/443?transport=tcp
//
// Production reliability REQUIRES your own TURN (self-hosted coturn or a paid
// provider such as Metered/Twilio/Cloudflare). Set it via the env vars below —
// especially a `turns:` (TLS) URL, which is what gets through the most
// restrictive networks. The free relay bundled here is a best-effort fallback
// only; it is rate-limited and periodically saturated, so do NOT ship to
// production relying on it alone.
//
// Env vars (all optional, all server-side — credentials never reach the client
// except as short-lived ICE credentials delivered per-room):
//   TURN_URLS        comma-separated list, e.g.
//                    "turn:turn.example.com:3478?transport=udp,turn:turn.example.com:443?transport=tcp,turns:turn.example.com:443?transport=tcp"
//   TURN_USERNAME    username for the above
//   TURN_CREDENTIAL  credential/password for the above
//   TURN_URL         (legacy single/comma URL — still honoured)
//   ICE_DISABLE_FREE_TURN  set to "1" to drop the public fallback relay entirely
//                          (recommended once you have your own TURN configured)

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

// Public STUN servers. Multiple hosts so a single one being unreachable on a
// given network doesn't stop server-reflexive candidate gathering.
const STUN_SERVERS: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },
];

// Free public TURN relay (Open Relay by Metered, no signup). Provides UDP + TCP
// over ports 80/443. NOTE: the free tier has no `turns:` (TLS) endpoint and is
// frequently congested — it is a fallback, not a production dependency.
const FREE_TURN: IceServer[] = [
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

// Parse a comma-separated URL list into trimmed, non-empty entries.
function parseUrls(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((u) => u.trim()).filter(Boolean);
}

export function getIceServers(): IceServer[] {
  const servers: IceServer[] = [...STUN_SERVERS];

  // Operator-configured TURN (preferred). Accept both TURN_URLS (new) and the
  // legacy TURN_URL, merged and de-duplicated. All share one credential pair.
  const configuredUrls = Array.from(
    new Set([...parseUrls(process.env.TURN_URLS), ...parseUrls(process.env.TURN_URL)])
  );
  const hasOwnTurn = configuredUrls.length > 0;
  if (hasOwnTurn) {
    const username = process.env.TURN_USERNAME || undefined;
    const credential = process.env.TURN_CREDENTIAL || undefined;
    // One entry per URL keeps browser-side candidate gathering explicit and lets
    // us know from ICE stats which transport actually won.
    for (const url of configuredUrls) {
      servers.push({ urls: url, username, credential });
    }
  }

  // Append the free fallback relay unless explicitly disabled. Keeping it in
  // ADDITION to a real TURN is harmless (ICE just prefers whichever pairs first)
  // and preserves connectivity if the primary relay has a hiccup.
  const dropFree = process.env.ICE_DISABLE_FREE_TURN === '1';
  if (!dropFree) servers.push(...FREE_TURN);

  return servers;
}
