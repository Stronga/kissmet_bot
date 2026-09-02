# Authentication and Authorization

## Scope

Phase 3 implements authentication and authorization for the Cloudflare-native Hono API. It does not build dashboards, booking APIs, payment APIs, or UI.

The approved v1 database foundation remains in `0001_canonical_schema.sql`. The resident identity revision is folded into the canonical foundation before production use. Phase 3 adds `0002_auth_username.sql` to support staff/admin login by email or username.

Phase 7 adds public applicant registration OTPs using `otp_codes.purpose = 'phone_verification'`. These OTPs verify the supplied phone before creating a resident account and issuing a normal resident session. Existing resident login remains institution code + student ID + OTP; `resident_code` and Ghana Card are not authentication credentials.

## Architecture

- Runtime: Cloudflare Workers.
- Framework: Hono.
- Language: TypeScript.
- Database: Cloudflare D1.
- Tables used:
  - `users`
  - `staff`
  - `roles`
  - `residents`
  - `otp_codes`
  - `sessions`
  - `audit_logs`

Auth code is organized as:

```text
src/auth/
  context.ts
  crypto.ts
  permissions.ts
  rate-limit.ts
  validation.ts
src/middleware/
  auth.middleware.ts
src/repositories/
  auth.repository.ts
src/routes/
  auth.routes.ts
src/services/
  auth.service.ts
  sms.service.ts
```

## Staff/Admin Flow

Endpoint:

```text
POST /auth/staff/login
```

Request body:

```json
{
  "identifier": "admin@kissmetgroup.org",
  "password": "Password123!"
}
```

The identifier may be email or username. The service looks up the user through `users`, `staff`, and `roles`, verifies active user/staff state, verifies the password hash, creates a cryptographically random session token, stores only the SHA-256 token hash in `sessions`, and returns the plaintext token once to the caller.

Passwords are hashed with PBKDF2-SHA256 using Web Crypto, per-password salt, and 210,000 iterations.

## Resident OTP Flow

Endpoints:

```text
POST /auth/resident/request-otp
POST /auth/resident/verify-otp
```

OTP request body:

```json
{
  "institutionCode": "ug",
  "studentId": "KSM-STU-0001"
}
```

OTP verification body:

```json
{
  "institutionCode": "ug",
  "studentId": "KSM-STU-0001",
  "otp": "123456"
}
```

The resident flow uses the institution/school code plus external `student_id`, finds the linked resident and registered phone number, generates a cryptographically secure six-digit OTP, stores only a PBKDF2 hash in `otp_codes`, and sends the OTP through an `SmsProvider` interface.

`resident_code` remains Kissmet's internal resident identifier and is system-generated when a resident record is created. Residents are not expected to know it for normal portal login.

Student IDs are not assumed globally unique. The database enforces uniqueness on `(institution_id, student_id)`, so the same student ID can exist at different institutions while still mapping to exactly one resident within each institution.

Ghana Card numbers are not used as authentication credentials.

Development uses `MockSmsProvider`, which does not call a real SMS API. A Ghana SMS provider can later implement the same `SmsProvider` interface without rewriting auth flow logic.

Successful OTP verification marks the OTP as used and creates a normal application session in `sessions`.

## Sessions

Session tokens are generated from secure random bytes. Only SHA-256 hashes are stored in D1.

Session enforcement checks:

- token exists
- session status is `active`
- user status is `active`
- `expires_at` is still in the future

Logout updates active sessions to `revoked`.

Endpoints:

```text
POST /auth/logout
GET /auth/me
```

Both require `Authorization: Bearer <token>`.

## Authorization

Reusable Hono middleware:

- `requireAuth`
- `requireRole`
- `requirePermission`

Supported roles:

- `super_admin`
- `manager`
- `reception`
- `accounts`
- `maintenance`
- `resident`

Authorization is enforced server-side by middleware and is not dependent on frontend visibility.

Announcement permissions added after Phase 10I:

- `announcement:read`: list/view admin announcements.
- `announcement:write`: create/edit/archive announcement records.
- `announcement:publish`: publish/expire announcements.
- `announcement:external_delivery`: publish announcements that include explicit SMS or email channels.

`super_admin` has all permissions. `manager` has the announcement write/publish/external-delivery permissions. `reception` has announcement read access only.

Messaging permissions added after Phase 10J:

