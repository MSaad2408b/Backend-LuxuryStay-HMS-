# LuxuryStay HMS — Backend

Express 5 + MongoDB API for a hotel management system: reservations, billing, housekeeping, maintenance, guest services, reporting, audit and privacy — with JWT auth, role-based access control and Swagger docs.

It is the server half of the MERN eProject; the React client lives in [`../frontend`](../frontend/README.md).

| | |
| --- | --- |
| Runtime | Node 18+ · Express 5 |
| Database | MongoDB · Mongoose 8 |
| Auth | JWT HS256 access token (2d) + rotating opaque refresh token (30d) |
| Validation | Joi schemas per route |
| Docs | Swagger UI at `/api-docs` · OpenAPI JSON at `/api-docs.json` |
| Tests | 43 tests across 8 Jest suites (in-memory MongoDB) |

---

## 1. Requirements

- **Node.js 18+** — Express 5 requires it.
- **MongoDB 6+** — local (`mongodb://127.0.0.1:27017/luxurystay_hms`) or Atlas.
- Optional: **MongoDB Database Tools** (`mongodump`) for backups, **SMTP** credentials for email.

## 2. Quick start

```bash
npm install
copy .env.example .env      # Windows
# cp .env.example .env      # macOS / Linux
npm run dev                 # http://localhost:5000
```

Verify it is alive:

```bash
curl http://localhost:5000/api/health
```

Open **http://localhost:5000/api-docs** for the interactive explorer. Protected endpoints accept the `token` returned by login (Swagger → Authorize).

### Create the first admin

`POST /api/auth/register` always creates a **guest**. Seed one admin directly in MongoDB, then create staff through the API:

```js
// scripts/create-admin.js — run once with `node scripts/create-admin.js`
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const User = require("../models/UserSchema");
const config = require("../config/env");

(async () => {
  await mongoose.connect(config.mongoUri);
  await User.create({
    name: "System Admin",
    email: "admin@yourdomain.com",
    contact: "9876543210",
    address: "Hotel Headquarters",
    password: await bcrypt.hash("ChangeMe123!", 12),
    role: "admin",
    privacyConsent: { privacyPolicy: true, version: "v1.0", acceptedAt: new Date() },
  });
  await mongoose.disconnect();
})();
```

After that, `POST /api/users` creates managers, receptionists and housekeeping staff.

## 3. Environment variables

Copy `.env.example`; every value below is read by `config/env.js`.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `5000` | HTTP port |
| `NODE_ENV` | `development` | `production` enables HTTPS enforcement and secret assertions |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/luxurystay_hms` | Pooled connection, 3 retries |
| `CLIENT_URL` | `http://localhost:5173` | Used for links in emails |
| `CORS_ORIGINS` | `CLIENT_URL` | Comma-separated allowlist — must include the frontend origin |
| `ENFORCE_HTTPS` | `false` (true in production) | Rejects non-HTTPS requests behind a proxy |
| `JWT_SECRET` | dev fallback | **Required in production** |
| `JWT_REFRESH_SECRET` | dev fallback | **Required in production**, must differ from `JWT_SECRET` |
| `JWT_EXPIRES_IN` | `2d` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Refresh token lifetime (stored hashed) |
| `ENCRYPTION_KEY` | dev fallback | **Required in production** — AES-256-GCM for PII |
| `PRIVACY_POLICY_VERSION` | `v1.0` | Recorded with consent |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Global window (15 min) |
| `RATE_LIMIT_MAX` | `300` | Global requests per window |
| `AUTH_RATE_LIMIT_MAX` | `20` | Login/register/refresh attempts per window |
| `SMTP_HOST` / `PORT` / `SECURE` | empty / `587` / `false` | Leave empty to disable email |
| `SMTP_USER` / `PASS` / `FROM` | empty | Sender identity |
| `BACKUP_ENABLED` | `false` | Enables the cron scheduler |
| `BACKUP_CRON` | `0 2 * * *` | Daily at 02:00 |
| `BACKUP_DIR` | `./backups` | Output directory |
| `BACKUP_RETENTION_DAYS` | `7` | Prune older dumps |
| `LOG_LEVEL` | `info` | `debug` for verbose logs |

Production startup throws if `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` or `MONGO_URI` are missing.

