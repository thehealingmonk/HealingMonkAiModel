// Thin client for the Mongo-backed signaling relay (/api/meetings/signal).
// Possession of the room token is the credential, so these calls carry no JWT.

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export type SignalKind = 'offer' | 'answer' | 'ice' | 'join' | 'bye' | 'presence' | 'ai';

export interface Signal {
  id: string;
  from: string;
  to: string | null;
  kind: SignalKind;
  data: any;
}

export interface OutSignal {
  token: string;
  from: string;
  to?: string | null;
  kind: SignalKind;
  data?: any;
}

export async function sendSignal(msg: OutSignal): Promise<void> {
  await fetch(`${API_URL}/meetings/signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg),
    keepalive: true, // let a 'bye' fire even as the page unloads
  }).catch(() => {
    /* transient network error — the next tick retries the handshake */
  });
}

// Wipe the room's signaling backlog (host calls this on start for a clean
// negotiation). Best-effort — failure is non-fatal.
export async function clearSignals(token: string): Promise<void> {
  await fetch(`${API_URL}/meetings/signal?token=${encodeURIComponent(token)}`, {
    method: 'DELETE',
  }).catch(() => {});
}

// Fetch signals addressed to `peer` (or broadcast) newer than `after` (the last
// signal id we processed). Returns [] on any error so the poll loop keeps going.
export async function pollSignals(token: string, peer: string, after: string | null): Promise<Signal[]> {
  const params = new URLSearchParams({ token, peer });
  if (after) params.set('after', after);
  try {
    const res = await fetch(`${API_URL}/meetings/signal?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.signals) ? data.signals : [];
  } catch {
    return [];
  }
}
