// Persistence for generated assessment reports.
//
// The public (guest) assessment flow has no login, so a generated report would
// normally vanish on refresh. To let a report live at its own URL and be
// reopened later — from ANY browser or device — we persist the whole report
// (patient, captures with baked-in pose images, extra shots and the doctor's
// edits) both to the server (source of truth, keyed by id) and to localStorage
// (a fast local cache so the generating device reopens instantly and offline).

import type { PatientInfo, AssessmentCapture, ExtraShot } from '@/lib/clinicalKnowledge';
import type { IdealPostureSet } from '@/services/api';

// Same-origin API now that the backend lives in this Next.js app under /api.
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

/** A doctor's per-posture clinical input, persisted with the report. */
export interface DoctorFindingData {
  score: number | null;
  remarks: string;
  exercises: string;
}

export interface StoredReport {
  id: string;
  patient: PatientInfo;
  captures: AssessmentCapture[];
  extraShots: ExtraShot[];
  createdAt: string;
  /** Overall doctor notes shown at the end of the report. */
  doctorNotes: string;
  /** Overall doctor key points (bulleted). */
  doctorPoints: string[];
  /** Per-assessment doctor score / remarks / exercises, keyed by assessmentId. */
  findingData: Record<string, DoctorFindingData>;
  /** Doctor's curated ideal-posture reference images for this patient's pain areas. */
  idealPostures?: IdealPostureSet[];
  /** ISO time of the last edit — picks the fresher copy between server and local cache. */
  updatedAt?: string;
}

const PREFIX = 'hm_report_';
// Secret edit key for reports created on this device (see /api/public/reports).
const KEY_PREFIX = 'hm_report_key_';
// Doctor notes are typed live; batch edits so the multi-MB report (it carries
// the pose images) is uploaded once per pause, not once per keystroke.
const SAVE_DEBOUNCE_MS = 800;

// In-memory cache of reports created/opened this session. This is the reliable
// fallback when localStorage is full: guest reports carry several full-res
// base64 pose images and can exceed the browser's ~5MB quota, so persist() may
// silently fail. Keeping the report in memory guarantees the URL we navigate to
// right after "Generate Report" can always render it — no bounce back to
// /assessment while the (async) server upload is still in flight.
const memoryCache = new Map<string, StoredReport>();

/** URL-safe kebab slug from a patient's name (the human-readable URL prefix). */
function slugify(name: string): string {
  return (
    (name || 'patient')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'patient'
  );
}

// Report id / URL slug: the patient's name plus a random suffix, e.g.
// "ramesh-kumar-8f3k2plz9q". This is what the shareable report URL (`/r/:slug`)
// uses — human-readable (name) yet unique per report. URL-safe (kebab only).
function genId(name?: string): string {
  // The URL is the read credential for a no-login report, so the suffix must be
  // unguessable: 10 chars from a CSPRNG (~51 bits), not Math.random().
  return `${slugify(name || 'patient')}-${randomToken(10)}`;
}

