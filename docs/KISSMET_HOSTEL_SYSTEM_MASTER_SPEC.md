# KISSMET HOSTEL SYSTEM --- MASTER SPECIFICATION

**Role:** Canonical project source of truth\
**Project:** Kissmet Hostel Management Portal\
**Domain:** kissmetgroup.org\
**Scale:** One hostel, fewer than 20 rooms\
**Architecture:** Cloudflare-native\
**Current milestone:** Admin Portal Phase 10A--10N complete; Resident
Portal UI pending

## 1. Purpose

This file is the high-level source of truth for rebuilding Kissmet
Hostel Management Portal from scratch. It records the architecture,
locked business rules, workflow boundaries, security direction, build
sequence, known limitations, and production-hardening work.

Priority when implementing:

1.  This file for overall architecture and locked product rules.
2.  `DATABASE_SCHEMA.md` for exact D1 schema and constraints.
3.  `AUTHENTICATION.md` for authentication, sessions, RBAC, and
    security.
4.  `ADMIN_FRONTEND.md` for implemented Admin Portal behavior.
5.  Current migrations, automated tests, and production code for
    executable details.

Do not silently change a locked rule simply because another
implementation is easier.

## 2. Product Goal

The system manages a small Ghanaian hostel and covers resident
registration, institution/student identity, OTP verification,
applications, bookings, payments, receipts, rooms/beds, allocations,
maintenance, announcements, targeted messaging, reports, staff, audit
logs, and global settings.

Canonical resident journey:

**Registration → OTP verification → Application → Review/Approval →
Booking → Payment → Manual Booking Confirmation → Explicit Bed
Allocation → Hostel Stay**

Important boundaries:

-   Application approval does not create a booking or allocate a bed.
-   Payment verification does not automatically confirm a booking.
-   Booking confirmation does not allocate a bed.
-   Booking status is not physical occupancy.
-   Active allocation is the authoritative physical placement.

## 3. Production Architecture

-   Cloudflare Workers
-   Hono + TypeScript
-   Cloudflare D1
-   Private Cloudflare R2
-   Cloudflare DNS + SSL/TLS
-   React + TypeScript + Vite + React Router + Tailwind CSS + Vitest

Intended hosts:

-   `kissmetgroup.org` --- public site
-   `portal.kissmetgroup.org` --- Resident Portal
-   `admin.kissmetgroup.org` --- Admin Portal
-   `api.kissmetgroup.org` --- API

The backend is authoritative for all business rules and authorization.

## 4. Core Data Rules

### Public references

Use D1 integer primary keys internally, but generate public operational
references independently:

-   `KSM-RES-0001`
-   `KSM-APP-0001`
-   `KSM-BKG-0001`
-   `KSM-PAY-0001`
-   `KSM-RCP-0001`
-   `KSM-MNT-0001`

Do not derive these directly from row IDs.

Staff codes are currently caller-supplied; no canonical staff-code
sequence exists yet.

### Money

Store money as integer minor units.

`GHS 2,500.00 = 250000`

Default currency: `GHS`.

Never use floating point as the financial source of truth.

### Time and history

Persist timestamps as UTC ISO-8601 strings.

Preserve operational and financial history through statuses, archival,
transfers, endings, refunds, and voids instead of destructive deletion.

## 5. Canonical Schema

Migration order:

``` text
0001_canonical_schema.sql
0002_auth_username.sql
0003_resident_code_sequence.sql
0004_booking_number_sequence.sql
0005_payments_receipts_foundation.sql
0006_resident_onboarding.sql
0007_operations_reporting.sql
0008_booking_priced_room.sql
0009_announcements_alerts.sql
0010_messages_communications.sql
0011_system_settings.sql
```

Major tables:

`roles`, `users`, `staff`, `academic_sessions`, `institutions`,
`residents`, `resident_code_sequence`, `rooms`, `beds`, `room_rates`,
`applications`, `application_number_sequence`, `bookings`,
`booking_number_sequence`, `allocations`, `payments`,
`payment_reference_sequence`, `payment_confirmation_settings`,
`receipts`, `receipt_number_sequence`, `documents`,
`maintenance_requests`, `maintenance_request_sequence`, `announcements`,
`announcement_channels`, `announcement_delivery_attempts`, `messages`,
`message_channels`, `message_recipient_snapshots`,
`message_delivery_attempts`, `portal_message_deliveries`, `otp_codes`,
`sessions`, `audit_logs`, `system_settings`.

See `DATABASE_SCHEMA.md` for exact columns, indexes, checks, and
relationships.

