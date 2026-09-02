# Kissmet Admin Frontend

## Stack

Phase 9 adds the Admin Portal frontend foundation using React, TypeScript, Vite, React Router, Tailwind CSS, and Vitest. The Hono Worker API remains the backend source of truth.

The frontend lives in:

```text
admin-frontend/
```

## Project Structure

```text
admin-frontend/src/
  api/          typed API client modules
  auth/         session provider and auth state
  components/   layout, common, and dashboard components
  hooks/        data-loading hooks
  pages/        Login, Dashboard, and admin modules
  routes/       protected route tree
  styles/       Tailwind entry and design tokens
  types/        shared API response types
  utils/        formatters and status mappings
```

## Environment

The API base URL is configured through:

```text
VITE_API_BASE_URL
```

Example:

```text
VITE_API_BASE_URL=http://localhost:8787
```

Production can point this to `https://api.kissmetgroup.org` without changing components.

## Authentication

The login page calls:

```text
POST /auth/staff/login
```

After login, the returned session token is stored for the admin frontend and sent as:

```text
Authorization: Bearer <token>
```

The auth provider then calls:

```text
GET /auth/me
```

Protected pages require an authenticated session. A `401` response clears frontend auth state so the user can sign in again. Logout calls:

```text
POST /auth/logout
```

No separate authentication model was added.

## API Client

Raw `fetch()` calls are centralized in `src/api/client.ts`.

The client handles:

- API base URL
- Authorization header
- JSON parsing
- HTTP errors
- unauthorized session clearing

Dashboard endpoint wrappers live in `src/api/dashboard.ts`.

## Routes

Implemented routes:

- `/login`
- `/dashboard`
- `/residents`
- `/applications`
- `/bookings`
- `/rooms`
- `/allocations`
- `/payments`
- `/receipts`
- `/maintenance`
- `/announcements`
- `/messages`
- `/reports`
- `/staff`
- `/audit-logs`
- `/settings`

Prepared placeholder routes:

- None.

Placeholders intentionally do not fake CRUD behavior.

## Layout

The admin shell includes:

- desktop sidebar
- mobile/tablet navigation drawer
- topbar
- current staff identity
- role display
- avatar placeholder
- logout control
- reserved notification button
- page header pattern

Navigation is permission-aware where practical, but backend RBAC remains authoritative.

## Dashboard

The dashboard uses real backend endpoints:

- `GET /admin/dashboard/overview`
- `GET /admin/dashboard/occupancy`
- `GET /admin/dashboard/finance`
- `GET /admin/dashboard/applications`
- `GET /admin/dashboard/maintenance`

It displays:

- resident, applicant, bed, occupancy, booking, and maintenance summary cards
- occupancy percentage indicator
- room occupancy table
- financial summary cards
- application/booking counts
- maintenance counts

Money is formatted centrally from integer minor units. For example, `350000` displays as `GHS 3,500.00`.

## Residents

The Residents interface uses the existing backend APIs:

- `GET /admin/residents`
- `POST /admin/residents`
- `GET /admin/residents/:id`
- `GET /admin/institutions`

Implemented functionality:

- professional residents page header
- current-page resident summary cards
- server-side search by the fields supported by the backend repository: resident code, first name, last name, and student ID
- status filter applied to the current result page
- paginated residents table
- resident code, name, student ID, institution, phone availability, status, and view action columns
- resident detail dialog organized into personal, Kissmet, institution/student, contact, application, booking, allocation, and document sections
- Add Resident action for roles with `resident:write`
- backend-backed resident creation form
- frontend never submits or generates `resident_code`
- private identity-document files are not exposed; Ghana Card access remains controlled by backend document routes and permissions

Known backend/API limitations:

- `GET /admin/residents` currently returns raw resident rows and does not join `users`, so phone/email are not exposed in the resident listing or detail.
- Resident status and institution filters are not server-side filters yet. The UI applies status filtering to the current page and documents this behavior.
- Resident detail does not yet have a single aggregate endpoint for applications, bookings, current allocation, or documents. Those sections remain informational until a later backend or frontend phase wires the relevant domain pages/endpoints.
- No resident update or delete endpoint exists. The UI does not add deletion or unsupported status changes.

## Applications

The Applications interface uses the existing backend APIs:

- `GET /admin/applications`
- `GET /admin/applications/:id`
- `PATCH /admin/applications/:id/status`
- `GET /admin/residents/:id`
- `GET /admin/institutions`
- `GET /admin/academic-sessions`
- `GET /admin/documents`

Implemented functionality:

- `/applications` admin route
- professional Applications page header with the approved shell and visual system
- current-page summary cards for total, submitted, under-review, and approved applications
- server-side search by backend-supported fields: application number and status
- current-page status and academic-session filters
- paginated table with application number, applicant, student ID, institution, academic session, status, submitted date, and view action
- detail dialog organized into Application, Applicant, Review, Documents, Booking, and Actions sections
- workflow actions driven by backend status transitions only
- decision notes submitted with review transitions where the backend accepts them
- loading, empty, no-result, API-error, and transition-error states
- centralized concise timestamp formatting for application list/detail timestamps

Application lifecycle shown in the UI follows the backend service:

- `draft -> submitted`
- `draft -> cancelled`
- `draft -> archived`
- `submitted -> under_review`
- `submitted -> cancelled`
- `under_review -> approved`
- `under_review -> rejected`
- `approved -> archived`
- `rejected -> archived`
- `cancelled -> archived`

Business rule preserved:

- Approving an application only makes the applicant eligible for the booking workflow.
- The frontend does not call `/admin/bookings` or `/admin/allocations` from the approval action.
- Approval does not create a booking, confirm a booking, allocate a room/bed, or alter payment state.

RBAC behavior:

- Users with `application:read` can list and view applications.
- Users with `application:write` can see and use status-transition actions.
- Roles without `application:write`, such as `accounts`, can review application details but cannot change application status.
- Backend authorization remains authoritative.

Document handling:

- The current admin document API exposes identity-document metadata for Student Card and Ghana Card records.
- The frontend displays metadata only and does not expose public R2 URLs.
- Ghana Card content is not fetched by this page; content access remains behind the backend's narrower `document:ghana_card` permission.

Application-number rule:

- Application numbers are generated by the backend from `application_number_sequence`.
- The format is `KSM-APP-0001`, `KSM-APP-0002`, and so on.
- The Applications frontend does not expose admin-side application creation or generate application numbers.

Known backend/API limitations:

- `GET /admin/applications` returns raw application rows without joined resident, institution, or academic-session names. The UI performs bounded current-page lookups using existing resident and reference endpoints.
- Application status and academic-session filters are not server-side filters yet. The UI applies them to the current result page and documents this behavior.
- There is no application-scoped document endpoint yet. The page uses the existing identity-document metadata endpoint and filters by the selected resident.

## Bookings

The Bookings interface uses the existing backend APIs:

- `GET /admin/bookings`
- `POST /admin/bookings`
- `GET /admin/bookings/:id`
- `PATCH /admin/bookings/:id/status`
- `GET /admin/bookings/:id/payment-summary`
- `GET /admin/availability`
- `GET /admin/applications`
- `GET /admin/applications/:id`
- `GET /admin/residents/:id`
- `GET /admin/institutions`
- `GET /admin/academic-sessions`
- `GET /admin/rooms`
- `GET /admin/room-rates`

Implemented functionality:

- `/bookings` admin route
- professional Bookings page header with the approved shell and visual system
- current-page summary cards for pending, confirmed, completed, and payment-attention bookings
- server-side search by backend-supported fields: booking number and status
- current-page status and academic-session filters
- paginated bookings table with booking number, resident, application, academic session, priced room, amount, payment progress, status, created date, and view action
- booking detail dialog organized into Booking, Resident, Application, Financial basis, Payment summary, Allocation, and Actions sections
- create-booking workflow for roles with `booking:write`
- confirmation/status actions that expose only valid backend transitions
- payment-summary, create, transition, empty, and API error states

Booking creation:

- Starts from approved applications only.
- Shows resident, institution, and academic session context for the selected application.
- Calls `GET /admin/availability` for eligible rooms with active rates.
- Shows an active room-rate preview before submission.
- Calls `POST /admin/bookings` with `applicationId` and `roomId` only.
- The frontend never generates `KSM-BKG-xxxx`, never submits a booking number, and never calculates or overrides the captured booking total.

Booking lifecycle shown in the UI follows the backend service:

- `pending -> confirmed`
- `pending -> cancelled`
- `pending -> expired`
- `pending -> archived`
- `confirmed -> completed`
- `confirmed -> cancelled`
- `confirmed -> archived`
- `cancelled -> archived`
- `expired -> archived`
- `completed -> archived`

Payment confirmation:

- The detail view uses `GET /admin/bookings/:id/payment-summary`.
- It distinguishes booking total, verified payments, outstanding balance, pending/submitted payment availability, confirmation threshold, and confirmation eligibility.
- The Confirm action is shown only for pending bookings when the role can confirm and the payment summary reports `confirmationRequirementMet = true`.
- Backend confirmation remains authoritative and may still reject the transition.
- Payment attention is displayed from booking/payment-summary state and does not automatically change booking status.

Pricing integrity:

- The UI shows the booking's captured `total_amount_minor`, `currency`, `priced_room_id`, and `priced_room_rate_id`.
- It does not recalculate the booking amount from the current room rate.
- Later room-rate changes therefore do not rewrite or visually replace the booking's historical financial basis.

Allocation boundary:

- Confirming a booking does not allocate a bed.
- Confirmed bookings display placement readiness, but the Bookings page never calls `/admin/allocations`.
- Allocation remains a separate management phase.

RBAC behavior:

- `super_admin`: full access.
- `manager`: booking read/write and confirmation in current backend permissions.
- `reception`: booking read/write in current backend permissions; confirmation is not granted by the current permission map.
- `accounts`: booking read and `booking:confirm` in the current permission map.
- `maintenance`: no booking management actions.
- Backend authorization remains authoritative.

Known backend/API limitations:

- `GET /admin/bookings` returns raw booking rows without joined resident, application, room, or session labels. The UI performs bounded current-page lookups using existing endpoints.
- Booking status and academic-session filters are not server-side filters yet. The UI applies them to the current result page and documents this behavior.
- `GET /admin/bookings/:id/payment-summary` does not expose pending/submitted payment totals. The UI labels that field as unavailable instead of fabricating a value.
- There is no active-allocation summary endpoint scoped by booking yet. Allocation detail is limited to readiness messaging in this phase.

## Rooms & Beds

The Rooms & Beds interface uses the existing backend APIs:

- `GET /admin/rooms`
- `POST /admin/rooms`
- `GET /admin/rooms/:id`
- `PATCH /admin/rooms/:id/status`
- `GET /admin/rooms/:id/beds`
- `POST /admin/beds`
- `PATCH /admin/beds/:id/status`
- `GET /admin/room-rates`
- `POST /admin/room-rates`
- `PATCH /admin/room-rates/:id/status`
- `GET /admin/academic-sessions`
- `GET /admin/dashboard/occupancy`
- `GET /admin/allocations`
- `GET /admin/residents/:id`

Implemented functionality:

- `/rooms` admin route
- professional Rooms & Beds page header with the approved shell and visual system
- dashboard-backed summary cards for rooms, usable beds, occupied beds, and available beds
- search by room code/name plus current-page status and gender-policy filters
- rooms table with room identity, configured capacity, actual usable bed inventory, occupied beds, available beds, gender policy, status, active rate, and actions
- room detail view with Overview, Beds, and Rates tabs
- room creation using backend validation
- room status changes with confirmation
- bed creation by room
- bed status changes for unoccupied beds
- occupied beds show protected messaging and do not offer out-of-service actions when active allocation data is known
- room-rate creation by room and academic session
- room-rate status changes with confirmation
- loading, empty, no-results, API-error, form-error, and confirmation states

Capacity and occupancy rules:

- `rooms.capacity` is shown as the configured maximum capacity only.
- Actual room inventory comes from bed records.
- Occupancy and available-bed counts come from `GET /admin/dashboard/occupancy` where possible.
- The frontend does not reconstruct occupancy from booking status.
- Bed creation is locally blocked when active bed inventory has already reached configured room capacity, and the backend capacity guard remains authoritative.
- Room creation does not implicitly create beds.
- Taking a bed or room out of service stores the backend `maintenance` status.
- A bed or room with an active allocation cannot be moved to `maintenance`, `inactive`, or `archived` by the backend status endpoint.
- Failed room/bed status changes do not alter allocation history.

Room-rate and pricing rules:

- Room-rate amounts are entered in GHS major units such as `2500.00`.
- The frontend converts amounts to integer minor units such as `250000` before calling the backend.
- The conversion is handled by the reusable `parseMoneyToMinorUnits` utility and does not use floating point arithmetic.
- The backend default currency remains `GHS`, and the UI submits the selected currency explicitly.
- One active room rate per room/session is enforced by the backend and surfaced as an API error.
- Rate status changes do not call booking endpoints and do not mutate historical booking totals.