function randomToken(length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function getEditKey(id: string): string | null {
  try {
    return localStorage.getItem(KEY_PREFIX + id);
  } catch {
    return null;
  }
}

function setEditKey(id: string, key: string): void {
  try {
    localStorage.setItem(KEY_PREFIX + id, key);
  } catch {
    /* storage unavailable — edits from this device just won't sync */
  }
}

/**
 * Can this browser save edits to the report? True on the device that created it
 * (holds the edit key) or for a signed-in user (the server still decides —
 * only admin/doctor logins are accepted).
 */
export function canEditStoredReport(id: string): boolean {
  if (getEditKey(id)) return true;
  try {
    const token = localStorage.getItem('hm_token');
    if (!token) return false;
    // UI hint only (the server verifies the signature): read the role claim.
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'admin' || payload?.role === 'doctor';
  } catch {
    return false;
  }
}

/**
 * Persist a report, returning its id. Falls back to dropping the heavier raw
 * (non-overlay) frames if localStorage runs out of quota, so the visible report
 * (which uses the overlay images) still survives.
 */
export function createStoredReport(input: {
  patient: PatientInfo;
  captures: AssessmentCapture[];
  extraShots: ExtraShot[];
  idealPostures?: IdealPostureSet[];
}): string {
  const id = genId(input.patient?.name);
  setEditKey(id, randomToken(32));
  const now = new Date().toISOString();
  const report: StoredReport = {
    id,
    patient: input.patient,
    captures: input.captures,
    extraShots: input.extraShots,
    createdAt: now,
    updatedAt: now,
    doctorNotes: '',
    doctorPoints: [],
    findingData: {},
    idealPostures: input.idealPostures ?? [],
  };
  memoryCache.set(id, report);
  persist(report);
  // Upload to the server so the URL opens on any device. Fire-and-forget: the
  // local cache already has it, so the report is usable immediately.
  saveToServer(report, true);
  return id;
}

// Per-report save queue: at most one upload in flight per report, and only the
// LATEST state is sent after it finishes. Without this, rapid edits raced each
// other and an older payload could land last, silently reverting an edit.
const pending = new Map<string, StoredReport>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const inFlight = new Set<string>();

/** Queue a report upload (best-effort — the local cache is the fallback). */
function saveToServer(report: StoredReport, immediate = false): void {
  pending.set(report.id, report);
  const t = timers.get(report.id);
  if (t) clearTimeout(t);
  if (immediate) {
    timers.delete(report.id);
    void flush(report.id);
    return;
  }
  timers.set(
    report.id,
    setTimeout(() => {
      timers.delete(report.id);
      void flush(report.id);
    }, SAVE_DEBOUNCE_MS)
  );
}

async function flush(id: string): Promise<void> {
  if (inFlight.has(id)) return; // the running upload re-checks `pending` when done
  const report = pending.get(id);
  if (!report) return;
  pending.delete(id);
  inFlight.add(id);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = getEditKey(id);
    if (key) headers['x-report-key'] = key;
    try {
      const token = localStorage.getItem('hm_token');
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      /* no storage — key-only */
    }
    const res = await fetch(`${API_URL}/public/reports`, {
      method: 'POST',
      headers,
      body: JSON.stringify(report),
    });
    if (!res.ok) console.warn('Could not sync report to server:', res.status);
  } catch (err) {
    console.warn('Could not sync report to server:', err);
  } finally {
    inFlight.delete(id);
    if (pending.has(id)) void flush(id);
  }
}

function timeOf(r: StoredReport | null): number {
  if (!r) return 0;
  const t = Date.parse(r.updatedAt || r.createdAt || '');
  return Number.isFinite(t) ? t : 0;
}

/**
 * Load a report by id. The server copy is the source of truth (so edits made on
 * another device show up); the local cache is used when it is newer (an edit
 * still uploading) or when the server is unreachable / doesn't have it yet.
 */
export async function fetchStoredReport(id: string): Promise<StoredReport | null> {
  const local = getStoredReport(id);
  let remote: StoredReport | null = null;
  try {
    const ctrl = new AbortController();
    // Don't hang the report screen on a slow network if we can show a local copy.
    const timer = setTimeout(() => ctrl.abort(), local ? 6000 : 20000);
    const res = await fetch(`${API_URL}/public/reports/${encodeURIComponent(id)}`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) remote = (await res.json()) as StoredReport;
  } catch {
    /* offline / timeout — fall back to the local copy */
  }
  if (remote && timeOf(remote) >= timeOf(local)) {
    memoryCache.set(remote.id, remote);
    persist(remote); // cache for next time / offline
    return remote;
  }
  return local;
}

function persist(report: StoredReport): void {
  const key = PREFIX + report.id;
  try {
    localStorage.setItem(key, JSON.stringify(report));
    return;
  } catch {
    // Quota exceeded — drop the original (no-overlay) frames and retry once.
    // The report renders from the overlay `imageData`, so it stays intact.
    const slim: StoredReport = {
      ...report,
      captures: report.captures.map((c) => ({ ...c, rawImageData: undefined })),
      extraShots: report.extraShots.map((s) => ({ ...s, rawImageData: undefined })),
    };
    try {
      localStorage.setItem(key, JSON.stringify(slim));
    } catch {
      console.warn('Could not persist report — browser storage is full.');
    }
  }
}

export function getStoredReport(id: string): StoredReport | null {
  // Prefer the in-memory copy — it always has the full report even when
  // localStorage rejected it for quota (see memoryCache above).
  const cached = memoryCache.get(id);
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(PREFIX + id);
    if (!raw) return null;
    const report = JSON.parse(raw) as StoredReport;
    memoryCache.set(id, report);
    return report;
  } catch {
    return null;
  }
}

/** Merge a partial update into an existing report (e.g. doctor edits). */
export function updateStoredReport(id: string, patch: Partial<StoredReport>): void {
  const existing = getStoredReport(id);
  if (!existing) return;
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  memoryCache.set(id, updated);
  // A view-only browser keeps its edits in memory only: persisting them locally
  // would make this device prefer its own (newer-stamped) copy over the real
  // report forever. The server rejects them anyway.
  if (!canEditStoredReport(id)) return;
  persist(updated);
  // Keep the server copy in sync so edits show on other devices too.
  saveToServer(updated);
}
