# HealingMonk AI — Route Inventory

Source of truth: `src/lib/seo.ts` (`APP_PATH_PATTERNS`, `ROUTE_META`), `src/features/router/AppRouter.tsx`, `src/app/api/**/route.ts`. Classes: **Public-indexable**, **Public-noindex**, **Private** (login + role), **API**.

## Pages (all served by `src/app/[[...slug]]/page.tsx`, client SPA)

| Path | Class | Guard | Indexing |
|---|---|---|---|
| `/`, `/technology`, `/assessments`, `/how-it-works`, `/pricing`, `/about` | Public-indexable | none | in sitemap, own canonical |
| `/login` | Public-noindex | redirects signed-in users to their role home | noindex meta + header, robots-disallowed |
| `/ergo` | Public-noindex | none | noindex meta |
| `/assessment`, `/assessment/positions`, `/assessment/capture`, `/assessment/report` | Public-noindex (paid flow) | client `isSubscribed()` only (SEC-07) | noindex, disallowed |
| `/assessment/report/:id`, `/r/:slug` | Public-noindex (secret link = credential) | none — 51-bit random suffix | noindex, disallowed |
| `/m/:token` | Public-noindex (meeting link = credential) | token; staff view needs JWT + `?host=1` | noindex, disallowed |
| `/admin/*` | Private | client `RequireRole('admin')`; data via admin APIs | noindex |
| `/doctor/*` | Private | `RequireRole('doctor')` | noindex |
| `/reception/*` | Private | `RequireRole('reception')` | noindex |
| `/patient/*` | Private | `RequireRole('patient')` | noindex |
| anything else | — | real 404 | — |
| `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, `/icon.svg` | static | — | — |

Client guards only control what renders; every data request is authorised server-side.

## API routes

Legend: A=admin D=doctor R=reception P=patient (linked), `auth`=any signed-in user, `-`=no login.

| Route | Methods | Who | Ownership / notes |
|---|---|---|---|
| `/api/health` | GET | - | `{ok:true}` |
| `/api/permissions` | GET | - | static role→permission map |
| `/api/auth/login` | POST | - | rate-limited per IP + per account |
| `/api/auth/register` | POST | - | creates patient (first user ever → admin); rate-limited |
| `/api/auth/me` | GET | auth | |
| `/api/users` | GET, POST | A | |
| `/api/users/[id]` | PATCH, DELETE | A | revokes sessions on password/role change; no self-delete/demote |
| `/api/users/[id]/active` | PATCH | A | revokes sessions on disable |
| `/api/users/doctors` | GET | A D R | |
| `/api/admin/stats`, `/api/admin/analytics` | GET | A | |
| `/api/patients` | GET, POST | A D R | doctors default to own patients (`?scope=all` widens) |
| `/api/patients/[id]` | GET, PATCH, DELETE | A D R | clinic-wide staff access (SEC-14) |
| `/api/patients/[id]/assign` | PATCH | A D R | |
| `/api/patients/[id]/account` | GET A D R; POST A | | POST links/resets patient login, revokes sessions |
| `/api/patients/[id]/reports` | GET | A D R | |
| `/api/patients/[id]/documents` | GET, POST | A D R | images/PDF data URLs only, 10 files, ~3.7 MB each |
| `/api/patients/[id]/documents/[docId]` | GET, DELETE | A D R | scoped to patient id |
| `/api/reports` | GET A D; POST D A | | |
| `/api/reports/[id]` | GET A D P; DELETE A | | patient: own linked record only, 404 otherwise |
| `/api/reports/[id]/notes` | PATCH | D A | |
| `/api/reports/[id]/send` | POST | D A | |
| `/api/me/reports`, `/me/appointments`, `/me/payments`, `/me/packages` | GET | auth | scoped to linked patient records; unlinked → empty |
| `/api/appointments` | GET, POST | A D R | |
| `/api/appointments/[id]/status` | PATCH | A D R | |
| `/api/appointments/[id]/reschedule` | PATCH | A D R | doctor: own appointments only |
| `/api/payments` | GET | A D R | |
| `/api/payments/[id]` | PATCH, DELETE | A R | |
| `/api/payments/cash` | POST | A R | |
| `/api/payments/order` | POST | auth | **patient: own records only (SEC-02 fix)** |
| `/api/payments/verify` | POST | auth | **patient: own records only** |
| `/api/packages` | GET A D R; POST A R | | |
| `/api/packages/[id]` | PATCH, DELETE | A R | |
| `/api/packages/[id]/attendance` | POST, DELETE | A D R | |
| `/api/meetings` | GET, POST | A D | doctor: own meetings |
| `/api/meetings/[id]` | GET, PATCH, DELETE | A D | doctor: own meetings |
| `/api/meetings/[id]/send` | POST | A D | doctor: own meetings |
| `/api/meetings/room/[token]` | GET | - (token) | staff view only with JWT + `?host=1` |
| `/api/meetings/signal` | GET, POST, DELETE | - (token) | validated (SEC-05) |
| `/api/public/booking` | POST | - | rate-limited; no ids returned |
| `/api/public/reports` | POST | - / D A | create open; update needs edit key or clinical staff |
| `/api/public/reports/[id]` | GET | - (id) | no-store, noindex |
| `/api/subscription/order`, `/verify` | POST | - | rate-limited; price from server plan table |
| `/api/custom-positions` | GET auth; POST D A | | raster images only |
| `/api/custom-positions/[id]` | DELETE | D A | |
| `/api/ideal-postures` | GET auth; PUT D A | | raster images only |
| `/api/position-presets` | GET, PUT | D A | admin may target a doctor |
