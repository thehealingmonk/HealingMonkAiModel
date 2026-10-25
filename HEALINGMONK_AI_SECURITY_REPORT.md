# HealingMonk AI — Security & Privacy Report

Scope: all 52 route handlers in `src/app/api`, auth middleware, models, mailer, client auth store. Method: source review of every handler + unit/route tests that run without a database. No production data was read; no requests were made against production APIs other than unauthenticated GETs of public pages, `/api/health` and `/api/auth/me` (401).

Not applicable (do not exist): OAuth, password-reset flow, AI chat/conversation storage, LLM providers, RAG, tools/agents, prompt injection surfaces, file storage outside MongoDB.

## Authorization model (as implemented)
- Every private handler calls `requireAuth` (JWT → live DB user, must be `active`), then `requireRole`. Role is read from the DB, not the token.
- Patient logins see clinic data only when **staff-provisioned** (`patientLinked` or `createdBy`) and only for patient records sharing their email (`src/lib/server/patientLink.ts`). Self-registered accounts see nothing — correct.
- Staff (admin/doctor/reception) are trusted clinic-wide by design (SEC-14).
- No Next.js middleware gate; client `RequireRole` only hides UI. Direct API calls are checked server-side in every handler (verified).

## Findings

### SEC-01 · P1 · HTML injection in transactional email — FIXED, tested
- **Repro:** `POST /api/public/booking` `{ "name": "<a href='https://evil'>Verify account</a>", "email": "victim@x.com", "preferredAt": "<future date>" }` → victim receives a HealingMonk-branded email from the clinic's SMTP containing the attacker's link. Same for `complaint`/`reason`.
- **Root cause:** templates in `src/lib/server/mailer.ts` interpolated values into HTML unescaped.
- **Fix:** `escapeHtml()` on every interpolated value, `safeUrl()` allows only http(s) links, plain-text part decodes entities correctly.
- **Evidence:** `tests/security-hardening.test.mjs` SEC-01 cases.

