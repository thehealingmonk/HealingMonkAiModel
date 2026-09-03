// Frontend auth client for the Express + MongoDB API.
// Stores the JWT in localStorage and exposes typed helpers.

export type Role = 'admin' | 'doctor' | 'reception' | 'patient';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt?: string;
}

export interface AuthResult {
  token: string;
  user: AuthUser;
  permissions: string[];
}

// Same-origin API now that the backend lives in this Next.js app under /api.
// Override with NEXT_PUBLIC_API_URL only if the API is hosted elsewhere.
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
const TOKEN_KEY = 'hm_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const result = await request<AuthResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(result.token);
  return result;
}

export async function register(name: string, email: string, password: string): Promise<AuthResult> {
  const result = await request<AuthResult>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
  setToken(result.token);
  return result;
}

export async function fetchMe(): Promise<{ user: AuthUser; permissions: string[] }> {
  return request('/auth/me');
}

export function logout() {
  setToken(null);
}

// ---- Admin: user management ----

export async function listUsers(role?: Role): Promise<{ users: AuthUser[] }> {
  const q = role ? `?role=${role}` : '';
  return request(`/users${q}`);
}

// Staff-accessible doctor directory (for booking / assignment dropdowns).
export async function listDoctors(): Promise<{ users: AuthUser[] }> {
  return request('/users/doctors');
}

export async function createUser(payload: {
  name: string;
  email: string;
  password: string;
  role: Role;
}): Promise<{ user: AuthUser; permissions: string[] }> {
  return request('/users', { method: 'POST', body: JSON.stringify(payload) });
}