## 4. Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Production server |
| `npm run dev` | Nodemon with reload |
| `npm test` | Jest + Supertest suite (in-memory MongoDB) |
| `npm run test:watch` | Watch mode |
| `npm run check` | Syntax-check all 95 JS files |
| `npm run backup` | One `mongodump` immediately |
| `npm run repair-permissions` | Realign stored permissions with each user's role (`-- --dry-run` to preview) |
| `npm run audit` | `npm audit --audit-level=high` |

## 5. Architecture

```
React client ──HTTPS/JWT──> Express app
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   routes/ (Joi)      middleware/ (auth,       controllers/
   one file/module    RBAC, rate limit,        request handlers
                      validation, errors)            │
                                                     ▼
                                     services/ + models/ + utils/
                                     billing, locks, mail, audit,
                                     events, backup, settings
                                                     │
                                                 MongoDB
```

**Design decisions**

- **Two tokens.** Stateless HS256 access token for speed; opaque refresh token stored **hashed** and rotated on every use. Logout blacklists the access token (`TokenBlacklist`) and revokes refresh tokens. Password changes revoke every refresh token.
- **RBAC in two layers.** `authorizeRoles(...)` for coarse role checks and `requirePermission(...)` for granular ones. Permissions are copied from the role on user creation and can be overridden per user.
- **Per-resource locks.** `utils/lock.js` serialises booking writes per room, so two simultaneous requests cannot double-book the same dates. Overlap is also re-checked inside the lock.
- **One billing engine.** `services/invoiceService.js` is the only place invoices are created: manual invoices, automatic check-out billing, and completed service charges all go through it.
- **Mongo-backed rate limiting.** Counters live in MongoDB so limits hold across multiple API instances; falls back to memory if the DB is unavailable.
- **PII encrypted at rest.** `contact` and `address` use AES-256-GCM with getters that return plaintext to the app; passwords use bcrypt.
- **Real-time room status.** `GET /api/rooms/events` is an SSE stream emitting `room:status` whenever a room changes. Sticky sessions are only needed if you run several API instances.
- **Audit everything that matters.** Logins, role changes, bookings, invoices, settings and privacy actions are written to `AuditLog` with actor, IP and details.
- **Structured logs.** JSON lines via `utils/logger.js`; `/api/admin/metrics` exposes uptime, request count, error count and average latency.

## 6. Roles and permissions

| Role | Scope |
| --- | --- |
| `admin` | All 21 permissions: users, roles, rooms, bookings, invoices, housekeeping, maintenance, service requests, reports, audit, settings, backup |
| `manager` | Operations + reports + audit + settings; **no** user management |
| `receptionist` | Front desk: bookings, check-in/out, invoices, guest directory, housekeeping, maintenance, service requests |
| `housekeeping` | Room status, own assigned tasks, maintenance updates |
| `guest` | Own bookings, invoices, service requests, maintenance reports, feedback, privacy; public room catalogue |

Permission strings live in `config/permissions.js`. `PUT /api/users/:id/permissions` overrides them for one user; `npm run repair-permissions` resets drift back to the role defaults.

## 7. API surface

All routes are prefixed with `/api`. Errors use `{ "message": string, "errors"?: [{ field, message }] }` with 400/401/403/404/409/429/500.

| Base path | Auth | Covers |
| --- | --- | --- |
| `/auth` | mixed | Register, login, refresh, logout, profile, change/forgot/reset password |
| `/users` | admin (reads: staff) | Staff and guest profiles, roles, permissions, activate/deactivate |
| `/rooms` | public reads | Inventory, filters, availability search, status, stats, SSE stream |
| `/bookings` | bearer | Create, list, detail, update, cancel, check-in, check-out |
| `/invoices` | bearer | Create, charges, payment status, printable HTML, email |
| `/housekeeping` | bearer | Tasks; completing one releases the room |
| `/maintenance` | bearer | Report, assign, resolve; reporter email on resolution |
| `/feedback` | bearer | Guest ratings/comments, manager replies |
| `/service-requests` | bearer | Room service, wake-up, transport, laundry; billing on completion |
| `/reports` | `view_reports` | Dashboard, occupancy, revenue, feedback, forecast, pricing, custom, CSV |
| `/settings` | admin | Tax rate, hotel policy, notification toggles |
| `/notifications` | bearer | In-app inbox, read state, preferences, broadcast |
| `/audit-logs` | admin/manager | Paginated, filterable audit trail |
| `/privacy` | bearer | Consent, JSON export, account anonymisation |
| `/admin` | `manage_settings` | Overview, metrics, health, manual backup |

