# HealingMonk AI — Feature Matrix

Status key: **Verified** = exercised by an automated test in this audit · **Reviewed** = source read, logic sound, not executed end to end · **Changed** = modified in this audit · **N/A** = does not exist in the code.

| Feature | Exists | Roles | Status | Notes |
|---|---|---|---|---|
| Marketing site (6 pages) | yes | public | Reviewed, Changed (SEO) | client-rendered; noscript fallback added |
| Register / login / session restore | yes | all | Reviewed, Changed | token versioning added |
| Logout | yes | all | Reviewed | client-only (SEC-03) |
| Password reset (self-service) | **no** | — | N/A | admin reset only |
| Role dashboards (admin/doctor/reception/patient) | yes | per role | Reviewed | not browser-tested |
| User management | yes | admin | Reviewed, Changed | input validation, revocation |
| Patients CRUD, assign doctor | yes | staff | Reviewed, Changed | malformed-id handling |
| Patient documents (upload/preview/delete) | yes | staff | Reviewed | base64 in MongoDB |
| Patient login provisioning | yes | admin | Reviewed, Changed | |
| Appointments (book/reschedule/status, calendar) | yes | staff | Reviewed, Changed | |
| Public booking form | yes | public | Reviewed, Changed | no ids leaked |
| Clinical AI assessment (MediaPipe capture → measures) | yes | doctor, paid guest | **Verified (measurement engine)** | 32-case eval suite |
| Ergonomics assessment (RULA/REBA/NIOSH) | yes | public `/ergo` | Verified (pre-existing tests) | |
| Reports: create, notes, PDF, email, public link | yes | doctor/admin, patient | Reviewed, Changed | email escaping, no-store |
| Ideal postures / custom positions / presets | yes | doctor/admin | Reviewed, Changed | raster only |
| Payments: desk (cash/card/UPI) | yes | admin, reception | Reviewed, Changed | receipt label fix |
| Payments: Razorpay order/verify | yes (API only, no UI caller) | auth | Changed | ownership check |
| Guest subscription (Razorpay) | yes | public | Reviewed | paywall client-side (SEC-07) |
| Monthly packages & attendance | yes | staff | Verified (date logic tests) | |
| Online meetings (WebRTC, lobby, chat, AI toggle) | yes | doctor/admin + patient link | Reviewed, Changed (signal validation) | not browser-tested |
| Admin analytics | yes | admin | Reviewed | |
| PWA install | yes | all | Reviewed | |
| Hindi UI strings / voice guidance | partial | assessment flow | Reviewed | no automated test |
| AI chat, conversation history, streaming | **no** | — | N/A | |
| LLM provider, prompts, RAG, embeddings | **no** | — | N/A | |
| Usage limits / quotas | **no** (only rate limits) | — | N/A | |
| Error monitoring / analytics SDK | **no** | — | N/A | `console.error` only |
| CI pipeline, ESLint | **no** | — | N/A | |
