// Client-side subscription state for the public AI assessment. A guest has no
// login, so we persist the unlocked state (plan + expiry) in localStorage after
// a verified Razorpay payment. The assessment flow is gated on isSubscribed().

const KEY = 'hm_subscription';

export interface StoredSubscription {
  plan: string;
  /** ISO timestamp when access ends. */
  expiresAt: string;
}

export function getSubscription(): StoredSubscription | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSubscription;
  } catch {
    return null;
  }
}

export function setSubscription(sub: StoredSubscription) {
  localStorage.setItem(KEY, JSON.stringify(sub));
}

export function clearSubscription() {
  localStorage.removeItem(KEY);
}

/** True when there is a stored subscription that hasn't expired yet. */
export function isSubscribed(): boolean {
  const sub = getSubscription();
  if (!sub) return false;
  const t = Date.parse(sub.expiresAt);
  return Number.isFinite(t) && t > Date.now();
}

// ---- API calls ----

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export interface SubscriptionOrder {
  subscriptionId: string;
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  planName: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export function createSubscriptionOrder(planId: string, email?: string): Promise<SubscriptionOrder> {
  return post('/subscription/order', { planId, email });
}

export function verifySubscription(payload: {
  subscriptionId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ expiresAt: string; plan: string }> {
  return post('/subscription/verify', payload);
}
