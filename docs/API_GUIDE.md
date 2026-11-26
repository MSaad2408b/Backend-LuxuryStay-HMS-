# LuxuryStay HMS — API User Guide & FAQ

This guide shows the shortest path from a fresh database to a paid, checked-out reservation. All examples assume the API is running at `http://localhost:5000`.

---

## 1. First-time setup

```bash
npm install
copy .env.example .env
npm run dev
```

Open **http://localhost:5000/api-docs** for the interactive explorer. Every protected endpoint has a lock icon in Swagger; click **Authorize** and paste the `token` returned by login.

### Create the first admin

Registration always creates a `guest`. To create an admin, insert one directly in MongoDB and then use the API:

```javascript
// scripts/create-admin.js (one-off example)
const bcrypt = require("bcrypt");
const User = require("../models/UserSchema");

(async () => {
  const password = await bcrypt.hash("Admin@12345", 12);
  await User.create({
    name: "System Admin",
    email: "admin@luxurystay.example",
    contact: "9876543210",
    address: "Hotel Headquarters",
    password,
    role: "admin",
    privacyConsent: { privacyPolicy: true, version: "v1.0", acceptedAt: new Date() },
  });
  process.exit(0);
})();
```

After that, use `POST /api/users` to create managers, receptionists and housekeeping staff.

---

## 2. Common curl flows

### Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"guest@example.com","password":"Password123"}'
```

Copy `token` into a shell variable:

```powershell
$TOKEN = (Invoke-RestMethod -Method Post http://localhost:5000/api/auth/login -ContentType application/json -Body '{"email":"guest@example.com","password":"Password123"}').token
```

### Search and book a room

```bash
curl "http://localhost:5000/api/rooms/availability/search?checkInDate=2026-12-10&checkOutDate=2026-12-12&guests=2" \
  -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:5000/api/bookings \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"room":"<ROOM_ID>","checkInDate":"2026-12-10","checkOutDate":"2026-12-12","guestsCount":2}'
```

### Check in and out (staff token)

```bash
curl -X PATCH http://localhost:5000/api/bookings/<BOOKING_ID>/check-in -H "Authorization: Bearer $ADMIN_TOKEN"
curl -X PATCH http://localhost:5000/api/bookings/<BOOKING_ID>/check-out -H "Authorization: Bearer $ADMIN_TOKEN"
```

Check-out returns `invoiceId`. Open `http://localhost:5000/api/invoices/<INVOICE_ID>/print` in a browser to print it.

### Request a paid service

```bash
curl -X POST http://localhost:5000/api/service-requests \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"booking":"<BOOKING_ID>","serviceType":"laundry","details":"Suit pressing"}'

# Staff marks it complete and gives a cost; it is added to the invoice automatically.
curl -X PUT http://localhost:5000/api/service-requests/<REQUEST_ID> \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"completed","cost":350}'
```

### Download your data / delete your account

```bash
curl http://localhost:5000/api/privacy/export -H "Authorization: Bearer $TOKEN"
curl -X DELETE http://localhost:5000/api/privacy/me \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"confirm":"DELETE","reason":"Closing account"}'
```

---

## 3. FAQ

**Why does an admin get `403 Missing required permission`?**
Permissions are derived from the user's `role` on every request. A stored `permissions` array is only used when an admin has explicitly overridden it with `PUT /api/users/:id/permissions` (`permissionsCustomized: true`). If an account was created by hand, seeded directly in MongoDB, or had its role changed outside the API, its stored list can be stale — the API still grants the role's permissions, so the fix is to restart the server and log in again. To realign the stored data as well, run:

```bash
npm run repair-permissions -- --dry-run   # preview
npm run repair-permissions                # apply
```

**Why is `/api/reports/dashboard` forbidden for a receptionist or housekeeper?**
Reporting is gated by the `view_reports` permission, which only `admin` and `manager` hold by default. Use an admin/manager account, or grant the permission explicitly to that user.

**Why do email endpoints say `smtp_not_configured`?**
SMTP is intentionally optional for local development. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` in `.env` to deliver real email. The API always returns a `delivery` object so the frontend can show the correct status.

**Why did my booking fail with “consent required”?**
`POST /api/bookings`, feedback and service requests require privacy consent. Call `PUT /api/privacy/consent` with `{"privacyPolicy":true}` first.

**How do I rotate an expired access token?**
Call `POST /api/auth/refresh` with the `refreshToken` from login. The old refresh token is invalidated and a new pair is returned. Once a refresh token has been used, reusing it returns `401`.

**What happens after logout?**
The access token is added to a blacklist immediately, and refresh tokens for that user are revoked. A later request with the old token returns `401 Token has been revoked`.

**How are double bookings prevented?**
Each room has a serialization lock, and an overlap query runs inside the lock. Two concurrent requests for the same dates result in one `201` and one `409`.

**How is tax calculated?**
By default from the `tax_rate_percent` system setting (`PUT /api/settings`). Send an explicit `tax` field when creating an invoice to override it for that invoice.

**Where do I see room status changes live?**
Connect an EventSource to `GET /api/rooms/events` with the Bearer token. Events are named `room:status` and include `roomId`, `roomNumber`, `status` and `at`.

**How do I back up the database?**
Install `mongodump`, set `BACKUP_ENABLED=true`, or run `npm run backup` for a one-off backup. Backups are written to `BACKUP_DIR` and pruned after `BACKUP_RETENTION_DAYS`.

---

## 4. Error format

Validation and runtime errors return JSON:

```json
{ "message": "Room is not available for the selected dates" }
```

Validation failures from Joi return the first readable message. Common status codes: `400` invalid input (including malformed ids and unparseable `from`/`to` date filters), `401` unauthenticated/revoked token, `403` missing role/permission/consent, `404` not found, `409` conflict (duplicate email, invoice or overlapping booking), `429` rate limited, `500` unexpected server error.

Booking lifecycle changes are only accepted through `PATCH /api/bookings/:id/check-in`, `/check-out` and `/cancel`. `PUT /api/bookings/:id` updates room, dates, guest count, special requests and payment status; it rejects `status` so the room, key card and invoice cannot drift out of sync.

---

## 5. Related documents

- Swagger reference: `http://localhost:5000/api-docs`
- Requirement mapping: [`SRS_COVERAGE.md`](SRS_COVERAGE.md)
- Setup/environment/production checklist: [`../README.md`](../README.md)
