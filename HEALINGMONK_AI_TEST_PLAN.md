# HealingMonk AI — Test Plan

Automated suites run with `npm test` (node:test, imports TypeScript directly). Build gate: `npm run typecheck && npm test && npm run build`. ESLint is not configured.

## Automated (in repo)
| Suite | File | Scope |
|---|---|---|
| Ergonomics engine | `tests/ergo-engine.test.mjs`, `tests/ergo-fit.test.mjs` | RULA/REBA/NIOSH, furniture fit |
| Pose geometry | `tests/pose-geometry.test.mjs` | aspect correction, angles, plumb line |
| Package dates | `tests/package-dates.test.mjs` | IST day maths |
| Server security (existing) | `tests/server-security.test.mjs` | signatures, patient linkage, roles, rate limit, route/indexing tables |
| Security hardening (new) | `tests/security-hardening.test.mjs` | email escaping, token versioning, JWT alg, signaling validation, public report headers |
| Clinical evaluation (new) | `tests/clinical-eval.test.mjs` + `tests/eval/*.json` | 32 measurement cases + safety text |

## Gaps that need infrastructure
Route handlers that query MongoDB are not tested automatically. Recommended: add `mongodb-memory-server` as a dev dependency and a fixture loader, then cover:
1. Patient A cannot read patient B's report (`/api/reports/[id]`, `/api/me/*`) → 404.
2. Self-registered patient sees nothing from `/api/me/*`.
3. Patient `POST /api/payments/order` for another patient → 404; for own record → 201.
4. Token issued before password reset → 401 after reset; admin self-reset keeps session.
5. Disabled user → 401 immediately; re-enabled user's old token → 401.
6. Reception cannot read reports; doctor cannot reschedule another doctor's appointment.
7. Malformed ids → 404 on every `[id]` route.
8. Public report update without key and without staff login → 403.

## Manual (preview deployment, never production data)
Use test accounts for each role on a **Preview** deployment pointed at a non-production database.

| Area | Checks |
|---|---|
| Auth | login/logout per role; refresh keeps session; `/admin` as doctor → redirected; logged-out deep link → `/login`; admin resets own password → still signed in |
| Patients | create/edit/delete, assign doctor, upload image + PDF, preview, delete |
| Assessment | doctor capture on laptop (16:9) and phone portrait; occlusion shows "Not visible"; report save, PDF download, email arrives with working link and escaped text |
| Booking | public form with `<b>` in name → email shows literal text |
| Payments | desk cash/UPI receipt label; guest subscription checkout (Razorpay test mode) |
| Packages | enrol, mark/undo attendance, back-fill |
| Meetings | create, email invite link, join from second device, lobby admit, chat, end |
| Responsive | 360 px, 768 px, 1280 px, 1920 px: no horizontal scroll, tap targets ≥ 44 px, tables scroll |
| Accessibility | keyboard-only login & booking, focus visible, form labels, contrast (axe/Lighthouse) |
| Network | DevTools "Slow 3G": spinners, 60 s timeout message, no duplicate submissions on double-click |
| SEO | items in SEO report §"Production verification" |
