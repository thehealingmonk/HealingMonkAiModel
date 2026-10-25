# HealingMonk AI — Audit Report

Audit date: 2026-10-25 · Branch: `main` (base commit `7e99c21`) · Nothing deployed.

## 1. What the application actually is

The audit brief assumes an LLM chat product (chat history, streaming, RAG, prompt injection). **None of that exists in this codebase.** Verified by searching `src/` and `scripts/` for OpenAI/Anthropic/Gemini/Groq/Ollama/LangChain/embeddings/vector/streaming code — no matches outside unrelated 3D/geometry files.

What exists:

| Area | Implementation |
|---|---|
| Framework | Next.js 14.2.35 App Router, React 18. One catch-all page (`src/app/[[...slug]]`) mounts a client-only SPA (react-router 6, `ssr:false`). |
| "AI" | **MediaPipe Pose Landmarker** running in the browser (33 landmarks) + deterministic rule engines: clinical posture measures (`src/lib/clinicalKnowledge.ts`), ergonomics RULA/REBA/NIOSH (`src/lib/ergo/*`). No server-side inference, no LLM. |
| Backend | 52 Next.js route handlers under `src/app/api`. MongoDB Atlas via Mongoose (`hm_*` collections, shared DB with another app). |
| Auth | Custom JWT (HS256, `jsonwebtoken`), bcrypt passwords, token in browser `localStorage`, Bearer header. Roles: admin, doctor, reception, patient. |
| Payments | Razorpay orders + client-side checkout signature verification. No webhook route. |
| Email | nodemailer over SMTP (Gmail). |
| Video | WebRTC with a Mongo-backed polling signaling relay; room link token is the credential. |
| Files | Patient documents stored as base64 data URLs inside MongoDB. |
| Hosting | Vercel (verified from live response headers: `Server: Vercel`, function region `iad1`). |
| Tests | `node:test` with a custom TS loader; no ESLint configured; no CI config in repo. |
| Unused deps | `@supabase/supabase-js` + `supabase/` migration and `src/lib/supabase.ts` (legacy, not used by the live API). |

Consequently the chat/streaming/RAG/prompt-injection sections of the brief are recorded as **Not applicable** rather than invented. The "AI accuracy" work was redirected to what the AI really is: the posture-measurement engine (see `HEALINGMONK_AI_EVALUATION_REPORT.md`).

## 2. Findings summary

| Severity | Found | Fixed & verified by test | Fixed, not fully verified | Open / needs decision |
|---|---|---|---|---|
| P0 | 1 | 0 | 1 (SEO-01, verified on local prod build; needs deploy check) | 0 |
| P1 | 4 | 1 (SEC-01) | 2 (SEC-02, BUG-01) | 1 (SEC-03 partly fixed) |
| P2 | 10 | 2 (SEC-05, SEC-08) | 2 (SEC-06, SEO-02) | 6 (SEC-07, SEC-12 partly fixed, SEC-13, PERF-01, SAFE-01, SAFE-02) |
| P3 | 14 | 2 (SEC-04, BUG-02) | 4 (SEC-09, SEC-10, SEC-11, SEC-20) | 8 (SEC-14–19, SEO-03, PERF-02) |
| **Total** | **29** | **5** | **9** | **15** |

"Fixed, not fully verified" means the code change is in place and type-checks/builds, but the path needs a database or the deployed environment to exercise end to end. No integration test database exists in this repo (see Test Report).

## 3. Findings

Format: ID · severity · component — status. Details (repro, root cause, fix) live in the topic reports.

