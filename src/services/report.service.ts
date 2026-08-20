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
}

const PREFIX = 'hm_report_';

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
  const rand = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  return `${slugify(name || 'patient')}-${rand}`;
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
  const report: StoredReport = {
    id,
    patient: input.patient,
    captures: input.captures,
    extraShots: input.extraShots,
    createdAt: new Date().toISOString(),
    doctorNotes: '',
    doctorPoints: [],
    findingData: {},
    idealPostures: input.idealPostures ?? [],
  };
  memoryCache.set(id, report);
  persist(report);
  // Upload to the server so the URL opens on any device. Fire-and-forget: the
  // local cache already has it, so the report is usable immediately.
  saveToServer(report);
  return id;
}

/** Push a report to the server (best-effort — local cache is the fallback). */
function saveToServer(report: StoredReport): void {
  fetch(`${API_URL}/public/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  }).catch((err) => console.warn('Could not sync report to server:', err));
}

/**
 * Load a report by id: instant from the local cache when present, otherwise
 * fetched from the server (and cached locally) so the URL works cross-device.
 */
export async function fetchStoredReport(id: string): Promise<StoredReport | null> {
  const local = getStoredReport(id);
  if (local) return local;
  try {
    const res = await fetch(`${API_URL}/public/reports/${id}`);
    if (!res.ok) return null;
    const report = (await res.json()) as StoredReport;
    memoryCache.set(report.id, report);
    persist(report); // cache for next time / offline
    return report;
  } catch {
    return null;
  }
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
  const updated = { ...existing, ...patch };
  memoryCache.set(id, updated);
  persist(updated);
  // Keep the server copy in sync so edits show on other devices too.
  saveToServer(updated);
}