RBAC behavior:

- Users with `admin:read` can view the Rooms & Beds page.
- Users with `admin:write` can create rooms, create beds, create room rates, and perform status changes.
- Roles without `admin:write`, such as `maintenance` in the current permission map, do not see write actions.
- Backend authorization remains authoritative.

Known backend/API limitations:

- There are no general room, bed, or room-rate update endpoints yet; only create and status-change operations are exposed.
- `GET /admin/rooms` and `GET /admin/room-rates` do not provide server-side search/status/gender filters yet. The UI applies those filters to the bounded current result page.
- `GET /admin/rooms/:id/beds` returns bed rows without joined resident/allocation details. The UI combines the existing allocations endpoint with resident lookups for active bed occupancy display.

## Allocations

The Allocations interface uses the existing backend APIs:

- `GET /admin/allocations`
- `POST /admin/allocations`
- `GET /admin/allocations/:id`
- `POST /admin/allocations/:id/transfer`
- `PATCH /admin/allocations/:id/status`
- `GET /admin/bookings`
- `GET /admin/bookings/:id`
- `GET /admin/availability`
- `GET /admin/rooms`
- `GET /admin/rooms/:id/beds`
- `GET /admin/residents/:id`
- `GET /admin/academic-sessions`
- `GET /admin/room-rates`
- `GET /admin/institutions`

Implemented functionality:

- `/allocations` admin route
- scoped summary cards for active allocations, available beds, ready loaded bookings, and transfers
- paginated table with resident, booking, academic session, room/bed, status, assigned date, ended date, and actions
- detail dialog organized into Allocation, Resident, Booking, Placement, History, and Actions sections
- create-allocation workflow for roles with `allocation:write`
- transfer workflow for active allocations
- end, cancel, and archive status actions where the backend status rules allow
- loading, empty, no-results, lookup, create, transfer, status-change, and API error states

Allocation creation:

- Only loaded bookings with `status = confirmed` are offered.
- Confirmed bookings are excluded when the resident already has an active allocation for the same academic session in the loaded allocation set.
- A specific bed is required; the frontend never allocates by room only.
- Available beds come from `GET /admin/availability` for the selected booking session and resident.
- `POST /admin/allocations` submits only `bookingId`, `residentId`, `academicSessionId`, `bedId`, `startsOn`, and optional notes.
- The frontend does not submit or mutate booking totals, priced room IDs, priced rate IDs, room rates, payments, receipts, or booking status.

Placement and pricing rules:

- The backend remains authoritative for confirmed-booking eligibility, room availability, bed availability, duplicate resident allocation, gender policy, session matching, active allocation uniqueness, and pricing compatibility.
- Same-room transfers are offered where backend availability allows them.
- Same-priced cross-room transfers are offered only when the destination active rate amount and currency match the booking's captured financial basis.
- Differently priced destination rooms are hidden where the frontend can determine the mismatch and are still rejected by backend validation.
- The frontend does not implement repricing, refunds, credits, adjustment invoices, or booking-total changes.

Allocation history:

- The detail view includes current-page resident allocation history, including transferred, ended, cancelled, archived, and active rows where loaded.
- History is not collapsed into only the current placement.
- If complete resident-scoped allocation history is needed beyond the loaded page, the backend needs a resident-scoped history endpoint.

Room/bed operational safeguards:

- Actively allocated rooms/beds cannot be taken out of service through room/bed status endpoints.
- Ending or transferring an allocation naturally frees the old bed for later room/bed status operations through the existing APIs.

RBAC behavior:

- `super_admin`: full access.
- `manager`: allocation read/write in the current backend permission map.
- `reception`: allocation read/write in the current backend permission map.
- `accounts`: no allocation management actions in the current backend/frontend permission map.
- `maintenance`: no allocation management actions in the current backend/frontend permission map.
- Backend authorization remains authoritative.

Known backend/API limitations:

- `GET /admin/allocations` returns raw allocation rows without joined resident, booking, room, bed, institution, or session labels. The UI performs bounded current-page lookups using existing endpoints.
- Server-side allocation search currently covers allocation `status` only.
- Resident, booking, room, and academic-session filters are current-page/frontend filters unless backend list filtering is expanded later.
- There is no resident-scoped allocation-history endpoint yet; detail history uses the loaded allocation page.

## Payments

The Payments interface uses the existing backend APIs:

- `GET /admin/payments`
- `POST /admin/payments`
- `GET /admin/payments/:id`
- `PATCH /admin/payments/:id/status`
- `POST /admin/payments/:id/verify`
- `POST /admin/payments/:id/reject`
- `POST /admin/payments/:id/refund`
- `POST /admin/payments/:id/slip`
- `GET /admin/bookings/:id/payment-summary`
- `GET /admin/bookings`
- `GET /admin/bookings/:id`
- `GET /admin/residents/:id`
- `GET /admin/institutions`
- `GET /admin/rooms`

Implemented functionality:

- `/payments` admin route
- current-page summary cards for submitted, verified, rejected, and payment-attention records
- server-side search by backend-supported payment reference/status search
- current-page status and payment-method filters
- paginated payments table with reference, resident, booking, amount, method, paid/submitted/verified date, status, and action columns
- payment detail dialog organized into Payment, Resident, Booking, Booking Payment Summary, Payment Evidence, and Actions sections
- payment creation for roles with `payment:write`
- verification, rejection, refund, cancel, submit, and archive actions according to backend workflow rules
- private payment-slip upload through the backend R2 endpoint
- loading, empty, no-results, API-error, mutation-error, upload-error, and RBAC states

Payment creation:

- The frontend submits `bookingId`, `residentId`, `amountMinor`, `currency`, `method`, optional `paidAt`, and notes only.
- Payment references are generated by the backend; the frontend never submits or manufactures `KSM-PAY-xxxx`.
- Amounts are entered in major units and converted to integer minor units before submission.
- The backend remains authoritative for resident/booking matching and overpayment rejection.

Verification and payment totals:

- Submitted payments are verified through the dedicated `POST /admin/payments/:id/verify` endpoint, not the generic status endpoint.
- Verification does not confirm a booking from the frontend.
- Booking confirmation eligibility continues to come from `GET /admin/bookings/:id/payment-summary`.
- Part-payments are displayed as separate payment records and summarized against the booking balance.
- Refunds call the backend refund endpoint and surface payment-attention context when verified totals fall below the confirmation threshold.
- Existing verified payments, receipts, booking totals, and confirmation thresholds are not recalculated or altered by the frontend.

Document handling:

- Payment slip files are uploaded with `multipart/form-data` to the backend.
- The backend stores private R2 object metadata in `documents`.
- The frontend does not expose public R2 URLs and does not build receipt generation or receipt viewing in this phase.

RBAC behavior:

- `super_admin`: full access.
- `manager`: payment read/write/verify in the current backend permission map.
- `accounts`: payment read/write/verify in the current backend permission map.
- `reception`: payment read/write but no verification controls.
- `maintenance`: no payment management actions.
- Backend authorization remains authoritative.

Known backend/API limitations:

- `GET /admin/payments` returns raw payment rows without joined resident, booking, room, or institution labels. The UI performs bounded current-page lookups using existing endpoints.
- Server-side payment search is limited to the generic backend search behavior for payment reference/status.
- Status and method filters are current-page/frontend filters unless backend list filtering is expanded later.
- There is no payment-scoped document list endpoint yet; the UI uploads slips but does not list existing slip metadata after upload.

## Receipts

The Receipts interface uses the existing backend APIs:

- `GET /admin/receipts`
- `GET /admin/receipts/:id`
- `POST /admin/payments/:id/receipt`
- `POST /admin/receipts/:id/void`
- `GET /admin/payments`
- `GET /admin/payments/:id`
- `GET /admin/bookings`
- `GET /admin/bookings/:id`
- `GET /admin/residents/:id`

Implemented functionality:

- `/receipts` admin route
- page-scoped summary cards for active receipts, voided receipts, receipt count, and total loaded value
- server-side search by backend-supported receipt number/status search
- current-page status filter
- paginated receipts table with receipt number, payment reference, resident, booking, amount, status, issued date, and action columns
- receipt detail dialog organized into Receipt, Payment, Resident, Booking, printable receipt, and Actions sections
- receipt issuing from loaded verified payments without active issued receipts
- receipt voiding with a reason field supported by the backend
- browser-printable receipt view based on structured backend data
- loading, empty, no-results, lookup-error, issue-error, void-error, print, and RBAC states

Receipt generation:

- Receipts are created from verified payments through `POST /admin/payments/:id/receipt`.
- Receipt numbers are generated by the backend from `receipt_number_sequence`.
- The format remains `KSM-RCP-0001`, `KSM-RCP-0002`, and so on.
- The frontend never submits or manufactures receipt numbers.
- The backend enforces one active issued receipt per payment; duplicate failures are surfaced as backend errors.

Payment and booking linkage:

- A receipt is displayed as a financial record for one verified payment, not as a separate payment.
- Multiple verified part-payments remain separate receipt records.
- The page does not merge payment receipts into a fake booking-level receipt.
- Receipt amount comes from the underlying payment/backend record and is displayed in formatted major currency units.

Void behavior:

- Receipts are voided, not deleted.
- The void action calls `POST /admin/receipts/:id/void`.
- Voiding preserves the original receipt number, payment relationship, value, and history.
- Voided receipts remain visible and show a prominent `VOID` mark in detail and print presentation.
- The frontend never hard-deletes receipts.

Print/view behavior:

- The backend currently exposes structured receipt data, not a PDF or HTML render endpoint.
- The frontend provides a browser-printable A4 portrait receipt using actual receipt, payment, booking, and resident data only.
- Print styles center the receipt content on the page, use readable print typography, preserve a one-page receipt layout, and hide admin navigation, modal controls, and other non-receipt UI.
- The print view does not invent tax numbers, registration numbers, bank details, signatures, addresses, VAT values, or unsupported business data.

Refund interaction:

- The backend refund flow does not automatically void receipts.
- The Receipts page shows the actual receipt status returned by the backend after any payment refund.
- Refunded-payment receipt policy remains a business-rule decision for a later backend phase if needed.

Verification fixture note:

- `VERIFY-REC-1` is stale schema-verification data inserted directly by `cloudflare/tests/schema-verification.sql`.
- That fixture inserts `VERIFY-PAY-1` with payment status `submitted`, then directly inserts `VERIFY-REC-1` with receipt status `issued`.
- It bypasses the production service workflow and can therefore display an issued receipt with a submitted payment and unavailable verified date.
- Production receipt issuance remains protected by the backend service rule that requires a verified payment before `POST /admin/payments/:id/receipt` can issue a receipt.

RBAC behavior:

- `super_admin`: full access.
- `manager`: receipt read/write in the current backend permission map.
- `accounts`: receipt read/write in the current backend permission map.
- `reception`: no receipt route visibility in the current frontend navigation map and no receipt write permission.
- `maintenance`: no receipt management access.
- Backend authorization remains authoritative.

Known backend/API limitations:

- `GET /admin/receipts` returns raw receipt rows without joined payment, resident, or booking labels. The UI performs bounded current-page lookups using existing endpoints.
- Server-side receipt search is limited to receipt number and status.
- Payment reference, resident, booking, and status filters beyond receipt status are current-page/frontend filters unless backend list filtering is expanded later.
- `GET /admin/receipts/:id` returns payment amount, method, and dates, but not payment currency or payment status. The UI uses the existing payment lookup for those fields when available and defaults display currency to GHS if the payment row is unavailable.
- There is no backend PDF/download endpoint yet; printing is browser-based.

## Maintenance

The Maintenance interface uses the existing backend APIs:

- `GET /admin/maintenance`
- `GET /admin/maintenance/:id`
- `POST /admin/maintenance`
- `POST /admin/maintenance/:id/assign`
- `POST /admin/maintenance/:id/start`
- `POST /admin/maintenance/:id/resolve`
- `POST /admin/maintenance/:id/close`
- `POST /admin/maintenance/:id/cancel`
- `GET /admin/dashboard/maintenance`
- `GET /admin/residents`
- `GET /admin/institutions`
- `GET /admin/rooms`
- `GET /admin/rooms/:id/beds`
- `GET /admin/staff`

Implemented functionality:

- `/maintenance` admin route
- global dashboard summary cards for open, assigned, in-progress, and resolved maintenance counts
- server-side search by backend-supported request number, title, and status search
- current-page status and priority filters
- paginated maintenance table with request number, resident, room/bed, issue, priority, status, assigned staff, created date, and action columns
- detail dialog organized into Request, Resident, Placement, Assignment, Work Notes / Resolution, and Actions sections
- staff-created request workflow for roles with `maintenance:create`
- assignment workflow through the dedicated backend assignment endpoint
- start-work, resolve, close, and cancel actions using the exact backend endpoints
- loading, empty, no-results, detail lookup, create-error, assignment-error, transition-error, and RBAC states

Request lifecycle:

- `open -> assigned`
- `open -> cancelled`
- `assigned -> in_progress`
- `assigned -> cancelled`
- `in_progress -> resolved`
- `in_progress -> cancelled`
- `resolved -> closed`
- `resolved -> in_progress`
- `closed -> archived`
- `cancelled -> archived`

The current admin route file exposes endpoints through close/cancel, but no `/admin/maintenance/:id/archive` route is exposed. The frontend therefore does not show an Archive action.

Request-number behavior:

- Maintenance request numbers are generated by the backend from `maintenance_request_sequence`.
- The format remains `KSM-MNT-0001`, `KSM-MNT-0002`, and so on.
- The frontend never submits or manufactures request numbers.

Resident and placement linkage:

- The backend maintenance table stores optional `resident_id`, `room_id`, and `bed_id`.
- The frontend displays those stored IDs through bounded lookups and does not infer placement from a resident's current allocation.
- The backend does not currently store `academic_session_id` or `allocation_id` on maintenance requests, so those fields are shown as not stored rather than inferred.

Assignment and work handling:

- Assignment uses `POST /admin/maintenance/:id/assign` with `staffId`.
- The backend validates eligible assignees by active staff whose role is `maintenance`, `manager`, or `super_admin`.
- Assignment is distinct from resolution.
- Start Work uses `POST /admin/maintenance/:id/start`.
- Resolve uses `POST /admin/maintenance/:id/resolve`.
- Close uses `POST /admin/maintenance/:id/close`.
- Cancel uses `POST /admin/maintenance/:id/cancel`.
- The backend does not currently accept separate resolution notes, cancellation reasons, or close notes on these status endpoints; the UI shows confirmation dialogs but does not invent or persist unsupported note fields.

Maintenance-request vs room/bed-maintenance distinction:

- A maintenance request is a work record.
- Creating or updating a request does not call room status, bed status, booking, allocation, or transfer endpoints.
- Setting `rooms.status = maintenance` or `beds.status = maintenance` remains a separate Rooms & Beds operation.
- Phase 10D room/bed safeguards remain authoritative for taking inventory out of service.

RBAC behavior:

- `super_admin`: full access.
- `manager`: maintenance read/create/assign/update/resolve/close in the current backend/frontend permission map.
- `reception`: maintenance read/create/assign in the current backend/frontend permission map.
- `maintenance`: maintenance read/update/resolve in the current backend/frontend permission map.
- `accounts`: no maintenance management access.
- Backend authorization remains authoritative.

Known backend/API limitations:

- `GET /admin/maintenance` returns raw maintenance rows without joined resident, room, bed, institution, or staff labels. The UI performs bounded current-page lookups using existing endpoints.
- Server-side maintenance search covers request number, title, and status only.
- Resident, room, assigned staff, status, and priority filters beyond backend search are current-page/frontend filters unless backend list filtering is expanded later.
- Maintenance requests do not currently store academic session, allocation ID, resolution text, cancellation reason, closed reason, or separate work-note fields.
- The backend service transition map allows `closed -> archived` and `cancelled -> archived`, but the admin routes do not expose an archive endpoint yet.

## Announcements

The Announcements interface uses the current backend APIs:

- `GET /admin/announcements`
- `POST /admin/announcements`
- `GET /admin/announcements/:id`
- `PATCH /admin/announcements/:id`
- `POST /admin/announcements/:id/publish`
- `POST /admin/announcements/:id/expire`
- `POST /admin/announcements/:id/archive`
- `GET /admin/dashboard/announcements`
- `GET /public/announcements`

Implemented functionality:

- `/announcements` admin route
- dashboard summary cards for published, draft, high-alert, and expiring-soon announcements
- server-side search by backend-supported fields: title, audience, status, and severity
- current-page status and severity filters
- paginated announcements table with title, severity, audience, channels, status, publish window, and view action
- detail dialog with message body, lifecycle dates, channels, aggregate SMS/email recipient counts, and action controls
- create/edit draft workflow for roles with `announcement:write`
- publish workflow for roles with `announcement:publish`
- explicit high-alert confirmation before publishing high-alert records
- archive and expire actions using backend lifecycle endpoints
- external SMS/email channel check based on `announcement:external_delivery`
- loading, empty, no-results, API-error, validation-error, and publish-confirmation states

Announcement model:

- Lifecycle status remains `draft`, `published`, `expired`, and `archived`.
- Severity is separate from lifecycle and supports `normal`, `important`, and `high_alert`.
- Audience remains `all`, `residents`, and `staff`.
- Channels are normalized backend records, not comma-separated strings.
- Supported channels are Resident Portal, Staff/Admin Portal, Public Website, SMS, and Email.

Broadcast boundary:

- Announcements are broadcast/public notices, not private direct messages.
- The frontend never accepts or submits arbitrary recipient lists.
- Recipient information is shown only as aggregate SMS/email counts returned by the backend.
- SMS and email are opt-in channels. Selecting `high_alert` does not automatically select SMS or email.
- The current backend uses mock SMS/email delivery providers and logs external delivery attempts server-side without live provider credentials.

Public visibility:

- `GET /public/announcements` exposes only current, published records with the `public_website` channel enabled.
- Draft, archived, expired, future-scheduled, internal-only, contact, audit, and delivery-attempt data are not exposed through the public endpoint.

RBAC behavior:

- `super_admin`: full access.
- `manager`: announcement read/write/publish plus external-delivery permission in the current backend/frontend permission map.
- `reception`: announcement read only.
- `accounts` and `maintenance`: no announcement management access in the current backend/frontend permission map.
- Backend authorization remains authoritative.

Known backend/API limitations:

- `GET /admin/announcements` returns announcement records with channel arrays and aggregate delivery data, but does not include author/publisher staff display names yet.
- Status and severity filters are current-page/frontend filters unless backend list filtering is expanded later.
- External SMS/email delivery is mocked only. Ghana SMS/email provider credentials and delivery webhooks are intentionally not implemented in this phase.

## Messaging

The Messaging interface uses the current backend APIs:

- `GET /admin/messages`
- `POST /admin/messages/preview`
- `POST /admin/messages`
- `GET /admin/messages/:id`
- `POST /admin/messages/:id/send`
- `POST /admin/messages/:id/archive`

Implemented functionality:

- `/messages` admin route
- message history table with subject, target, channels, recipient count, sender, status, sent date, and actions
- summary cards for draft, sent, partially failed, and failed messages
- server-side search by backend-supported message fields: subject, target label, target type, and status
- current-page status filter
- create-draft workflow with required recipient preview before creation
- target modes for individual resident, selected residents, room, selected rooms, group, all residents, and staff
- explicit channel selection for Portal, SMS, and Email
- SMS character count and provider-cost placeholder
- send confirmation with target, recipient count, channels, SMS recipient context, and cost-not-configured wording
- message detail view with delivery summary and recipient names/status eligibility without raw phone/email
- archive action using the backend archive endpoint
- loading, empty, API-error, preview-error, send-error, archive-error, and RBAC states

