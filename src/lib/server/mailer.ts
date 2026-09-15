// Centralised email sending via SMTP (nodemailer).
// Designed to be non-fatal: if SMTP is not configured, calls log a warning and
// resolve instead of throwing, so booking/report flows never break on email.

import nodemailer from 'nodemailer';

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASSWORD,
  EMAIL_FROM,
  APP_BASE_URL,
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
      text: text || html.replace(/<[^>]+>/g, ' '),
      html,
    });
    return { sent: true };
  } catch (err: any) {
    console.error('[mailer] send failed:', err.message);
    return { sent: false };
  }
}

// ── Shared HTML shell ────────────────────────────────────────────
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

function row(label: string, value: string) {
  return `<tr>
    <td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px">${label}</td>
    <td style="padding:4px 0;font-size:14px;font-weight:600">${value}</td>
  </tr>`;
}

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
  const loginUrl = APP_BASE_URL || '';
  return {
    subject: `Your HealingMonk ${role} account is ready`,
    html: layout(
      `Welcome, ${name}`,
      `<p style="font-size:14px">An admin created a <strong>${role}</strong> account for you on HealingMonk.</p>
       <table style="margin:12px 0">
         ${row('Email', email)}
         ${tempPassword ? row('Temporary password', tempPassword) : ''}
       </table>
       ${loginUrl ? `<a href="${loginUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">Sign in</a>` : ''}
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
      `<p style="font-size:14px">Hi ${patientName}, your appointment has been booked.</p>
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
      `<p style="font-size:14px">Hi ${patientName}, your appointment has a new time.</p>
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
  return {
    subject: 'Your HealingMonk assessment report is ready',
    html: layout(
      'Assessment report ready',
      `<p style="font-size:14px">Hi ${patientName}, your movement assessment has been completed${doctorName ? ` by Dr. ${doctorName}` : ''}.</p>
       <table style="margin:12px 0">
         ${overallScore != null ? row('Overall score', `${overallScore}/100`) : ''}
         ${row('Areas flagged', String(flaggedCount ?? 0))}
       </table>
       ${
         reportUrl
           ? `<a href="${reportUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">View your full report</a>
              <p style="font-size:12px;color:#6b7280;margin-top:10px;word-break:break-all">Or open this link: <a href="${reportUrl}" style="color:#16a34a">${reportUrl}</a></p>`
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
  return {
    subject: when ? `Your online consultation — ${when}` : 'Your online consultation link',
    html: layout(
      'Your online consultation',
      `<p style="font-size:14px">Hi ${patientName}, an online video consultation${
        doctorName ? ` with Dr. ${doctorName}` : ''
      } has been arranged for you.</p>
       <table style="margin:12px 0">
         ${when ? row('Date &amp; time', when) : ''}
         ${doctorName ? row('Doctor', `Dr. ${doctorName}`) : ''}
       </table>
       <a href="${link}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">Join the meeting</a>
       <p style="font-size:12px;color:#6b7280;margin-top:10px;word-break:break-all">Or open this link at your appointment time: <a href="${link}" style="color:#16a34a">${link}</a></p>
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
}: {
  patientName: string;
  amount: number;
  currency?: string;
  method: 'online' | 'cash';
  reference?: string;
}) {
  const amt = `${currency || 'INR'} ${(amount / 100).toFixed(2)}`;
  return {
    subject: `Payment received — ${amt}`,
    html: layout(
      'Payment receipt',
      `<p style="font-size:14px">Hi ${patientName}, we have received your payment. Thank you.</p>
       <table style="margin:12px 0">
         ${row('Amount', amt)}
         ${row('Method', method === 'online' ? 'Online (Razorpay)' : 'Cash')}
         ${reference ? row('Reference', reference) : ''}
       </table>`
    ),
  };
}