### SEC-02 · P1 · Payment order IDOR — FIXED, needs DB test
- **Repro:** sign up as a patient (self-registration is open), `POST /api/payments/order { patientId: <any id>, amount: 1 }` → payment row created on that patient; response includes `patientName`.
- **Root cause:** route only required authentication.
- **Fix:** patients must own the record (`myPatientIds`); same check on `/api/payments/verify` (which could otherwise flip a stranger's pending payment to `failed`). Provider error text no longer echoed.
- **Note:** no UI currently calls this endpoint, so no user flow changes.

### SEC-03 · P1 · Sessions not revocable — PARTLY FIXED
- **Repro:** sign in on device A; admin resets the password (or changes role, or disables then re-enables). Device A's token still works — up to 365 days (`JWT_EXPIRES_IN` default).
- **Fix:** `tokenVersion` on users; JWT carries `tv`; `getUser` rejects mismatches. Bumped on password reset (`PATCH /api/users/[id]`, `POST /api/patients/[id]/account`), role change, and deactivation. An admin changing their own password receives a fresh token so they stay signed in.
- **Backward compatibility:** old tokens without `tv` are treated as version 0 and keep working until the account's first revocation event — no forced global logout.
- **Still open:** logout only deletes the token in the browser; token lives in `localStorage` (readable by any XSS); expiry is long. Recommend a shorter expiry with refresh, or httpOnly cookie sessions — product/architecture decision.

### SEC-04 · P3 · JWT verification hardening — FIXED
Algorithm pinned to HS256; `sub` must be a 24-hex id before any DB lookup.

### SEC-05 · P2 · Signaling relay input validation — FIXED, tested
- **Repro:** `POST /api/meetings/signal { "token": {"$ne": ""}, ... }` matched an arbitrary meeting in `joinableMeeting`; unknown kinds and multi-MB `data` were stored; `DELETE ?token=<anything>` ran a delete.
- **Fix:** string-only fields with length caps, allow-list of the 14 kinds the client sends, 64 KB payload cap, DELETE only for an existing open room.

### SEC-06 · P2 · Anonymous patient enumeration via public booking — FIXED
Response no longer contains `patientId`/`appointmentId` (the client never used them); same body whether the patient was new or matched. Past `preferredAt` values no longer create appointments.

### SEC-07 · P2 · Paywall is client-side only — OPEN (product decision)
`isSubscribed()` reads `localStorage.hm_subscription`; setting `{"plan":"x","expiresAt":"2099-01-01"}` unlocks the paid assessment. The assessment itself runs on-device, so full enforcement needs a server-issued, signed entitlement (e.g. returned by `/api/subscription/verify`) checked before saving reports. Changing this would affect existing paying users' stored state — needs a decision.

### SEC-08 · P2 · Health data cacheable/indexable — FIXED, verified locally
`GET /api/public/reports/[id]` now sends `Cache-Control: private, no-store` + `X-Robots-Tag: noindex`, validates the id format before querying. `next.config.mjs` adds `X-Robots-Tag: noindex, nofollow` to `/api/*`, dashboards, `/login`, `/assessment/*`, `/r/*`, `/m/*`, and `Cache-Control: private, no-store` to `/api/*`. Verified with `next start` (see Test Report).

### SEC-09..11, 20 · P3 — FIXED
- Reference-image uploads accept raster data URLs only (no SVG).
- No raw provider/DB error messages returned.
- Invalid ObjectIds → 404 / empty list in ~20 handlers instead of unhandled 500s.
- Report "send to" override must be one valid address.

### SEC-12 · P2 · Vulnerable dependencies — PARTLY FIXED
`npm audit fix` (no `--force`, lockfile only) resolved dompurify (critical, via jspdf), nanoid, source-map-js, ws, react-router patch. Remaining production advisories:

| Package | Severity | Needs |
|---|---|---|
| next 14.2.35 | critical | major upgrade to 16.x — plan and regression-test |
| postcss (via next) | high | comes with the Next upgrade |
| nodemailer 8 | high | major upgrade to 10.x |
| react-router-dom 6.30.6 | moderate | v7; the open-redirect advisory concerns backslash paths in `<Link>`/`navigate` — app does not navigate to user-supplied paths |

### Open, lower priority
- **SEC-13 · P2** In-memory rate limiter is per serverless instance → weak on Vercel. Use a shared store (e.g. Upstash/Vercel KV) for login/register/booking.
- **SEC-14 · P3** Staff have clinic-wide patient access; reception can delete patients/documents. Confirm this matches clinic policy.
- **SEC-15 · P3** Welcome email contains the temporary password in plaintext; no forced change on first login.
- **SEC-16 · P3** No self-service password reset; 6-char minimum.
- **SEC-17 · P3** Public report slug contains the patient's name.
- **SEC-18 · P3** In-meeting chat text passes through MongoDB signal docs (TTL-expired).
- **SEC-19 · P3** No Razorpay webhook (`verifyWebhookSignature` exists but is unused).
- First-ever registered account becomes admin — safe only because production already has users.
- No secrets in git history (scanned all commits: only `.env.example` was ever added). `.env` is git-ignored.

## Security test coverage
| Case | How tested | Result |
|---|---|---|
| Email escaping / URL filtering | unit | pass |
| Token generation compare, revocation bump, `tv` embedded | unit | pass |
| HS512 / `alg:none` tokens refused | route-level (`getUser`) | pass (guard; would also have failed before via DB error) |
| Object `sub` refused before DB | route-level | pass |
| Signal operator injection, unknown kind, oversize, bad `to` | route-level (`POST`) | pass |
| Public report invalid id → 404 + private headers | route-level | pass |
| Existing: Razorpay signature binding, patient linkage, requireRole, rate limiter | unit | pass |
| **Not tested (needs DB):** payment ownership, revoked-token rejection end to end, cross-user report access, deactivated user | — | manual on preview, see Test Report §5 |
