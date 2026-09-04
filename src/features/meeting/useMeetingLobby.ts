import { useCallback, useEffect, useRef, useState } from 'react';
import { sendSignal, pollSignals } from '@/features/meeting/signaling';

// A Google-Meet-style waiting room built on the same signaling relay.
//
//   • The PATIENT (guest link) "knocks" — re-broadcasting a knock every 2s (with
//     their name + a stable request id) until the host admits or denies them.
//     They are NOT connected to media until admitted.
//   • The HOST (s-admin / assigned doctor, already in the room) sees each pending
//     request and clicks Admit or Deny. Admit unblocks that patient, who then
//     connects immediately.
//
// Requests auto-expire if the patient stops knocking (closed the tab), so the
// host's pending list stays accurate.

export interface JoinRequest {
  reqId: string;
  name: string;
  at: number;
}

const KNOCK_MS = 2000;
const POLL_MS = 1000;
const REQUEST_TTL = 6000; // no re-knock within this window ⇒ they left

export function useMeetingLobby({
  token, role, patientName, enabled,
}: { token: string; role: 'staff' | 'patient'; patientName?: string; enabled: boolean }) {
  const [admitted, setAdmitted] = useState(false);
  const [denied, setDenied] = useState(false);
  const [requests, setRequests] = useState<JoinRequest[]>([]);

  const reqId = useRef<string>(Math.random().toString(36).slice(2) + Date.now().toString(36));
  const cursor = useRef<string | null>(null);
  const admittedRef = useRef(false);
  const disposed = useRef(false);

  const admit = useCallback((id: string) => {
    sendSignal({ token, from: 'staff', to: null, kind: 'admit', data: { reqId: id } });
    setRequests((r) => r.filter((x) => x.reqId !== id));
  }, [token]);

  const deny = useCallback((id: string) => {
    sendSignal({ token, from: 'staff', to: null, kind: 'deny', data: { reqId: id } });
    setRequests((r) => r.filter((x) => x.reqId !== id));
  }, [token]);

  useEffect(() => {
    if (!enabled) return;
    disposed.current = false;
    admittedRef.current = false;
    let knockTimer: ReturnType<typeof setInterval> | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const loop = async () => {
      if (disposed.current) return;
      const sigs = await pollSignals(token, role, cursor.current);
      for (const s of sigs) {
        cursor.current = s.id;
        if (role === 'patient') {
          if (s.data?.reqId === reqId.current) {
            if (s.kind === 'admit') { admittedRef.current = true; setAdmitted(true); }
            else if (s.kind === 'deny') setDenied(true);
          }
        } else if (s.kind === 'knock' && s.data?.reqId) {
          const rid = String(s.data.reqId);
          const nm = String(s.data.name || 'Patient');
          const now = Date.now();
          setRequests((prev) => {
            const fresh = prev.filter((x) => now - x.at < REQUEST_TTL);
            const existing = fresh.find((x) => x.reqId === rid);
            if (existing) return fresh.map((x) => (x.reqId === rid ? { ...x, at: now } : x));
            return [...fresh, { reqId: rid, name: nm, at: now }];
          });
        }
      }
      // Expire requests whose patient stopped knocking.
      if (role === 'staff') {
        const now = Date.now();
        setRequests((prev) => (prev.some((x) => now - x.at >= REQUEST_TTL) ? prev.filter((x) => now - x.at < REQUEST_TTL) : prev));
      }
      // Patient can stop polling once admitted (the media peer takes over).
      if (role === 'patient' && admittedRef.current) return;
      if (!disposed.current) pollTimer = setTimeout(loop, POLL_MS);
    };
    loop();

    if (role === 'patient') {
      const knock = () => {
        if (disposed.current || admittedRef.current) return;
        sendSignal({ token, from: 'patient', to: null, kind: 'knock', data: { reqId: reqId.current, name: patientName || 'Patient' } });
      };
      knock();
      knockTimer = setInterval(knock, KNOCK_MS);
    }

    return () => {
      disposed.current = true;
      if (knockTimer) clearInterval(knockTimer);
      if (pollTimer) clearTimeout(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token, role]);

  return { admitted, denied, requests, admit, deny };
}