export async function setUserActive(id: string, active: boolean): Promise<{ user: AuthUser }> {
  return request(`/users/${id}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
}

// Admin edits an account. Send only the fields you want to change; a non-empty
// `password` resets the login password.
export async function updateUser(
  id: string,
  payload: { name?: string; email?: string; role?: Role; password?: string }
): Promise<{ user: AuthUser; permissions: string[] }> {
  return request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

// Admin permanently deletes a user account.
export async function deleteUser(id: string): Promise<{ ok: boolean }> {
  return request(`/users/${id}`, { method: 'DELETE' });
}

// ---- Patients ----

export interface Patient {
  id: string;
  patientId: string; // human-readable, e.g. HM-000001
  name: string;
  age: number | null;
  gender: string;
  mobile: string;
  email: string;
  painAreas: string[];
  complaint: string;
  height: number | null;
  weight: number | null;
  assignedDoctor: { id: string; name: string } | string | null;
  createdAt?: string;
}

export interface NewPatient {
  name: string;
  age?: string | number;
  gender?: string;
  mobile?: string;
  email?: string;
  painAreas?: string[];
  complaint?: string;
  height?: string | number;
  weight?: string | number;
  assignedDoctor?: string | null;
}

export async function listPatients(opts: { q?: string; scope?: 'all' | 'mine' } = {}): Promise<{ patients: Patient[] }> {
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.scope === 'all') params.set('scope', 'all');
  const qs = params.toString();
  return request(`/patients${qs ? `?${qs}` : ''}`);
}

export async function createPatient(payload: NewPatient): Promise<{ patient: Patient }> {
  return request('/patients', { method: 'POST', body: JSON.stringify(payload) });
}

export async function getPatient(id: string): Promise<{ patient: Patient }> {
  return request(`/patients/${id}`);
}

// Modify a patient — correct a wrong entry. Only the passed fields are updated.
export async function updatePatient(id: string, payload: Partial<NewPatient>): Promise<{ patient: Patient }> {
  return request(`/patients/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

// Delete a patient — remove a duplicate/double entry.
export async function deletePatient(id: string): Promise<{ ok: true; id: string }> {
  return request(`/patients/${id}`, { method: 'DELETE' });
}

export async function assignDoctor(id: string, doctorId: string | null): Promise<{ patient: Patient }> {
  return request(`/patients/${id}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ doctorId }),
  });
}

// ---- Patient login accounts (admin sets a password so the patient can sign in) ----

export interface PatientAccountStatus {
  hasAccount: boolean;
  email: string;
  active: boolean;
  /** True if the email belongs to a staff account and can't be a patient login. */
  staff: boolean;
}

export async function getPatientAccount(id: string): Promise<PatientAccountStatus> {
  return request(`/patients/${id}/account`);
}

export async function setPatientAccount(
  id: string,
  password: string
): Promise<{ email: string; created: boolean }> {
  return request(`/patients/${id}/account`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

// ---- Patient documents (X-rays, prescriptions, outside reports, etc.) ----

export type DocumentCategory = 'report' | 'xray' | 'prescription' | 'scan' | 'other';

export interface PatientDocumentMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  category: DocumentCategory;
  uploadedByName: string;
  createdAt?: string;
}

export interface NewDocument {
  name: string;
  data: string; // data URL
  mime?: string;
  size?: number;
  category?: DocumentCategory;
}

export async function listPatientDocuments(
  patientId: string
): Promise<{ documents: PatientDocumentMeta[] }> {
  return request(`/patients/${patientId}/documents`);
}

export async function uploadPatientDocuments(
  patientId: string,
  documents: NewDocument[]
): Promise<{ documents: PatientDocumentMeta[] }> {
  return request(`/patients/${patientId}/documents`, {
    method: 'POST',
    body: JSON.stringify({ documents }),
  });
}

// Fetch a single document with its base64 payload (for preview / download).
export async function getPatientDocument(
  patientId: string,
  docId: string
): Promise<{ document: PatientDocumentMeta & { data: string } }> {
  return request(`/patients/${patientId}/documents/${docId}`);
}

export async function deletePatientDocument(
  patientId: string,
  docId: string
): Promise<{ ok: true; id: string }> {
  return request(`/patients/${patientId}/documents/${docId}`, { method: 'DELETE' });
}

// ---- Reports ----

export interface ReportFinding {
  assessmentId: string;
  name: string;
  bodyRegion: string;
  measurementName: string;
  value: number | null;
  unit: string;
  severity: 'normal' | 'mild' | 'moderate' | 'severe' | null;
  painArea: string;
  painCorrelation: string;
}

export interface ReportExercise {
  name: string;
  sets: string;
  reps: string;
  frequency: string;
  forFinding?: string;
}

export interface Report {
  id: string;
  patient: string;
  doctor: { id: string; name: string } | string;
  /** Slug of the public, no-auth visual report at /r/:shareId (null for old reports). */
  shareId: string | null;
  painAreas: string[];
  overallScore: number | null;
  findingsCount: number;
  flaggedCount: number;
  findings: ReportFinding[];
  suggestedExercises: ReportExercise[];
  doctorNotes: string;
  createdAt?: string;
}

export interface NewReport {
  patientId: string;
  painAreas?: string[];
  overallScore?: number;
  findings: ReportFinding[];
  suggestedExercises?: ReportExercise[];
  doctorNotes?: string;
  /** Slug of the public visual report to link this record to (/r/:shareId). */
  shareId?: string;
}

export async function listPatientReports(patientId: string): Promise<{ reports: Report[] }> {
  return request(`/patients/${patientId}/reports`);
}

// Admin/doctor: every report across patients. Includes patientInfo for tables.
export interface ReportListItem extends Report {
  patientInfo: { id: string; name: string; patientId: string } | null;
}

export async function listAllReports(scope: 'all' | 'mine' = 'all'): Promise<{ reports: ReportListItem[] }> {
  return request(`/reports${scope === 'all' ? '?scope=all' : ''}`);
}

export async function createReport(payload: NewReport): Promise<{ report: Report }> {
  return request('/reports', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateReportNotes(id: string, doctorNotes: string): Promise<{ report: Report }> {
  return request(`/reports/${id}/notes`, {
    method: 'PATCH',
    body: JSON.stringify({ doctorNotes }),
  });
}

// Admin permanently deletes an assessment report.
export async function deleteReport(id: string): Promise<{ ok: boolean }> {
  return request(`/reports/${id}`, { method: 'DELETE' });
}

// ---- Ideal posture library ----

// The canonical conditions a doctor can curate a reference library for. Matches
// the pain-area options used when registering a patient, so presets auto-apply.
export const IDEAL_POSTURE_CONDITIONS = [
  'Neck',
  'Shoulder',
  'Upper Back',
  'Lower Back',
  'Hip',
  'Knee',
  'Ankle',
] as const;

export interface IdealPostureImage {
  label: string;
  imageData: string; // data URL
}

export interface IdealPostureSet {
  condition: string;
  images: IdealPostureImage[];
  /** Capture-pose ids (from CLINICAL_ASSESSMENTS) the doctor tracks for this condition. */
  poses: string[];
  updatedAt?: string;
}

// List the ideal-posture library. Pass conditions to fetch only those.
export async function listIdealPostures(conditions?: string[]): Promise<{ sets: IdealPostureSet[] }> {
  const q = conditions && conditions.length ? `?conditions=${encodeURIComponent(conditions.join(','))}` : '';
  return request(`/ideal-postures${q}`);
}

// Upsert (replace) the reference library for one condition — its images and the
// capture poses the doctor tracks for it. Doctor/admin only.
export async function saveIdealPosture(
  condition: string,
  images: IdealPostureImage[],
  poses: string[] = []
): Promise<{ set: IdealPostureSet }> {
  return request('/ideal-postures', {
    method: 'PUT',
    body: JSON.stringify({ condition, images, poses }),
  });
}

// ---- Appointments ----

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export interface Appointment {
  id: string;
  patient: { id: string; name: string } | string | null;
  doctor: { id: string; name: string } | string | null;
  scheduledAt: string;
  durationMin: number;
  reason: string;
  status: AppointmentStatus;
  notes?: string;
  createdAt?: string;
  // Enriched by the list endpoint (joined from the patient record).
  patientCode?: string | null;
  patientMobile?: string | null;
  /** The patient's currently-assigned doctor — a fallback when the appointment has none. */
  assignedDoctorName?: string | null;
}

export async function listAppointments(
  opts: { date?: string; doctor?: string; patient?: string; status?: AppointmentStatus; scope?: 'all' } = {}
): Promise<{ appointments: Appointment[] }> {
  const params = new URLSearchParams();
  if (opts.date) params.set('date', opts.date);
  if (opts.doctor) params.set('doctor', opts.doctor);
  if (opts.patient) params.set('patient', opts.patient);
  if (opts.status) params.set('status', opts.status);
  if (opts.scope === 'all') params.set('scope', 'all');
  const qs = params.toString();
  return request(`/appointments${qs ? `?${qs}` : ''}`);
}

export async function bookAppointment(payload: {
  patientId: string;
  doctorId?: string | null;
  scheduledAt: string;
  durationMin?: number;
  reason?: string;
}): Promise<{ appointment: Appointment }> {
  return request('/appointments', { method: 'POST', body: JSON.stringify(payload) });
}

export async function rescheduleAppointment(id: string, scheduledAt: string): Promise<{ appointment: Appointment }> {
  return request(`/appointments/${id}/reschedule`, {
    method: 'PATCH',
    body: JSON.stringify({ scheduledAt }),
  });
}

export async function setAppointmentStatus(
  id: string,
  status: AppointmentStatus
): Promise<{ appointment: Appointment }> {
  return request(`/appointments/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// ---- Public (no auth) ----

// Lead-capture booking from the marketing home page. Creates/reuses a patient
// and an optional pending appointment reception confirms. Matches POST /public/booking.
export async function bookPublic(payload: {
  name: string;
  mobile?: string;
  email?: string;
  complaint?: string;
  painAreas?: string[];
  preferredAt?: string;
}): Promise<{ ok: boolean; patientId: string; appointmentId: string | null }> {
  return request('/public/booking', { method: 'POST', body: JSON.stringify(payload) });
}

// ---- Payments ----

export type PaymentStatus = 'created' | 'paid' | 'failed' | 'refunded';

export type PaymentMethod = 'online' | 'cash' | 'card' | 'upi';
/** Methods reception can bill manually at the desk (never the online gateway). */
export type ManualPaymentMethod = 'cash' | 'card' | 'upi';

export interface Payment {
  id: string;
  patient: string;
  amount: number; // paise
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  plan: string; // service / plan label
  notes: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  createdAt?: string;
  // Enriched by the list endpoint (joined from the patient / staff records).
  patientName?: string | null;
  patientCode?: string | null;
  doctorName?: string | null;
  collectedByName?: string | null;
}

export interface PaymentSummary {
  totalPaid: number; // paise, all-time (or per-patient when filtered)
  paidCount: number;
  cashPaid: number; // paise
  onlinePaid: number; // paise — online gateway + card + UPI
  byMethod?: Record<string, number>; // paise collected per method
}

export async function listPayments(
  patientId?: string
): Promise<{ payments: Payment[]; summary?: PaymentSummary }> {
  return request(`/payments${patientId ? `?patient=${patientId}` : ''}`);
}

// Reception/admin: manually record a bill the patient has paid at the desk.
export async function recordPayment(payload: {
  patientId: string;
  amount: number; // rupees (converted to paise server-side)
  method: ManualPaymentMethod;
  plan?: string; // service / treatment label
  notes?: string;
}): Promise<{ payment: Payment }> {
  return request('/payments/cash', { method: 'POST', body: JSON.stringify(payload) });
}

// ---- Admin analytics ----

export interface AdminStats {
  patients: number;
  reports: number;
  appointments: number;
  usersByRole: Record<Role, number>;
  apptStatus: Partial<Record<AppointmentStatus, number>>;
  revenuePaise: number;
  paidCount: number;
}

export async function getAdminStats(): Promise<{ stats: AdminStats }> {
  return request('/admin/stats');
}

export interface DayPoint {
  date: string; // YYYY-MM-DD (IST)
  count: number;
  total?: number; // paise (revenue series only)
}

export interface AdminAnalytics {
  days: number;
  revenueByDay: DayPoint[];
  patientsByDay: DayPoint[];
  reportsByDay: DayPoint[];
  apptStatus: Partial<Record<AppointmentStatus, number>>;
  paymentMethods: Record<string, number>; // paise collected per method in range
  topDoctors: { name: string; reports: number }[];
  revenueTotal: number; // paise
  revenueCount: number;
}

export async function getAdminAnalytics(days = 30): Promise<{ analytics: AdminAnalytics }> {
  return request(`/admin/analytics?days=${days}`);
}

// ---- Patient self-service (matched to clinic record by email) ----

export async function myReports(): Promise<{ reports: Report[] }> {
  return request('/me/reports');
}

export async function myAppointments(): Promise<{ appointments: Appointment[] }> {
  return request('/me/appointments');
}

export async function myPayments(): Promise<{ payments: Payment[]; totalPaid: number }> {
  return request('/me/payments');
}

// ---- Online meetings (Flow B: remote AI assessment) ----

export type MeetingStatus =
  | 'created'
  | 'waiting'
  | 'active'
  | 'ai_active'
  | 'completed'
  | 'ended'
  | 'expired';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

// Full staff view of a meeting (admin / assigned doctor).
export interface OnlineMeeting {
  id: string;
  roomToken: string;
  status: MeetingStatus;
  selectedPositions: string[];
  startedAt: string | null;
  aiStartedAt: string | null;
  endedAt: string | null;
  expiresAt: string | null;
  report: string | null;
  shareId: string | null;
  createdAt: string;
  patient:
    | {
        id: string;
        patientId: string;
        name: string;
        age: number | null;
        gender: string;
        mobile: string;
        email: string;
        height: number | null;
        weight: number | null;
        painAreas: string[];
        complaint: string;
      }
    | string;
  assignedDoctor: { id: string; name: string } | string | null;
}

// What the room page gets when resolving a link by token. `role` is decided by
// the server from the caller's auth — the patient view carries no clinical data.
export interface MeetingRoomInfo {
  role: 'staff' | 'patient';
  iceServers: IceServer[];
  meeting:
    | OnlineMeeting
    | { roomToken: string; status: MeetingStatus; patientName: string };
}

// S-Admin creates a meeting for a patient; it auto-binds to the assigned doctor.
export async function createMeeting(patientId: string): Promise<{ meeting: OnlineMeeting }> {
  return request('/meetings', { method: 'POST', body: JSON.stringify({ patientId }) });
}

// Admin: all meetings (optionally for one patient). Doctor: only their own.
export async function listMeetings(patientId?: string): Promise<{ meetings: OnlineMeeting[] }> {
  return request(`/meetings${patientId ? `?patient=${patientId}` : ''}`);
}

export async function getMeeting(id: string): Promise<{ meeting: OnlineMeeting }> {
  return request(`/meetings/${id}`);
}

export async function updateMeeting(
  id: string,
  patch: { status?: MeetingStatus; selectedPositions?: string[]; reportId?: string; shareId?: string }
): Promise<{ meeting: OnlineMeeting }> {
  return request(`/meetings/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function endMeeting(id: string): Promise<{ meeting: OnlineMeeting }> {
  return request(`/meetings/${id}`, { method: 'DELETE' });
}

// Resolve a room by its secret link token. Works signed-in (staff) or as a guest
// patient — the token itself is the credential.
export async function getMeetingRoom(token: string): Promise<MeetingRoomInfo> {
  return request(`/meetings/room/${encodeURIComponent(token)}`);
}