## 6. Identity and Authentication

`users` is the shared identity layer. Resident-specific data belongs in
`residents`; staff-specific operational data belongs in `staff`.

Student IDs are unique per institution:

``` text
(institution_id, student_id)
```

Resident code and Ghana Card are not normal login credentials.

Staff authenticate through:

``` text
POST /auth/staff/login
```

using username or email plus password.

Passwords use PBKDF2-SHA256, per-password salt, 210,000 iterations.

Only hashes are persisted.

Resident login uses institution code + student ID + OTP:

``` text
POST /auth/resident/request-otp
POST /auth/resident/verify-otp
```

New applicant registration uses phone-verification OTP before permanent
user/resident creation.

Session tokens are random; only SHA-256 token hashes are stored. Logout
revokes sessions. Staff role/status/account/password changes revoke
affected active sessions.

## 7. RBAC

Roles:

-   super_admin
-   manager
-   reception
-   accounts
-   maintenance
-   resident

Backend middleware is authoritative.

High-level intent:

-   **Super Admin:** full administrative control.
-   **Manager:** broad operational access, reports,
    messaging/announcements, staff read, audit read, settings read,
    subject to explicit backend restrictions.
-   **Reception:** intake and operational
    resident/application/booking/allocation work according to
    permissions.
-   **Accounts:** payments, verification, receipts, finance reporting.
-   **Maintenance:** maintenance workflow.
-   **Resident:** own authorized resident-portal data only.

Never authorize an operation solely because the frontend exposes a
button.

## 8. Academic Sessions

Statuses:

`draft`, `active`, `closed`, `archived`.

Only one academic session may be active.

Applications, bookings, allocations, and room rates are session-aware.

## 9. Rooms, Beds, and Occupancy

`rooms.capacity` is the configured maximum only.

Actual inventory comes from `beds`.

Occupancy comes from active allocations.

Never calculate occupancy from bookings or configured room capacity.

Room/bed statuses:

`available`, `maintenance`, `inactive`, `archived`.

Gender policies:

`female`, `male`, `any`.

An actively allocated bed or room cannot be moved to
maintenance/inactive/archived through the normal status endpoint.

UI wording may use **Take Out of Service** while backend status remains
`maintenance`.

A room/bed maintenance status is separate from a maintenance request.

## 10. Room Rates and Booking Pricing

Room rates are session-specific. Only one active rate per room/session.

Historical rates are preserved.

When a booking is created, capture:

-   `priced_room_id`
-   `priced_room_rate_id`
-   `total_amount_minor`
-   `currency`

These are historical financial facts.

Never recalculate an existing booking from a later room rate.

## 11. Applications

Statuses:

`draft`, `submitted`, `under_review`, `approved`, `rejected`,
`cancelled`, `archived`.

Transitions:

``` text
draft -> submitted/cancelled/archived
submitted -> under_review/cancelled
under_review -> approved/rejected
approved/rejected/cancelled -> archived
```

Application numbers are generated by the backend.

Approval only establishes eligibility for booking. It does not create a
booking or allocation.

## 12. Bookings

Statuses:

`pending`, `confirmed`, `cancelled`, `expired`, `completed`, `archived`.

Transitions:

``` text
pending -> confirmed/cancelled/expired/archived
confirmed -> completed/cancelled/archived
cancelled/expired/completed -> archived
```

Booking creation requires an approved application and a valid active
room rate.

Booking number and captured total are backend-owned.

Confirmation is explicit and requires the active payment-confirmation
threshold to be satisfied.

Confirmation does not allocate a bed.

## 13. Payment Confirmation Policy

Supported policies:

-   `full`
-   `fixed`
-   `percentage`

Full requires verified payments to meet the captured booking total.

Fixed uses a configured minor-unit amount, capped at booking total.

Percentage uses basis points.

Changing the policy does not automatically confirm bookings or rewrite
payments, receipts, booking totals, room rates, or existing
payment-attention state.

## 14. Payments

Statuses:

`pending`, `submitted`, `verified`, `rejected`, `refunded`, `cancelled`,
`archived`.

Methods:

`cash`, `bank_transfer`, `mobile_money`, `card`, `other`.

Multiple part-payments are supported.

Canonical balance:

``` text
outstanding = captured booking total - verified payments
```

Only verified payments count as verified revenue.

Pending/submitted payments and refunds are reported separately.

Payment verification uses its dedicated backend workflow and does not
automatically confirm the booking.

