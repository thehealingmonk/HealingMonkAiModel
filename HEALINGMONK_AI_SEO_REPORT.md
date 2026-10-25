# HealingMonk AI — SEO Report

Route classification: see `HEALINGMONK_AI_ROUTE_INVENTORY.md`. Indexable: `/`, `/technology`, `/assessments`, `/how-it-works`, `/pricing`, `/about`. Everything else is noindex; private data is never in the sitemap or metadata.

## Live production state (fetched 2026-10-25, before this change is deployed)
| Check | Live value | Verdict |
|---|---|---|
| `robots.txt` Sitemap / Host | `http://localhost:3000/sitemap.xml` / `http://localhost:3000` | **Broken** |
| `sitemap.xml` `<loc>` | `http://localhost:3000/...` | **Broken** |
| Home `<link rel=canonical>` | `http://localhost:3000` | **Broken** |
| Title / description | unique per marketing page, server-rendered | OK |
| Unknown URL `/nope` | 404 | OK |
| `/admin`, `/r/x` | 200 with `<meta robots noindex>` (no header) | OK, header added now |

## SEO-01 · P0 — localhost canonical origin (FIXED in code)
- **Root cause:** `SITE_URL = NEXT_PUBLIC_SITE_URL || APP_BASE_URL || 'http://localhost:3000'`; neither variable is set in the production build, and robots/sitemap are pre-rendered at build time.
- **Fix:** production builds default to `https://ai.thehealingmonk.in` (`PRODUCTION_ORIGIN` in `src/lib/seo.ts`), identical on server and in the browser bundle. `NEXT_PUBLIC_SITE_URL` still overrides.
- **Verified** on a local production build: robots `Sitemap: https://ai.thehealingmonk.in/sitemap.xml`, sitemap locs on the production origin, `/pricing` canonical `https://ai.thehealingmonk.in/pricing`.
- **Still do:** set `NEXT_PUBLIC_SITE_URL` in Vercel; after deploy, resubmit the sitemap and request reindexing in Search Console.

## SEO-02 · P2 — client-only rendering (PARTLY FIXED)
The whole UI is `ssr:false`; non-JS crawlers and link previews saw only a spinner. Added a server-rendered `<noscript>` block on indexable pages with the page's H1, description and links to all public pages (same content as the SPA — not cloaking). Google renders JS, so the main win is for other crawlers. Full fix = server-render marketing pages (bigger refactor; ties in with PERF-01b).

## Other checks
| Item | Result |
|---|---|
| Per-route metadata on server + client (`RouteMeta`) | OK, unique titles/descriptions |
| Private routes: noindex meta + new `X-Robots-Tag` header; `/api/*` noindex + no-store | Fixed (header part) |
| robots.txt disallows `/r/`, `/m/`, `/assessment`, dashboards | Kept. Trade-off: Google can't fetch those pages to see `noindex`, but they're secret-link pages, so not fetching them is preferred for privacy. |
| `Host:` directive in robots | Non-standard (ignored by Google); harmless |
| Structured data | Organization + WebSite only, matching visible content. No reviews/ratings/medical claims — correct, nothing added. |
| OG image | external Pexels URL — works; consider a branded image on the own domain |
| Health claims | About page states estimates "may not be accurate" and are "not medically verified" — good. No invented credentials or accuracy figures found. |
| HSTS `preload` on a subdomain | preload list only accepts the apex domain; harmless but ineffective here |
| Image alt text / heading structure / internal links | not audited in a browser — open |
| Core Web Vitals | not measured — open (needs PageSpeed on production) |

## Production verification after deploy
1. `curl https://ai.thehealingmonk.in/robots.txt` → production sitemap URL.
2. `curl https://ai.thehealingmonk.in/sitemap.xml` → 6 production URLs.
3. View source of `/pricing` → canonical `https://ai.thehealingmonk.in/pricing`.
4. `curl -I .../admin` and `.../api/health` → `X-Robots-Tag: noindex, nofollow`.
5. Search Console: resubmit sitemap, URL-inspect `/` and `/pricing`; check "Duplicate, Google chose different canonical" clears over the following weeks.

No ranking or traffic outcome is promised.