Announcements vs Messaging:

- Announcements & Alerts are broad/public broadcast notices.
- Messaging & Communications is targeted private or operational communication.
- The Messaging UI does not reuse announcements as private messages.

Target definitions:

- `individual_resident`: one selected resident.
- `selected_residents`: selected resident IDs, deduplicated by backend user ID.
- `room`: residents with active allocations in one selected room.
- `selected_rooms`: residents with active allocations in selected rooms, deduplicated by backend user ID.
- `all_residents`: all active user accounts linked to non-archived residents.
- `staff`: staff selected by staff ID or role code; staff recipients are separate from residents.
- `current_residents`: residents where `residents.status = 'resident'`.
- `applicants`: residents where `residents.status = 'applicant'`.
- `active_allocations`: residents with active allocation records.
- `outstanding_balance`: residents with pending/confirmed bookings where `bookings.total_amount_minor` is greater than verified payment totals.
- `academic_session`: residents with submitted, under-review, or approved applications for the selected session.

Recipient snapshot behavior:

- The backend resolves recipients again at send time and persists the exact snapshot in `message_recipient_snapshots`.
- Individual resident and single-room targeting require exactly one explicit selected ID. Selected-resident and selected-room targeting require at least one explicit selected ID.
- Missing or empty selected-target IDs are rejected by the backend for both preview and send-time resolution instead of falling back to a broad resident or room population.
- Room and selected-room messages use active allocations, not bookings.
- A later room transfer or status change does not change historical recipients for an already sent message.
- Schema-verification fixture message `Verification Message` is directly inserted with status `sent` and no `sent_by_staff_id`, so it can display `Sent By: Not sent`. Production send workflow sets `sent_by_staff_id` and `sent_at` when a draft is sent.

Channels and delivery:

- Portal delivery writes durable `portal_message_deliveries` rows for future Resident Portal inbox support.
- SMS and email use server-side mock providers in development.
- SMS/email must be explicitly selected and require `message:external_delivery`.
- The UI never sends one email with visible resident addresses and never exposes SMS numbers.
- Idempotency keys are submitted by the frontend and enforced by backend durable unique constraints.
- Message-level status summarizes per-recipient/channel results as `sent`, `partially_failed`, or `failed`.
- Provider-specific details stay in delivery-attempt rows, not the main message record.

RBAC behavior:

- `super_admin`: full access.
- `manager`: message read/write/send and external delivery in the current backend/frontend permission map.
- `reception`: message read/write/send, portal-only because external delivery is not granted.
- `accounts`: message read/write/send, portal-only because external delivery is not granted.
- `maintenance`: message read/write/send, portal-only because external delivery is not granted.
- Backend authorization remains authoritative.

Known backend/API limitations:

- The Resident Portal inbox UI is not built in this phase.
- Live Ghana SMS and email providers are not connected.
- Provider pricing is not configured, so the UI displays `Estimated cost: Not configured`.
- Retry failed deliveries is not exposed yet; delivery attempts are stored so a later safe retry workflow can be added.
- Staff selection UI is intentionally minimal in this phase; resident and room targeting are the primary admin workflows.

## Reports

The Reports interface uses dedicated backend report endpoints plus existing academic-session lookup:

- `GET /admin/reports/overview`
- `GET /admin/reports/occupancy`
- `GET /admin/reports/residents`
- `GET /admin/reports/applications-bookings`
- `GET /admin/reports/finance`
- `GET /admin/reports/outstanding`
- `GET /admin/reports/maintenance`
- `GET /admin/academic-sessions`

Implemented functionality:

- `/reports` admin route
- practical tabs for Overview, Occupancy, Residents, Applications & Bookings, Finance, and Maintenance
- academic-session filter for reports that can be scoped by session
- resident-status filter for the resident report
- booking-status filter for the applications/bookings report
- date-range filters for finance and maintenance reports where timestamp fields exist
- summary cards, concise tables, browser print support, and CSV export for report tables
- loading, API-error, empty-table, unauthorized, and finance-RBAC states

Report formulas:

- Occupancy uses actual bed inventory and active allocation records: occupied usable beds divided by usable beds.
- `rooms.capacity` is displayed only as configured maximum capacity. It is not used as actual occupancy.
- Room occupancy rows show configured capacity, actual available-bed inventory, active allocations, available beds, gender policy, and room status.
- Resident placement comes from active allocations. It is not inferred from bookings.
- Application and booking lifecycle counts use their persisted status fields.
- Expected revenue is captured booking totals for pending, confirmed, and completed bookings.
- Verified revenue is verified payment total only. Pending/submitted payments are reported separately.
- Refunded payments are reported separately and are not treated as current verified revenue.
- Outstanding balance uses captured booking total minus verified payments for that booking.
- Receipt totals are not used as a substitute for verified payment totals.
- Maintenance reports use maintenance request records; they do not treat room or bed maintenance status as a request.

CSV export:

- Exports use the currently visible report table rows and filter context.
- Exports include clear column headings and formatted values.
- Exports do not include Ghana Card data, document URLs, OTP data, session tokens, password hashes, or raw private contact lists.

RBAC behavior:

- `super_admin`: full report access.
- `manager`: operational and financial reports.
- `accounts`: operational and financial reports.
- `reception`: operational reports only.
- `maintenance`: operational reports only.
- Finance tabs are hidden without `report:finance`, and backend authorization remains authoritative.

Known backend/API limitations:

- Reports are aggregate/table reports, not a BI warehouse.
- Date filters are passed as UTC-stored ISO/date strings and currently apply to payment `created_at` and maintenance request `created_at`.
- Charts were deferred; each report exposes the underlying accessible numbers and tables first.

## Staff

The Staff interface uses joined backend Staff APIs:

- `GET /admin/staff`
- `POST /admin/staff`
- `GET /admin/staff/:id`
- `PATCH /admin/staff/:id/role`
- `PATCH /admin/staff/:id/status`
- `PATCH /admin/staff/:id/account-status`
- `POST /admin/staff/:id/reset-password`
- `GET /admin/roles`

Implemented functionality:

- `/staff` admin route
- professional Staff page header using the approved shell and visual system
- current-page summary cards for active staff, managers, reception, accounts, and maintenance
- server-side search by backend-supported fields: staff code, name, username, email, role, staff status, and account status
- paginated staff table with Staff Code, Name, Username, Email, Role, Staff Status, Account Status, Created, and Actions
- joined backend response that preserves `users -> staff -> roles` without frontend fan-out lookups
- staff detail dialog organized into Staff, Login Account, Access, and Actions sections
- Add Staff workflow for Super Admins only
- role-change, staff-status, account-status, and password-reset workflows with confirmation dialogs
- clear distinction between `staff.status` and `users.status`
- loading, empty, no-search-results, API-error, validation-error, and one-time-password states

Staff identity model:

- Identity fields such as display name, username, email, phone, account status, and password hash belong to `users`.
- Staff operational profile fields such as staff code, job title, staff status, and role assignment belong to `staff`.
- Role metadata comes from `roles`.
- Staff code is currently caller-supplied by Super Admin users; no `KSM-STF` sequence exists yet.
- The frontend never manufactures password hashes, session tokens, OTPs, or resident-style staff sequences.

Password handling:

- New staff passwords are sent to the backend once as a requested initial password or omitted so the backend generates one.
- The backend hashes passwords before persistence.
- The plaintext initial password or reset password is returned once and shown in an immediate success dialog only.
- The frontend does not persist, log, list, or redisplay plaintext staff passwords.
- Password reset revokes active sessions for that staff user's account.

Backend safeguards surfaced by the UI:

- Only `super_admin` can create staff, change staff roles, change staff status, change account status, or reset staff passwords.
- Managers have staff read access only.
- `resident` is filtered out of staff role choices.
- Non-Super Admin users cannot create, promote, demote, deactivate, archive, suspend, or reset Super Admin accounts.
- The last active Super Admin cannot be demoted, deactivated, archived, or account-deactivated.
- Self-deactivation and self account deactivation are blocked by the backend.
- Role, staff-status, account-status, and password changes revoke active sessions so permission changes take effect immediately.
- Backend authorization remains authoritative; UI hiding is only an ergonomic layer.

Known backend/API limitations:

- Staff code remains caller-supplied. A future migration can add a dedicated staff-code sequence if Kissmet wants generated `KSM-STF-xxxx` references.
- The Staff list response returns a page of joined records but not a total-count field yet, so summary cards are current-page counts.
- There is no general staff profile edit endpoint for changing job title, email, username, display name, or phone without using account/status/role-specific operations.

## Audit Logs

The Audit Logs interface uses read-only backend audit APIs:

- `GET /admin/audit-logs`
- `GET /admin/audit-logs/:id`

Implemented functionality:

- `/audit-logs` admin route
- professional Audit Logs page header using the approved shell and visual system
- no Add, Edit, Delete, Archive, Clear Logs, Purge, Restore, or manually-create actions
- paginated audit table with Timestamp, Actor, Action, Entity, Details, and View columns
- newest-first backend ordering
- server-side filters for search, actor user ID, actor staff ID, action, entity type, date from, and date to
- detail modal organized into Event, Actor, Target, Request Context, and Details
- human-readable timestamps through the shared `formatDateTime()` utility
- readable action labels while preserving the exact stored action key in details
- readable metadata key/value display with JSON fallback for nested values
- loading, empty, filtered-empty, API-error, missing-value, and pagination states

Read-only and append-only behavior:

- Audit records are operational/security history.
- The Admin Portal exposes no audit mutation controls.
- The backend exposes no audit log update, delete, archive, purge, restore, or manual-create route.
- Viewing audit logs records `admin.audit_logs.accessed`; viewing a specific log records `admin.audit_logs.detail_accessed`.

Permissions:

- `super_admin`: audit read access.
- `manager`: audit read access in the current locked permission model.
- `reception`, `accounts`, `maintenance`, and `resident`: blocked unless the backend permission map is changed in a future phase.
- Frontend navigation hides Audit Logs from unauthorized roles, and backend `audit:read` remains authoritative.

Metadata redaction:

- The backend sanitizes audit metadata before returning it to the frontend.
- Sensitive keys such as password, password hash, temporary password, token, session token, OTP, OTP hash, authorization header, secret, API key, Cloudflare token, SMS secret, and storage secrets are returned as `[REDACTED]`.
- Redaction is recursive for nested metadata.
- Historical audit rows are not rewritten.

Audit coverage review:

- Existing critical administrative and security workflows already write audit entries for staff creation, staff role changes, staff/account status changes, password reset, application decisions, booking create/status changes, payment verification/rejection/refund, payment-threshold/payment-attention events, allocation create/transfer/status changes, receipt issue/void, document access/verification/rejection, maintenance create/assign/status changes, announcement create/update/publish/status changes, targeted message create/send/archive, resident registration, resident profile updates, resident document uploads, and resident application changes.
- No critical audit gap requiring a code fix was found during this phase.

Known backend/API limitations:

- Audit metadata depends on what the original mutation captured. Missing historical fields are displayed as `Not available`.
- Actor details are joined from current `users`, `staff`, and `roles` where available. If a referenced actor was removed or is unavailable, the historical actor IDs remain visible.
- The API returns total count for audit pagination, but it does not expose separate summary-card aggregates yet.

## Settings

The Settings interface uses narrowly scoped backend settings APIs:

- `GET /admin/settings`
- `PATCH /admin/settings/general`
- `PATCH /admin/settings/payment-confirmation`

Implemented functionality:

- `/settings` admin route
- grouped sections for General, Academic, Payments, Communications, and Security / System
- editable general profile settings for Super Admin users
- payment confirmation policy management for Super Admin users
- read-only Academic overview showing the active academic session
- honest Communications provider state showing development/mock SMS and email providers
- read-only Security / System information for runtime, framework, database, private R2 storage, auth model, and audit logging
- payment-policy confirmation dialog explaining that existing financial history is not rewritten
- loading, success, API-error, validation-error, read-only, and external-configuration states

Editable settings:

- Organization name
- Admin portal title
- Resident portal title
- Support email
- Support phone
- Address/location text
- Default currency, still defaulting to `GHS`
- Payment confirmation requirement: `full`, `fixed`, or `percentage`

Read-only settings:

- Active academic session summary; full session CRUD remains in the existing academic-session admin API.
- Security/system architecture information.
- Current communication provider mode.

Externally configured settings:

- Live SMS provider credentials.
- Live email provider credentials.
- Cloudflare credentials/tokens.
- R2 credentials.

These belong in Cloudflare environment configuration or secrets, not ordinary D1 settings, and are never exposed to the frontend.

Payment confirmation behavior:

- `full` requires verified payments to meet the full captured booking total.
- `fixed` accepts GHS major units in the UI and converts to integer minor units before calling the backend.
- `percentage` accepts a human-readable percentage and converts to basis points before calling the backend.
- Changing the policy does not automatically confirm bookings, alter payments, alter receipts, rewrite captured booking totals, rewrite room rates, or clear payment-attention states.
- Backend confirmation checks remain authoritative.

Settings storage:

- General/branding settings are stored in singleton `system_settings`.
- Payment confirmation settings remain in the existing `payment_confirmation_settings` table.
- Settings do not store secrets or arbitrary JSON blobs.

RBAC behavior:

- `super_admin`: read and update settings.
- `manager`: read settings only.
- Other roles do not see Settings navigation and backend authorization remains authoritative.

Audit behavior:

- General settings updates write `admin.settings.general_updated`.
- Payment confirmation updates write `admin.settings.payment_confirmation_updated`.
- Audit metadata contains non-secret operational values only.

Known backend/API limitations:

- The Settings page does not apply branding values to the live shell yet; it stores durable values for future portal/runtime use.
- No logo upload, theme designer, email template builder, provider-key editor, or maintenance dependency was added.
- Settings has no delete/reset endpoint.

## Design System

Design tokens are defined as CSS variables in `src/styles/index.css` and mapped into Tailwind:

- background
- surface
- border
- primary
- muted
- success
- warning
- danger
- text-primary
- text-secondary
- radius
- shadows
- spacing

The visual style is compact, professional, data-focused, and intended to be easy to rebrand.

## Testing

Frontend tests cover:

- login success
- login failure
- protected-route redirect
- authenticated route rendering
- logout
- dashboard loading
- dashboard success
- dashboard error state
- residents list rendering
- resident detail dialog
- resident server-side search request
- Add Resident RBAC visibility
- resident creation without frontend-generated resident code
- residents API error state
- applications list rendering
- application detail dialog
- human-readable application timestamps
- reusable date/time formatter
- submitted-to-under-review transition
- under-review approval
- under-review rejection with decision notes
- invalid application actions hidden by state
- approval does not trigger booking or allocation requests
- application action RBAC visibility
- applications server-side search request
- applications API error and transition failure states
- frontend does not expose application creation or generated-number input
- bookings list rendering
- booking detail dialog
- booking creation from approved applications
- non-approved applications excluded from booking creation
- frontend does not generate booking numbers
- room/rate preview
- captured amount display
- payment-threshold-gated confirmation visibility
- confirmation success and failure
- confirmation does not trigger allocation requests
- payment-attention display
- booking RBAC action visibility
- invalid booking transitions hidden
- booking API and creation error states
- human-readable booking dates
- rooms list rendering
- configured capacity separated from actual bed inventory
- room detail occupancy from active allocations
- room creation without implicit bed creation
- bed capacity guard
- bed creation and safe bed status handling
- room-rate creation with integer minor units
- duplicate active room/session rate error display
- room-rate status changes do not mutate booking pricing
- rooms RBAC write-action visibility
- rooms API error state
- allocations list rendering
- allocation detail dialog
- only confirmed bookings eligible for allocation
- specific destination bed required
- successful allocation without booking financial-basis mutation
- duplicate active resident/session allocation excluded from the eligible booking list
- unavailable/occupied bed filtering through backend availability
- gender and pricing incompatible beds excluded where available data allows
- same-room and same-priced cross-room transfer options
- differently priced cross-room transfer rejection surfaced from the backend
- transferred allocation history remains visible
- end allocation status action
- allocation RBAC action visibility
- allocation API and mutation error states
- human-readable allocation dates
- payments list rendering
- payment detail dialog
- payment creation without frontend-generated payment references
- overpayment rejection surfaced from the backend
- dedicated verification flow without booking auto-confirmation
- verification, rejection, refund, and upload failure states
- payment attention after refunds
- private payment-slip upload handling
- payment RBAC action visibility
- receipts list rendering
- receipt detail dialog
- backend-generated receipt number display
- receipt issuing without frontend-generated receipt numbers
- payment/resident/booking linkage
- separate part-payment receipts
- amount/currency and issued-date formatting
- successful void without deletion
- void failure handling
- voided receipt visibility
- printable A4 receipt rendering without unsupported business data
- print-layout style coverage
- receipt RBAC action visibility
- receipts API error state
- maintenance list rendering
- maintenance detail dialog
- backend-generated maintenance request number display
- maintenance creation without frontend-generated request numbers
- resident and stored room/bed context display
- assignment flow and assignment failure handling
- start-work transition and transition failure handling
- resolve, close, and cancel workflows
- maintenance request boundaries that do not mutate room, bed, or allocation state
- maintenance RBAC action visibility
- maintenance API error state
- human-readable maintenance dates
- announcements list rendering
- announcement draft creation without frontend-generated recipients
- high-alert publish confirmation
- announcement RBAC visibility
- messages list rendering
- message draft creation after preview
- message target type selection
- individual resident targeting
- explicit SMS selection
- send confirmation with idempotency key
- delivery detail without contact disclosure
- messaging RBAC external-channel behavior
- messaging error state
- staff joined table rendering
- staff server-side search request
- staff creation without password hash exposure
- one-time initial password display
- Super Admin role/password management actions
- staff management actions hidden from managers
- staff API error state
- audit logs route rendering
- audit table rendering with human-readable timestamps
- audit server-side filter parameters
- audit detail modal event/actor/target/context display
- audit missing-value handling
- audit sensitive metadata redaction
- audit pagination
- unauthorized Audit Logs navigation hiding
- settings route rendering
- settings navigation visibility by role
- Super Admin general settings update
- manager read-only settings behavior
- payment confirmation full/fixed/percentage controls
- fixed payment amount conversion to integer minor units
- percentage conversion to basis points
- settings validation and API error states
- communication provider state without secret exposure
- security/system section without sensitive values
- money parser validation
- currency formatting
- status formatting
- date/time formatting

Latest validation:

```text
admin-frontend: npm.cmd run typecheck passed
admin-frontend: npm.cmd test passed, 19 files / 128 tests
admin-frontend: npm.cmd run build passed
cloudflare: npm.cmd run typecheck passed
cloudflare: npm.cmd test passed, 5 files / 94 tests
cloudflare: npm.cmd run db:verify:local passed, 55 commands executed successfully
```

## Running Locally

Backend:

```text
cd cloudflare
npm.cmd run dev
```

Frontend:

```text
cd admin-frontend
npm.cmd run dev
```

Open the Vite URL shown in the terminal. By default, the frontend expects the API at `http://localhost:8787`.