Refunds that reduce a confirmed booking below its threshold set
payment-attention state instead of silently de-confirming it.

## 15. Receipts

Receipts are issued against verified payments.

Receipt numbers are backend generated.

One active issued receipt per payment.

Receipts are voided, not deleted.

Part-payments may therefore have separate receipts.

Current Admin Portal printing is browser-based structured printing; a
backend PDF service is not required for v1.

## 16. Allocations

Allocation is the authoritative bed placement.

Creation requires:

-   confirmed booking
-   correct resident/session
-   explicit bed
-   usable room/bed
-   no conflicting active allocation
-   gender compatibility
-   pricing compatibility

Statuses:

`active`, `ended`, `cancelled`, `transferred`, `archived`.

Only one active allocation per bed and one per resident/session.

History is preserved.

Normal allocation should use the booking's priced room. Another room is
allowed only when its active session rate matches the booking's captured
amount and currency.

Same-room transfers do not reprice.

Cross-room transfers are allowed only for the same captured
price/currency.

Never alter booking totals or historical room rates merely to make a
transfer work.

## 17. Documents and R2

Private files live in R2; D1 stores metadata/object references.

Document types include Student Card, Ghana Card, profile photo,
application support, payment slip, receipt PDF, and other.

Do not expose private identity/payment objects through public URLs.

Cross-record ownership must remain internally consistent.

Ghana Card access uses narrower authorization.

Do not use Ghana Card as authentication.

## 18. Maintenance

Maintenance requests are work tickets, not room/bed status changes.

Categories:

`plumbing`, `electrical`, `furniture`, `cleaning`, `security`, `other`.

Priorities:

`low`, `normal`, `high`, `urgent`.

Statuses:

`open`, `assigned`, `in_progress`, `resolved`, `closed`, `cancelled`,
`archived`.

Transitions:

``` text
open -> assigned/cancelled
assigned -> in_progress/cancelled
in_progress -> resolved/cancelled
resolved -> closed/in_progress
closed/cancelled -> archived
```

Creating a request does not automatically take inventory out of service.

## 19. Announcements

Announcements are broad notices, not private messages.

Audience:

`all`, `residents`, `staff`.

Severity:

`normal`, `important`, `high_alert`.

Lifecycle:

`draft`, `published`, `expired`, `archived`.

Channels:

`resident_portal`, `staff_portal`, `public_website`, `sms`, `email`.

High alert does not automatically select SMS/email.

External delivery must be explicit and permission-controlled.

## 20. Messaging

Messaging is targeted/private operational communication.

Targets include individual resident, selected residents, room, selected
rooms, group, all residents, and staff.

Channels:

`portal`, `sms`, `email`.

Admin creation requires recipient preview. Backend resolves recipients
again at send time and stores the exact historical snapshot.

Critical safeguard:

-   `individual_resident`: exactly one positive ID.
-   `room`: exactly one positive ID.
-   `selected_residents`: at least one positive ID, deduplicated.
-   `selected_rooms`: at least one positive ID, deduplicated.

Missing/empty selected-target IDs must be rejected, never broadened to
all residents/rooms.

Room targeting uses active allocations, not bookings.

Portal delivery is durable in `portal_message_deliveries`.

Development SMS/email providers are mocks.

## 21. Reports

Report groups:

-   Overview
-   Occupancy
-   Residents
-   Applications & Bookings
-   Finance
-   Maintenance

Canonical formulas:

``` text
Occupancy = active allocations / usable beds
Outstanding = captured booking total - verified payments
```

Resident placement comes from active allocations.

Expected revenue uses captured booking totals for applicable booking
states.

Verified revenue uses verified payments only.

Pending/submitted payments and refunds remain separate.

Reports support appropriate filters, CSV export, and browser printing.

## 22. Staff Management

Staff management supports joined staff/user/role data, search, detail,
creation, role changes, staff status, account status, and password
reset.

Current mutation authority: Super Admin.

Manager: read-only staff access.

Security rules:

-   never expose password hashes
-   plaintext initial/reset password shown once only
-   revoke sessions after role/status/account/password changes
-   block unsafe self-deactivation
-   protect the last active Super Admin

## 23. Audit Logs

Audit logs are append-only operational/security history.

Admin audit APIs are read-only.

No update/delete/archive/purge/restore/manual-create operations.

Viewer supports server-side search/filtering, newest-first pagination,
and detail.

Sensitive metadata is recursively redacted before API response,
including passwords, tokens, OTPs, authorization headers, secrets, API
keys, Cloudflare tokens, SMS secrets, and storage secrets.