`GET /api/health` and `GET /api/rooms` are public by design; every write is authenticated.

### Key flows

**Login → refresh → logout**

1. `POST /auth/login` → `{ token, refreshToken, expiresIn, user }`.
2. Send `Authorization: Bearer <token>`.
3. On 401, `POST /auth/refresh { refreshToken }` returns a new pair and revokes the old refresh token.
4. `POST /auth/logout` blacklists the access token and revokes refresh tokens.

**Reservation → check-out**

1. `GET /rooms/availability/search?checkInDate=&checkOutDate=&guests=` — excludes overlapping reservations.
2. `POST /bookings` — validates capacity, dates and overlap under a room lock; room becomes `reserved`; guest + receptionist are notified.
3. `PATCH /bookings/:id/check-in` — issues a key card number; room becomes `occupied`.
4. `PATCH /bookings/:id/check-out` — room becomes `cleaning`, a turnover housekeeping task is created, and an invoice is generated automatically. Returns `invoiceId`.
5. `GET /invoices/:id/print` — server-rendered HTML; `POST /invoices/:id/send-email` — SMTP.

Tax comes from the `tax_rate_percent` system setting (default `0`) unless an explicit `tax` is sent when creating an invoice.

**Privacy / GDPR**

- `GET|PUT /privacy/consent` — review or withdraw consent.
- `GET /privacy/export` — all personal data as JSON.
- `DELETE /privacy/me` — anonymises the account, revokes sessions and strips personal fields from related records.

**Real-time rooms**

Connect to `GET /rooms/events` with a Bearer token. Events look like `event: room:status` with `{ roomId, status, roomNumber, at }`.

## 8. Data models

| Model | Key fields |
| --- | --- |
| `User` | `name, email, password, contact*, address*, role, permissions[], preferences, isActive, privacyConsent, notificationPreferences` |
| `Room` | `roomNumber, type, description, pricePerNight, capacity, amenities[], floor, status, isActive` |
| `Booking` | `guest→User, room→Room, checkInDate, checkOutDate, actualCheckIn/Out, status, guestsCount, totalAmount, paymentStatus, confirmationCode, specialRequests, statusHistory[], keyCard, invoice→Invoice` |
| `Invoice` | `invoiceNumber, booking→Booking, guest→User, charges[{description, amount, type}], subtotal, tax, discount, totalAmount, paymentStatus, paymentMethod, paidAt, notes` |
| `HousekeepingTask` | `room→Room, assignedTo→User, taskType, status, priority, notes, scheduledAt, completedAt` |
| `MaintenanceRequest` | `room→Room, reportedBy→User, assignedTo→User, issue, description, priority, status, resolutionNotes, resolvedAt` |
| `ServiceRequest` | `guest→User, booking→Booking, serviceType, details, requestedFor, status, handledBy→User, cost, billed` |
| `Feedback` | `guest→User, booking→Booking, rating(1–5), comment, category, adminReply, repliedBy, repliedAt` |
| `Notification` | `recipient→User, recipientRole, title, message, type, isRead, relatedId` |
| `AuditLog` | `user→User, action, resource, resourceId, details, ipAddress` |
| `SystemSetting` | `key, value (Mixed), description, updatedBy` |
| `RefreshToken` / `TokenBlacklist` / `RateLimit` | Auth and throttling infrastructure with TTL indexes |

\* `contact` and `address` are encrypted at rest.

Default system settings (`utils/settings.js`): `tax_rate_percent: 0`, `currency: INR`, `check_in_time: 14:00`, `check_out_time: 11:00`, `cancellation_hours: 24`, `privacy_policy_version: v1.0`. They are seeded as fallbacks, not documents — create them via `PUT /api/settings` to override.

## 9. Project structure