### Security / privacy (full detail: `HEALINGMONK_AI_SECURITY_REPORT.md`)
- **SEC-01 · P1 · mailer** — HTML injection in every transactional email; public booking lets anyone pick name, text **and recipient**, so the clinic's SMTP could send branded phishing to any address. **Fixed + tested.**
- **SEC-02 · P1 · `POST /api/payments/order`, `/verify`** — any signed-in account (even self-registered) could create payment rows on any patient id and read that patient's name. **Fixed** (patients restricted to their linked records); needs DB integration test.
- **SEC-03 · P1 · auth** — tokens valid up to 365 days, no server-side revocation: password reset, role change and deactivate→re-enable left old tokens working. **Partly fixed**: token versioning revokes on password reset / role change / deactivation. Logout is still client-only; expiry length unchanged (product decision).
- **SEC-04 · P3 · auth** — JWT algorithm not pinned; malformed `sub` reached the DB. **Fixed + tested.**
- **SEC-05 · P2 · `/api/meetings/signal`** — accepted objects as the room token (operator injection), any `kind`, unbounded payloads, and DELETE wiped any token's signals. **Fixed + tested.**
- **SEC-06 · P2 · `POST /api/public/booking`** — returned the internal id of an EXISTING patient matched by mobile/email (anonymous "is this phone a patient?" probe); accepted past dates. **Fixed.**
- **SEC-07 · P2 · paid guest assessment** — unlocked solely by a `localStorage` value; anyone can bypass the paywall. **Open — product decision.**
- **SEC-08 · P2 · caching/indexing** — public report JSON (health data + photos) had no `no-store`/`noindex`; private SPA routes had no `X-Robots-Tag`. **Fixed + verified on local prod build.**
- **SEC-09 · P3** — SVG data URLs accepted for reference images. **Fixed.**
- **SEC-10 · P3** — raw provider error messages returned to clients on order failure. **Fixed.**
- **SEC-11 · P3** — malformed ObjectIds in ~20 routes threw unhandled CastErrors (500). **Fixed** (404/empty list).
- **SEC-12 · P2 · dependencies** — 9 advisories. 5 fixed via `npm audit fix` (lockfile only). Remaining: **next (critical, needs 14→16)**, nodemailer (major), postcss (via next), react-router (major). **Open.**
- **SEC-13 · P2** — rate limiter is in-memory per serverless instance; weak on Vercel. **Open.**
- **SEC-14 · P3** — every staff role can open/edit any patient; reception can delete patients and documents; doctors can list all with `?scope=all`. **Design — needs human review.**
- **SEC-15 · P3** — staff welcome email contains the plaintext password; no forced change. **Open.**
- **SEC-16 · P3** — no self-service password reset; 6-character minimum. **Open.**
- **SEC-17 · P3** — public report URL slug embeds the patient's name (PII in URLs, logs, referrers). **Open.**
- **SEC-18 · P3** — meeting chat text is relayed through MongoDB signal documents (short TTL). **Documented.**
- **SEC-19 · P3** — no Razorpay webhook; a checkout closed before `/verify` stays `created`. **Open.**
- **SEC-20 · P3** — report "send to" override accepted any string. **Fixed** (single valid address).

### Functional bugs
- **BUG-01 · P1 · emails** — when `APP_BASE_URL` is unset (which the live site's localhost canonical strongly suggests), report emails silently drop the report link and "resend meeting invite" returns 500. **Fixed** with a non-empty fallback; production env must still be confirmed.
- **BUG-02 · P3 · receipts** — card/UPI payments were labelled "Cash" on emailed receipts. **Fixed + tested.**

### SEO / performance (detail: SEO and Performance reports)
- **SEO-01 · P0 (SEO)** — live site publishes `http://localhost:3000` as canonical, sitemap URLs, robots `Sitemap:`/`Host:`, OG/JSON-LD URLs. **Fixed in code** (production default origin); verified on a local production build.
- **SEO-02 · P2** — marketing pages are client-rendered only; non-JS crawlers saw a spinner. **Partly fixed** (`<noscript>` heading/summary/links).
- **SEO-03 · P3** — robots.txt disallows private paths, so Google cannot read their `noindex`. Acceptable trade-off; documented.
- **PERF-01 · P2** — every page is rendered by a function in `iad1` (US East); measured TTFB 0.90 s from India. **Open** (region/static-route change needs approval; a static-params attempt was reverted, see Performance report).
- **PERF-02 · P3** — patient documents (up to ~3.7 MB each) stored as base64 in MongoDB documents. **Open.**

### Healthcare safety (detail: Evaluation report)
- **SAFE-01 · P2** — guest self-assessment asks people in pain to perform movements, with no "stop if pain worsens / seek urgent care if…" guidance. **Open — needs clinician-written copy.**
- **SAFE-02 · P2** — severity thresholds cite sources but are not validated against clinician measurements on real captures. **Open.**
- Disclaimers ("not a medical diagnosis") present on report screen, PDF and About page — now enforced by a test.

### UI/UX
Not performed in this pass. No browser/device testing was done; no visual changes were made. See Test Plan for what remains.

## 4. Changed files
39 modified + 3 new test files. Source: `next.config.mjs`, `package-lock.json`, `src/middleware/auth.ts`, `src/lib/seo.ts`, `src/lib/server/mailer.ts`, `src/lib/server/models/User.ts`, `src/services/api.ts`, `src/app/[[...slug]]/page.tsx`, and 31 route handlers under `src/app/api/`. Tests: `tests/security-hardening.test.mjs`, `tests/clinical-eval.test.mjs`, `tests/eval/clinical-measurement-cases.json`.

Schema: `hm_users.tokenVersion` (Number, default 0) added — additive, no migration needed; existing tokens stay valid until their account's first revocation event.

## 5. Recommended deployment sequence
1. In Vercel → Production env: set `NEXT_PUBLIC_SITE_URL=https://ai.thehealingmonk.in` and `APP_BASE_URL=https://ai.thehealingmonk.in` (the code now defaults correctly, but explicit is better). Confirm SMTP and Razorpay vars exist.
2. Deploy this branch to a **Preview** deployment first.
3. On preview, run the checks in `HEALINGMONK_AI_TEST_REPORT.md` §5 (login per role, patient report access, booking email rendering, meeting join, payment order as patient).
4. Promote to production; verify `/robots.txt`, `/sitemap.xml`, canonical on `/pricing`, `X-Robots-Tag` on `/admin` and `/api/*`.
5. Resubmit the sitemap in Google Search Console.
6. Separately plan: Next.js 16 upgrade (critical advisory), function region, paywall enforcement, password reset.