Historical rows are not rewritten for redaction.

## 24. Settings

Singleton `system_settings` stores non-secret global profile values:

-   organization name
-   admin portal title
-   resident portal title
-   support email
-   support phone
-   address/location
-   default currency

Payment confirmation policy remains in `payment_confirmation_settings`.

Academic section shows active-session information; full session CRUD
remains elsewhere.

Communication provider secrets belong in Cloudflare environment/secrets,
not D1 settings.

Current limitation: stored branding values are not yet dynamically
applied to the live shell.

## 25. Admin Portal

Implemented routes:

``` text
/login
/dashboard
/residents
/applications
/bookings
/rooms
/allocations
/payments
/receipts
/maintenance
/announcements
/messages
/reports
/staff
/audit-logs
/settings
```

No intended Admin Portal placeholders remain after Phase 10N.

The frontend must display real backend state and say when information is
unavailable rather than fabricating data.

## 26. Resident Portal --- Next Major Phase

The backend already contains resident-facing foundations. The Resident
Portal UI remains pending.

Planned resident experience:

1.  applicant registration
2.  phone OTP verification
3.  existing resident OTP login
4.  resident profile
5.  identity document uploads
6.  application creation/submission/status
7.  booking visibility
8.  payment instructions/history and payment-slip workflow
9.  receipt visibility
10. current room/bed allocation
11. maintenance request creation/history
12. resident announcements
13. portal message inbox using `portal_message_deliveries`
14. logout/session handling

Every resident route must enforce ownership server-side.

## 27. Production Deployment Direction

Intended topology:

``` text
admin.kissmetgroup.org  -> Admin frontend
portal.kissmetgroup.org -> Resident frontend
api.kissmetgroup.org    -> Worker API
kissmetgroup.org        -> Public site
D1                      -> production database
R2                      -> private documents
```

Apply migrations in order.

Do not deploy development verification fixtures as production data.

Configure secrets separately.

Use narrow CORS rules.

Smoke-test authentication and the complete business workflow after
deployment.

## 28. Production Hardening Before Launch

Explicitly review:

### Payment verification concurrency

Prevent simultaneous verification of multiple submitted payments from
independently passing overpayment checks and jointly exceeding the
captured booking total.

### Staff login rate limiting

Move/confirm staff-login limiting on an appropriate durable production
mechanism rather than relying only on Worker-isolate memory.

### OTP production behavior

Review concurrency, abuse protection, provider failures, and live SMS
integration.

### PBKDF2 performance

Benchmark 210,000 iterations under Worker production conditions.

### Communications

Replace development mocks with approved provider implementations where
required.

### R2 privacy

Verify identity/payment documents cannot be publicly accessed.

### CORS/environment separation

Ensure development/staging/production credentials and data cannot be
mixed.

## 29. Known Non-Blocking Limitations

-   Some list endpoints return raw rows and require bounded frontend
    lookups.
-   Some filters remain current-page frontend filters.
-   No general room/bed/rate edit API beyond supported create/status
    operations.
-   No resident-scoped full allocation-history endpoint.
-   No payment-scoped document list endpoint.
-   Receipt printing is browser-based.
-   Maintenance records do not contain every possible
    work-note/session/allocation field.
-   Live SMS/email providers are not connected.
-   Messaging retry UI is not exposed.
-   Staff codes remain caller-supplied.
-   Stored branding settings are not dynamically applied to the shell.
-   Resident Portal inbox UI is pending.
-   Report charts were intentionally deferred.

Implement locked v1 behavior before expanding scope.

## 30. Verification Fixture Warning

Schema-verification data may intentionally bypass production service
workflows.

Known historical examples include:

-   `VERIFY-BOOK-1`
-   `VERIFY-REC-1`
-   `Verification Message`

Do not weaken production rules merely to make these fixtures appear
normal.

Use fresh service-level workflows when validating real behavior.

## 31. From-Scratch Build Order

### Stage 1 --- Foundation

Worker/Hono/TypeScript, D1/R2 bindings, environment separation, health
checks, API conventions.

### Stage 2 --- Schema

Apply canonical migrations, indexes/constraints, development seeds,
schema verification, expected-failure constraint tests.

### Stage 3 --- Auth/RBAC

Staff login, resident OTP login, registration OTP, sessions, middleware,
permissions, auth auditing.

### Stage 4 --- Core administration

Academic sessions, institutions, rooms, beds, rates, residents,
staff/roles.

### Stage 5 --- Resident intake

