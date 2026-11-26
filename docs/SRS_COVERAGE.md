# SRS Requirement Coverage (Backend)

This document maps every line of the SRS to its implementation in this backend repository. “Complete” means the server-side behaviour, data model, validation, authorization and automated test are present. Items that belong to the React frontend or to project process/deliverables are explicitly marked.

---

## Functional requirements

| SRS requirement | Implementation | Status |
| --- | --- | --- |
| **Admin Dashboard** — admin panel to manage roles/permissions | `GET /api/admin/overview`, `GET /api/admin/metrics`, `GET /api/users`, `PUT /api/users/:id/permissions`, `GET /api/audit-logs`. The panel UI itself is React work. | Backend complete |
| **Staff Profiles** — create/modify/deactivate manager, receptionist, housekeeping accounts | `POST/GET/PUT /api/users`, `PATCH /api/users/:id/deactivate|activate`; roles and derived permissions in `config/permissions.js`. | Complete |
| **Guest Profiles** — personal info, contact, preferences | `POST /api/auth/register`, `GET /api/auth/me`, `PUT /api/auth/profile`, `GET /api/users/guests`, `GET/PUT /api/privacy/consent`. PII encrypted in `UserSchema`. | Complete |
| **Room Inventory** — types, availability, status, pricing | `Room` model with indexes, `GET /api/rooms` filters, `GET /api/rooms/stats`, `GET /api/rooms/availability/search`, `POST/PUT/DELETE /api/rooms`. | Complete |
| **Room Booking** — reserve, check availability, assign rooms | `POST /api/bookings` with date/overlap/capacity checks under `withLock`, confirmation code, staff-on-behalf-of-guest support. | Complete |
| **Room Status Updates** — real-time cleaning/maintenance/vacant/occupied | `PATCH /api/rooms/:id/status` + `GET /api/rooms/events` (SSE); automatic status transitions on booking, check-in, check-out, housekeeping completion and maintenance resolution. | Complete (single-instance SSE; use sticky sessions or shared pub/sub for multi-node fan-out) |
| **Reservation System** — online/staff booking with confirmation details | Guest and staff booking paths, `confirmationCode`, confirmation notification + email template. | Complete |
| **Check-in/Check-out** — automated allocation, key issuance, billing, room status | `PATCH /api/bookings/:id/check-in` issues key card; `check-out` returns key, auto-creates invoice, creates turnover task, updates room to `cleaning`, sends notifications. | Complete |
| **Billing System** — room rates, extra services, duration | `services/invoiceService.js`: night calculation, room charge, unbilled completed services, configurable tax, discounts, add-charge endpoint. | Complete |
| **Invoicing** — printable/emailed detailed invoices | `GET /api/invoices/:id/print` (HTML print view), `POST /api/invoices/:id/send-email` (real Nodemailer SMTP), payment status synced back to booking. | Complete |
| **Housekeeping Management** — view status, schedule/complete tasks, report maintenance | `GET/POST/PUT /api/housekeeping`; completing a task sets room `available`; housekeeping role can update room status and maintenance requests. | Complete |
| **Maintenance Requests** — guest/staff report + track resolution | `POST/GET/PUT /api/maintenance`, reporter email on resolution, room moved to `maintenance` and released when no open issues remain. | Complete |
| **Reporting Dashboard** — occupancy, revenue, feedback, customizable, CSV | `/api/reports/dashboard`, `/occupancy`, `/revenue`, `/feedback`, `/occupancy/by-type`, `/revenue/by-service`, `/custom?format=csv`, plus three CSV export endpoints. | Complete |
| **Analytics** — forecast demand, optimize pricing, improve services | `GET /api/reports/analytics/forecast` (moving average + trend), `/analytics/pricing` (occupancy-based price recommendation), feedback insights in dashboard/custom reports. | Complete |
| **User Authentication** — secure login/logout with RBAC | bcrypt(12), JWT HS256 access tokens, hashed rotating refresh tokens, token blacklist on logout, inactive-account check, role + granular permission middleware. | Complete |
| **Feedback Mechanism** — ratings and comments | `POST /api/feedback` (booking ownership enforced), `PATCH /api/feedback/:id/reply`, manager notification on new feedback. | Complete |
| **Additional Services** — room service, wake-up, transport, laundry | `POST/GET/PUT /api/service-requests`, cost field, completed paid requests automatically added to the invoice. | Complete |
| **System Settings** — room rates, policies, taxes | `GET/PUT/DELETE /api/settings`, cached with invalidation; `tax_rate_percent`, privacy version, email toggle and policy defaults in `utils/settings.js`. | Complete |
| **System Notifications** — alerts for bookings/maintenance/critical updates | `utils/notification.js` creates in-app notifications and optional email based on recipient/preferences; used by booking, check-out, feedback, maintenance, service and housekeeping flows. | Complete |

