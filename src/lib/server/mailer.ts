// Centralised email sending via SMTP (nodemailer).
// Designed to be non-fatal: if SMTP is not configured, calls log a warning and
// resolve instead of throwing, so booking/report flows never break on email.

import nodemailer from 'nodemailer';
import { appBaseUrl } from '@/lib/seo';

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASSWORD,
  EMAIL_FROM,
} = process.env;

const enabled = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASSWORD);

let transporter: nodemailer.Transporter | null = null;
if (enabled) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465, // 465 = implicit TLS, 587 = STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
} else {
  console.warn('[mailer] SMTP not configured — emails will be skipped.');
}

// ── Escaping ─────────────────────────────────────────────────────
// Every value interpolated into an email comes (directly or indirectly) from
// user input — the public booking form lets anyone choose the name, complaint
// AND the recipient address. Unescaped, that let a stranger send a branded
// HealingMonk email containing arbitrary HTML/links to any inbox.

/** Escape text for safe use in HTML element content and quoted attributes. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) links may appear in an email; anything else becomes ''. */
export function safeUrl(url: unknown): string {
  const s = String(url ?? '').trim();
  return /^https?:\/\/[^\s<>"']+$/i.test(s) ? escapeHtml(s) : '';
}

/** Readable payment-method label for receipts. */
export function methodLabel(method: string): string {
  switch (method) {
    case 'online': return 'Online (Razorpay)';
    case 'card': return 'Card';
    case 'upi': return 'UPI';
    default: return 'Cash';
  }
}

/** Plain-text alternative: strip tags, then decode the entities we emit. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** Send an email. Never throws — returns { sent: boolean }. */
export async function sendMail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ sent: boolean }> {
  if (!enabled || !to || !transporter) return { sent: false };
  try {
    await transporter.sendMail({
      from: EMAIL_FROM || SMTP_USER,
      to,
      subject,
      text: text || htmlToText(html),
      html,
    });
    return { sent: true };
  } catch (err: any) {
    console.error('[mailer] send failed:', err.message);
    return { sent: false };
  }
}

// ── Shared HTML shell ────────────────────────────────────────────
// `title` and `body` are trusted template HTML; callers escape their values.
function layout(title: string, body: string) {
  return `
  <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
      <div style="width:36px;height:36px;background:#16a34a;border-radius:8px"></div>
      <strong style="font-size:18px">HealingMonk</strong>
    </div>
    <h2 style="font-size:18px;margin:0 0 12px">${title}</h2>
    ${body}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
    <p style="font-size:12px;color:#6b7280">This is an automated message from HealingMonk. Please do not reply.</p>
  </div>`;
}

// `label` is a fixed template string; `value` is escaped here.
function row(label: string, value: string) {
  return `<tr>
    <td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px">${label}</td>
    <td style="padding:4px 0;font-size:14px;font-weight:600">${escapeHtml(value)}</td>
  </tr>`;
}

const BUTTON =
  'display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px';

// ── Templated emails ─────────────────────────────────────────────

export function welcomeStaffEmail({
  name,
  email,
  role,
  tempPassword,
}: {
  name: string;
  email: string;
  role: string;
  tempPassword?: string;
}) {
  const loginUrl = safeUrl(appBaseUrl());
  return {
    subject: `Your HealingMonk ${role} account is ready`,
    html: layout(
      `Welcome, ${escapeHtml(name)}`,
      `<p style="font-size:14px">An admin created a <strong>${escapeHtml(role)}</strong> account for you on HealingMonk.</p>
       <table style="margin:12px 0">
         ${row('Email', email)}
         ${tempPassword ? row('Temporary password', tempPassword) : ''}
       </table>
       ${loginUrl ? `<a href="${loginUrl}" style="${BUTTON}">Sign in</a>` : ''}
       <p style="font-size:13px;color:#6b7280;margin-top:12px">Please change your password after your first sign-in.</p>`
    ),
  };
}

export function appointmentBookedEmail({
  patientName,
  doctorName,
  when,
  reason,
}: {
  patientName: string;
  doctorName?: string;
  when: string;
  reason?: string;
}) {
  return {
    subject: `Appointment confirmed — ${when}`,
    html: layout(
      'Your appointment is confirmed',
      `<p style="font-size:14px">Hi ${escapeHtml(patientName)}, your appointment has been booked.</p>
       <table style="margin:12px 0">
         ${row('Date &amp; time', when)}
         ${doctorName ? row('Doctor', `Dr. ${doctorName}`) : ''}
         ${reason ? row('Reason', reason) : ''}
       </table>
       <p style="font-size:13px;color:#6b7280">Please arrive 10 minutes early. To reschedule, contact the clinic reception.</p>`
    ),
  };
}