Registration, resident codes, identity documents, applications,
application lifecycle.

### Stage 6 --- Booking/pricing

Booking sequence, approved-application booking, captured priced
room/rate, immutable total, lifecycle.

### Stage 7 --- Finance

Payments, part-payments, slips, verification/rejection/refund,
threshold, manual confirmation, payment attention, receipts.

### Stage 8 --- Placement

Availability, allocations, pricing/gender/status checks, transfers,
history, inventory safeguards.

### Stage 9 --- Operations

Maintenance, announcements, targeted messaging, recipient snapshots,
portal-delivery foundation.

### Stage 10 --- Administration/observability

Dashboard, reports, staff management, audit viewer, settings.

### Stage 11 --- Admin frontend

Build real modules against backend APIs without fake frontend business
state.

### Stage 12 --- Resident frontend

Build the resident experience using existing ownership/security rules.

### Stage 13 --- Production hardening

Resolve the production-hardening checklist.

### Stage 14 --- Deployment

Production migrations, secrets, bindings, domains, deployment, smoke
tests, privacy checks.

## 32. Mandatory Rules for an AI Coding Model

1.  Backend business rules are authoritative.
2.  Never infer physical occupancy from bookings.
3.  Never use configured room capacity as actual bed inventory.
4.  Never allocate because an application was approved.
5.  Never allocate because a booking was confirmed.
6.  Never auto-confirm merely because payment was verified.
7.  Never recalculate historical booking totals from current rates.
8.  Never mutate historical rates to force a transfer.
9.  Never count pending/submitted payments as verified revenue.
10. Never use receipts as a substitute for payment totals.
11. Never expose private R2 documents publicly.
12. Never use Ghana Card as authentication.
13. Never expose plaintext passwords, OTP hashes, or session token
    hashes.
14. Never trust frontend RBAC as authorization.
15. Never hard-delete financial/audit history for UI convenience.
16. Never broaden targeted messaging when target IDs are missing.
17. Never weaken production rules for stale verification fixtures.
18. Preserve integer minor-unit money handling.
19. Preserve backend-generated public reference numbers.
20. Add tests for new business-rule boundaries.

## 33. Current Completion State

At this checkpoint:

-   Cloudflare foundation: complete
-   D1 schema through `0011_system_settings.sql`: complete
-   Authentication/RBAC foundation: complete
-   Core admin backend: complete
-   Resident onboarding backend foundation: complete
-   Applications/bookings/payments/receipts/allocations: complete
-   Maintenance: complete
-   Announcements: complete
-   Messaging backend/admin: complete
-   Reports: complete
-   Staff Management: complete
-   Audit Logs: complete
-   Admin Settings: complete
-   Admin Portal Phase 10A--10N: complete
-   Resident Portal UI: pending
-   Live SMS/email integration: pending
-   Production hardening/deployment: pending

Latest documented Phase 10N validation:

``` text
Admin frontend typecheck: passed
Admin frontend tests: 19 files / 128 tests
Admin frontend build: passed

Cloudflare backend typecheck: passed
Cloudflare backend tests: 5 files / 94 tests
D1 local verification: 55 commands executed successfully
```

## 34. Companion Source-of-Truth Files

Keep this file alongside:

-   `DATABASE_SCHEMA.md`
-   `AUTHENTICATION.md`
-   `ADMIN_FRONTEND.md`

Roles:

-   **KISSMET_HOSTEL_SYSTEM_MASTER_SPEC.md** --- architecture,
    workflows, locked rules, scope, rebuild order.
-   **DATABASE_SCHEMA.md** --- exact database design.
-   **AUTHENTICATION.md** --- exact auth/RBAC/security behavior.
-   **ADMIN_FRONTEND.md** --- detailed Admin Portal implementation and
    API limitations.

Update this master file whenever a major change affects architecture,
workflow, scope, or a locked business rule.

## 35. v1 Definition of Done

Before calling v1 launch-ready:

-   required Resident Portal UI is complete
-   production communications requirements are decided/configured
-   hardening risks are resolved or explicitly accepted
-   production D1/R2 bindings are configured
-   migrations apply successfully
-   domains/CORS/secrets are correct
-   private document access is verified
-   staff and resident authentication are smoke-tested
-   application → booking → payment → confirmation → allocation works
    end-to-end
-   refund/payment-attention behavior is tested
-   allocation transfer/history is tested
-   reports reconcile with operational records
-   critical operations generate audit events
-   backup/recovery expectations are documented
-   production smoke tests pass

**End of Master Specification**