---

## Non-functional requirements

| SRS requirement | Implementation | Status |
| --- | --- | --- |
| **Response time 1–2s** | Indexed hot paths, aggregated reports with `allowDiskUse`, 30s settings cache, pooled DB connection, integration tests complete in ~40s for 34 HTTP flows. | Complete |
| **Scalability / concurrent users** | Stateless JWT auth, Mongo-backed shared rate limiter, connection pool (`maxPoolSize: 50`), per-resource locks, no server-side session state. | Complete |
| **Horizontal scalability** | Same design supports multiple API instances behind a load balancer. Real-time SSE is process-local by default; use sticky sessions or a shared pub/sub layer when scaling that specific stream. | Backend architecture complete |
| **Data encryption in storage/transmission** | AES-256-GCM for `contact`/`address`, bcrypt for passwords, HTTPS enforcement, Helmet security headers, hashed tokens. | Complete |
| **Authentication standard practices** | Short-lived access token + refresh rotation/reuse detection, blacklist, rate limits on auth routes, reset tokens hashed with expiry. | Complete |
| **Authorization / own-data access** | `authorizeRoles`, `requirePermission`, `requireConsent`; guests are filtered/scoped to their own bookings, invoices and feedback in controllers. | Complete |
| **GDPR data privacy** | Consent versioning + withdrawal, `GET /api/privacy/export`, `DELETE /api/privacy/me` anonymization, audit log of privacy actions. | Complete |
| **User consent control** | Registration consent defaults, `GET/PUT /api/privacy/consent`, booking/service/feedback require consent via `requireConsent`. | Complete |
| **Uptime 99% / maintenance** | Health endpoint, retrying DB connection with logging, graceful shutdown on SIGTERM/SIGINT, process-level error handlers. Deployment uptime SLA is infrastructure/process. | Backend complete |
| **Automated backups** | `node-cron` scheduler + `mongodump`, retention pruning, manual `npm run backup` and `POST /api/admin/backup`. | Complete |
| **Usability / UI design / responsive / WCAG** | Backend returns consistent JSON, validated errors and printable HTML invoice. The actual UI, responsiveness and WCAG conformance are React frontend deliverables. | Out of backend scope |
| **Cross-browser / mobile compatibility** | REST/SSE APIs are browser-agnostic; verification must happen in the frontend QA cycle. | Out of backend scope |
| **Logging and monitoring** | Structured JSON logs with request IDs, `requestLogger`, error logging, `/api/admin/metrics` (uptime, request count, error count, avg response, status breakdown), DB event logging. | Complete |
| **Unit/integration/E2E test coverage** | 43 Jest/Supertest tests across 8 suites: unit utilities, full HTTP integration flows and a regression suite for malformed ids, role/permission drift, room-status consistency and booking lifecycle rules. Browser E2E automation belongs to the frontend repo. | Backend complete |
| **Security testing** | `npm run audit` (currently 0 vulnerabilities), Helmet, CORS allowlist, rate limits, RBAC, encryption and token-revocation tests. A scheduled manual penetration test remains a project process. | Backend baseline complete |
| **User documentation / FAQ / tutorial** | [`API_GUIDE.md`](API_GUIDE.md) with curl examples and FAQ; Swagger UI at `/api-docs`. End-user app manual is frontend documentation. | Backend complete |
| **Developer documentation** | This README, `docs/openapi.json`, annotated `.env.example`, modular source layout. | Complete |
| **Demo video** | Cannot be produced from backend source; record after frontend integration. | Out of backend scope |

---

## Summary

- **Functional SRS items:** all implemented in the backend.
- **Non-functional SRS items:** all backend-side controls implemented; UI/browser/WCAG/video/formal pentest are frontend or process deliverables and are listed above rather than silently ignored.