```
backend/
  app.js               Express app, middleware order, route mounting
  server.js            Boot, graceful shutdown, backup scheduler
  config/              env, db connection, permissions
  routes/              one router per module
  controllers/         request handlers (thin)
  services/            invoice engine
  models/              Mongoose schemas + indexes
  middleware/          auth, RBAC, validation, rate limit, errors, security
  validation/          Joi schemas
  utils/               logger, mail, encryption, locks, events, settings, audit, backup
  docs/                OpenAPI spec, API guide, SRS coverage
  scripts/             check-syntax, run-backup, repair-permissions
  tests/               8 Jest suites
```

## 10. Testing and quality

```bash
npm test        # 43 tests / 8 suites
npm run check   # syntax check, 95 files
npm run audit   # dependency audit
```

The suite runs against `mongodb-memory-server`, so no external database is needed. It covers token rotation/revocation, consent, RBAC and permission overrides, booking races and overlap, check-in/out automation, invoicing and service charges, housekeeping/room-status consistency, privacy export/deletion, reports and CSV, health, metrics and the OpenAPI document.

## 11. Operations

**Backups** — set `BACKUP_ENABLED=true`, install `mongodump`, and the scheduler runs on `BACKUP_CRON` (02:00 daily), pruning after `BACKUP_RETENTION_DAYS`. Run one now with `npm run backup`; admins can trigger `POST /api/admin/backup`.

**Monitoring** — `GET /api/health` returns status, DB state, uptime, request/error counts and average latency. `GET /api/admin/metrics` returns the same snapshot for dashboards. Logs are JSON lines on stdout.

**Production checklist**

- [ ] Strong, distinct `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `MONGO_URI`
- [ ] `NODE_ENV=production` (HTTPS enforcement + secret assertions)
- [ ] `CORS_ORIGINS` limited to real frontend origins
- [ ] SMTP configured for transactional email
- [ ] `mongodump` available and backups verified (restore once, not just dump)
- [ ] TLS terminated at a reverse proxy forwarding `X-Forwarded-Proto`
- [ ] Alerting on `/api/health`, error rate and disk usage

## 12. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `ECONNREFUSED 127.0.0.1:27017` | MongoDB is not running, or `MONGO_URI` is wrong. Start `mongod`/Atlas and retry. |
| `Origin not allowed by CORS` | Add the exact frontend origin (scheme + host + port) to `CORS_ORIGINS`, restart. |
| `401 Invalid or expired token` | Access token expired — call `/auth/refresh`. If refresh also fails, sign in again. |
| `403 Your account is inactive` | An admin deactivated the account; reactivate via `PATCH /users/:id/activate`. |
| `403 Missing required permission` | Role lacks the permission; adjust role or `PUT /users/:id/permissions`. |
| `429 Too many requests` | Auth limit is 20 per 15 min; wait for the window or raise `AUTH_RATE_LIMIT_MAX` in development. |
| `EADDRINUSE :5000` | Another process holds the port. Stop it or change `PORT` (and update the frontend `VITE_API_URL`). |
| Email endpoints return `delivered: false` | SMTP not configured; set the `SMTP_*` variables. |
| `409 Invoice already exists for this booking` | One invoice per booking — open the existing one instead. |
| `409 Room is not available for the selected dates` | Overlapping reservation; choose other dates or a different room. |
| `400 Invalid resource id` | A non-ObjectId was passed in the URL. |

## 13. Related documentation

- **[`docs/API_GUIDE.md`](docs/API_GUIDE.md)** — copy-paste curl/PowerShell flows and FAQ.
- **[`docs/SRS_COVERAGE.md`](docs/SRS_COVERAGE.md)** — requirement-by-requirement mapping.
- **`/api-docs`** — Swagger UI generated from `docs/openapi.json`.
- **[`../frontend/README.md`](../frontend/README.md)** — client setup, screen-to-endpoint map and design decisions.
- **[`../documentation/index.html`](../documentation/index.html)** — browsable documentation with screenshots and walkthroughs.

## 14. Scope notes

Backend code covers the API, data rules, security, privacy, reporting and tests. These SRS deliverables are not backend code and live outside this folder:

- Admin/guest UI, responsive layout, accessibility — React frontend.
- Cross-browser QA and a demo video — project deliverables.
- A formal external penetration test — process activity. The automated suite plus Helmet, CORS allowlisting, HTTPS enforcement, rate limiting, RBAC and encryption cover the baseline, not a substitute for a real pentest.