- `message:read`: list and view targeted message history.
- `message:write`: create draft messages and archive messages.
- `message:send`: send queued/draft messages.
- `message:external_delivery`: send messages that include explicit SMS or email channels.

`super_admin` has all permissions. `manager` has full messaging permissions. `reception`, `accounts`, and `maintenance` may create/send portal messages but do not have external SMS/email delivery permission in the current map.

Report permissions added after Phase 10K:

- `report:read`: access operational reports such as overview, occupancy, residents, applications/bookings, and maintenance.
- `report:finance`: access financial reports, payment method breakdowns, and outstanding balance rows.

`super_admin` has all report permissions. `manager` has operational and financial reports. `accounts` has operational report access plus financial reports. `reception` and `maintenance` have operational report access only; the frontend hides finance tabs for those roles and the backend still enforces `report:finance`.

Staff-management permissions added after Phase 10L:

- `staff:read`: list and view joined staff/user/role records.

`super_admin` has full staff management through role checks on staff mutation routes. `manager` has staff read access only. Staff mutation endpoints require `super_admin` and enforce server-side safeguards for Super Admin accounts, the last active Super Admin, and self-deactivation.

Role changes, staff-status changes, account-status changes, and password resets revoke the affected staff user's active sessions. This forces changed permissions and deactivations to take effect immediately instead of waiting for session expiry.

Audit-log access after Phase 10M:

- `audit:read`: list and view audit log history.

`super_admin` and `manager` have audit read access in the current permission map. `reception`, `accounts`, `maintenance`, and `resident` do not. Audit log APIs are read-only and expose no update, delete, archive, purge, restore, or manual-create operation.

Settings access after Phase 10N:

- `settings:read`: view system settings.

`super_admin` has read/write settings access. `manager` has read-only settings access in the current permission map. Other roles do not have Settings navigation or backend settings access by default. Settings mutation routes use Super Admin role checks and write audit events.

## Security Decisions

- Plaintext passwords are never stored.
- Plaintext OTPs are never stored.
- Plaintext session tokens are never stored.
- Password and OTP verification use hashed comparisons.
- Session tokens and OTPs use secure random values.
- Staff login attempts are rate-limited by hashed identifier in the Worker isolate.
- Resident OTP requests are rate-limited with D1-backed `otp_codes` history using `rate_limit_key`.
- OTP records support expiration, one-time use, attempt limits, and status transitions.
- Resident OTP request responses are intentionally generic so callers cannot reliably enumerate residents or phone numbers.
- Auth events are written to `audit_logs`.
- Passwords, OTPs, and session tokens are not logged.
- Staff-management responses do not expose password hashes, session token hashes, OTP hashes, or other secret material.
- Initial and reset staff passwords are returned once by the backend and are not recoverable from D1.
- Audit log metadata is redacted in API responses for sensitive keys such as passwords, password hashes, temporary passwords, session tokens, OTP values, authorization headers, secrets, API keys, Cloudflare tokens, SMS secrets, and storage secrets.
- Settings APIs expose only non-secret operational configuration. Cloudflare tokens, SMS/email provider secrets, R2 credentials, password hashes, session tokens, and OTP values remain outside D1 settings and are not returned to the frontend.

## Endpoints

### `POST /auth/staff/login`

Authenticates active staff/admin users by email or username and password.

### `POST /auth/resident/request-otp`

Requests a resident login OTP by institution code and student ID. Returns a generic success response.

### `POST /auth/resident/verify-otp`

Verifies a resident OTP and returns a session token when valid.

### `POST /auth/logout`

Revokes the current session.

### `GET /auth/me`

Returns the authenticated session user context.

## Tests

Automated tests live in:

```text
src/auth/auth.test.ts
```

Covered cases:

- valid staff login
- invalid password
- inactive staff
- staff login rate limiting
- resident OTP request
- correct OTP
- incorrect OTP
- expired OTP
- OTP attempt limit
- OTP reuse
- OTP rate limiting
- valid session
- expired session
- revoked session
- unauthorized route
- role-restricted route

Latest local result:

```text
npm.cmd run typecheck
tsc --noEmit passed

npm.cmd test
1 test file passed
16 tests passed
```

Endpoint smoke checks against local Wrangler:

```text
GET /health -> 200
GET /health/db -> 200
POST /auth/staff/login with seeded admin -> 200
GET /auth/me with issued token -> 200
POST /auth/logout -> 200
GET /auth/me after logout -> 401
```