export function appointmentRescheduledEmail({
  patientName,
  doctorName,
  when,
}: {
  patientName: string;
  doctorName?: string;
  when: string;
}) {
  return {
    subject: `Appointment rescheduled — ${when}`,
    html: layout(
      'Your appointment was rescheduled',
      `<p style="font-size:14px">Hi ${escapeHtml(patientName)}, your appointment has a new time.</p>
       <table style="margin:12px 0">
         ${row('New date &amp; time', when)}
         ${doctorName ? row('Doctor', `Dr. ${doctorName}`) : ''}
       </table>`
    ),
  };
}

export function reportReadyEmail({
  patientName,
  doctorName,
  overallScore,
  flaggedCount,
  reportUrl,
}: {
  patientName: string;
  doctorName?: string;
  overallScore?: number | null;
  flaggedCount?: number;
  /** Public, no-login link to the full visual report (`/r/:slug`). */
  reportUrl?: string;
}) {
  const url = safeUrl(reportUrl);
  const by = doctorName ? ` by Dr. ${escapeHtml(doctorName)}` : '';
  return {
    subject: 'Your HealingMonk assessment report is ready',
    html: layout(
      'Assessment report ready',
      `<p style="font-size:14px">Hi ${escapeHtml(patientName)}, your movement assessment has been completed${by}.</p>
       <table style="margin:12px 0">
         ${overallScore != null ? row('Overall score', `${overallScore}/100`) : ''}
         ${row('Areas flagged', String(flaggedCount ?? 0))}
       </table>
       ${
         url
           ? `<a href="${url}" style="${BUTTON}">View your full report</a>
              <p style="font-size:12px;color:#6b7280;margin-top:10px;word-break:break-all">Or open this link: <a href="${url}" style="color:#16a34a">${url}</a></p>`
           : ''
       }
       <p style="font-size:13px;color:#6b7280;margin-top:12px">Your doctor will review the findings and prescribed exercises with you.</p>`
    ),
  };
}

// Invite / reminder for an online (remote) AI-assessment video consultation.
// Carries the secure room link and, when scheduled, the date & time.
export function meetingInviteEmail({
  patientName,
  doctorName,
  when,
  link,
}: {
  patientName: string;
  doctorName?: string;
  when?: string;
  link: string;
}) {
  const url = safeUrl(link);
  const withDoctor = doctorName ? ` with Dr. ${escapeHtml(doctorName)}` : '';
  return {
    subject: when ? `Your online consultation — ${when}` : 'Your online consultation link',
    html: layout(
      'Your online consultation',
      `<p style="font-size:14px">Hi ${escapeHtml(patientName)}, an online video consultation${withDoctor} has been arranged for you.</p>
       <table style="margin:12px 0">
         ${when ? row('Date &amp; time', when) : ''}
         ${doctorName ? row('Doctor', `Dr. ${doctorName}`) : ''}
       </table>
       <a href="${url}" style="${BUTTON}">Join the meeting</a>
       <p style="font-size:12px;color:#6b7280;margin-top:10px;word-break:break-all">Or open this link at your appointment time: <a href="${url}" style="color:#16a34a">${url}</a></p>
       <p style="font-size:13px;color:#6b7280;margin-top:12px">Please join from Google Chrome and allow camera &amp; microphone access when asked.</p>`
    ),
  };
}

export function paymentReceiptEmail({
  patientName,
  amount,
  currency,
  method,
  reference,
  paidOn,
}: {
  patientName: string;
  amount: number;
  currency?: string;
  method: string;
  reference?: string;
  paidOn?: string; // display date, only for back-dated desk payments
}) {
  const amt = `${currency || 'INR'} ${(amount / 100).toFixed(2)}`;
  return {
    subject: `Payment received — ${amt}`,
    html: layout(
      'Payment receipt',
      `<p style="font-size:14px">Hi ${escapeHtml(patientName)}, we have received your payment. Thank you.</p>
       <table style="margin:12px 0">
         ${row('Amount', amt)}
         ${row('Method', methodLabel(method))}
         ${paidOn ? row('Paid on', paidOn) : ''}
         ${reference ? row('Reference', reference) : ''}
       </table>`
    ),
  };
}
