# HealingMonk AI — Test Report

Run date 2026-10-25 · Node 24.21.0 · npm 11.19.0 · Windows 10 · local only, nothing deployed.

## 1. Results
| Check | Before changes | After changes |
|---|---|---|
| `npm run typecheck` | pass | pass |
| `npm test` | 31 / 31 pass | **80 / 80 pass** (+14 security, +35 evaluation) |
| `npm run build` | pass | pass |
| Lint | not configured (`eslint.ignoreDuringBuilds: true`) | not run |
| `git diff --check` | — | clean |
| `npm audit --omit=dev` | 9 advisories (2 critical) | 4 packages remain (next critical, nodemailer, postcss, react-router — all need major upgrades) |
| Secret scan (git history) | — | no secrets; only `.env.example` ever committed |

## 2. Local production-server verification (`next start`)
Only routes that do not touch the database were requested (`.env` points at the production Atlas cluster).

| Request | Status | Key headers / content |
|---|---|---|
| `/robots.txt` | 200 | `Sitemap: https://ai.thehealingmonk.in/sitemap.xml` |
| `/sitemap.xml` | 200 | locs on `https://ai.thehealingmonk.in` |
| `/pricing` | 200 | canonical `https://ai.thehealingmonk.in/pricing`; `<noscript>` heading present |
| `/admin` | 200 | `X-Robots-Tag: noindex, nofollow`; `<meta robots noindex, nofollow>` |
| `/r/x` | 200 | `X-Robots-Tag: noindex, nofollow` |
| `/nope` | 404 | — |
| `/api/public/reports/bad$id` | 404 | `Cache-Control: private, no-store`, `X-Robots-Tag: noindex` |
| `/api/auth/me` (no token) | 401 | `Cache-Control: private, no-store` |

## 3. Status by category
**Fixed and independently verified (automated test or local server):** SEC-01, SEC-04, SEC-05, SEC-08, BUG-02, SEO-01 (local build), measurement engine eval.

**Fixed but not fully verified (needs DB or deployed env):** SEC-02, SEC-03 (end-to-end revocation), SEC-06, SEC-09, SEC-10, SEC-11, SEC-20, BUG-01, SEO-02.

**Still open:** SEC-07 paywall, SEC-12 major dependency upgrades, SEC-13 rate limiter store, SEC-15/16/17/19, PERF-01 region & static marketing routes, PERF-02 document storage, SAFE-01 red-flag copy, SAFE-02 threshold validation, UI/UX audit, Core Web Vitals.

**Blocked by missing access:** production env vars (Vercel), Atlas region/profiler, Search Console, real-device and browser testing.

**Requires human review / approval:** SEC-03 session lifetime, SEC-07, SEC-14 staff access policy, SAFE-01 clinical copy, Next.js 16 upgrade, function region change, deployment.

## 4. Not performed
- No UI/UX redesign, responsive or accessibility testing (no browser automation in this session).
- No load/concurrency/stress tests (would require an isolated database).
- No tests against production APIs beyond unauthenticated GETs.

## 5. Checks that must pass before release
1. `npm run typecheck && npm test && npm run build` — green.
2. Vercel Production env has `NEXT_PUBLIC_SITE_URL` and `APP_BASE_URL` = `https://ai.thehealingmonk.in`.
3. On a Preview deployment with test accounts:
   - each role logs in and reaches its dashboard; existing sessions still work after deploy (no mass logout);
   - admin resets a test user's password → that user's other session gets 401; admin resetting their own password stays signed in;
   - linked patient sees own reports; another patient's report id → "not found";
   - public booking with HTML in the name → email shows it as plain text, report/meeting emails contain working links;
   - meeting: create, join from a second device, admit, end;
   - desk UPI payment receipt says "UPI".
4. After promotion: SEO verification steps in the SEO report; `curl -I /api/health` shows `X-Robots-Tag` and `no-store`.
