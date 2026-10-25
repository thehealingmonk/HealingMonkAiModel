# HealingMonk AI — Performance Report

No LLM, so time-to-first-token / streaming / provider retries are **not applicable**. Relevant paths: page delivery, client bundle, MediaPipe model load, API → MongoDB Atlas latency.

## Measurements (actual, not estimated)

### Production (single sample each, from the audit machine in India, 2026-10-25)
| Request | Result |
|---|---|
| `GET https://ai.thehealingmonk.in/` | TTFB **0.90 s**, 12.4 KB HTML, `Cache-Control: private, no-store`, `X-Vercel-Id: bom1::iad1::…` → edge Mumbai, **function in US East (iad1)** |

One sample is not a benchmark; repeat with WebPageTest / Vercel Speed Insights before deciding.

### Local production build (`next build` + `next start`, same machine)
| | Before (baseline build) | After |
|---|---|---|
| Shared first-load JS | 88.4 kB | 88.4 kB (unchanged) |
| Catch-all page JS | 1.45 kB / 89.8 kB first load | unchanged |
| Marketing page TTFB, rendered on demand | ~30–140 ms | same (static attempt reverted, below) |
| Marketing page TTFB, pre-rendered (experiment) | — | ~10 ms |

Core Web Vitals (LCP/INP/CLS): **not measured** — no browser automation was available in this session. Needs Lighthouse/PageSpeed on production.

## Bottlenecks found
- **PERF-01 · P2 — function region.** Every page and API call runs in `iad1`. If the Atlas cluster is in Mumbai (not verifiable from code), each API request crosses the globe 1+ times per query. Recommendation: set Vercel function region to match the Atlas region (`vercel.json` `"regions"` or project settings). **Infrastructure change — not made without approval.**
- **PERF-01b — marketing pages are dynamic.** The single catch-all page is server-rendered per request. Adding `generateStaticParams` cut local TTFB to ~10 ms but, in Next 14, also made every other URL under the catch-all a year-cached ISR page (unbounded cache growth from random URLs, e.g. `/r/<anything>`). **Reverted.** Proper fix: move the 6 marketing pages to their own static routes that mount the same SPA.
- **PERF-02 · P3 — base64 documents in MongoDB.** Patient files up to ~3.7 MB are stored inline; list endpoint correctly omits data, but storage/egress cost and 16 MB doc limits apply. Consider object storage (Cloudinary credentials already exist in `.env`).
- **Client-only rendering.** Content appears only after JS + lazy chunk load; LCP depends on JS. Dashboards and MediaPipe are already lazy-loaded per role (good).
- MediaPipe model/WASM: preconnect hints already present in `layout.tsx`.
- Auth: per-user 15 s cache + in-flight dedupe in `src/middleware/auth.ts` already removes duplicate user lookups for parallel requests (good).
- DB: Mongoose connection memoised; indexes exist on patient list paths. No slow-query data available (needs Atlas profiler access).

## Reliability items reviewed
- Request timeout on the client: 60 s (`services/api.ts`).
- Meeting room fetch returns 503 on transient DB errors and the client retries (good).
- Mongo connect: failed promise is dropped so the next request retries (good).
- Razorpay calls: no timeout on `fetch` to `api.razorpay.com` — **open (P3)**; add `AbortSignal.timeout(10_000)`.

## Changes made in this area
None retained beyond the reverted experiment; the X-Robots/Cache headers add no measurable cost.
