# Kissmet Hostel D1 Database Schema

## Overview

This schema is the canonical Cloudflare D1 schema for the Kissmet Hostel portal. It is designed for one hostel with fewer than 20 rooms, with normalized room/bed inventory, session-specific room rates, explicit operational statuses, integer minor-unit money values, R2-backed document references, expiring OTP records, revocable sessions, and append-only audit records.

The first migration is:

```text
cloudflare/migrations/0001_canonical_schema.sql
```

Schema hardening migrations are:

```text
cloudflare/migrations/0002_auth_username.sql
cloudflare/migrations/0003_resident_code_sequence.sql
cloudflare/migrations/0004_booking_number_sequence.sql
cloudflare/migrations/0005_payments_receipts_foundation.sql
cloudflare/migrations/0006_resident_onboarding.sql
cloudflare/migrations/0007_operations_reporting.sql
cloudflare/migrations/0008_booking_priced_room.sql
cloudflare/migrations/0009_announcements_alerts.sql
cloudflare/migrations/0010_messages_communications.sql
cloudflare/migrations/0011_system_settings.sql
```

Development seed data is:

```text
cloudflare/seeds/development.sql
```

## General Decisions

- Primary keys use `INTEGER PRIMARY KEY`, compatible with SQLite/D1 row ids.
- Foreign keys use `ON DELETE RESTRICT` for operational and financial history that must not be silently removed.
- Soft archival is represented with `status = 'archived'` and/or `archived_at`.
- Timestamps are UTC ISO-8601 text values using `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`.
- The default application currency is `GHS`.
- Money is stored as integer minor units, for example Ghana pesewas in `amount_minor` and `total_amount_minor`.
- R2 files are referenced by bucket/key metadata only. Binary content is never stored in D1.
- Partial unique indexes enforce active-state business rules while preserving historical records.

## Tables

### `roles`

Stores staff role definitions.

- Important fields: `code`, `name`, `description`, `is_system`.
- Unique constraints: `code`.
- Seed roles: `super_admin`, `manager`, `reception`, `accounts`, `maintenance`.

### `users`

Stores identity records shared by residents, staff, and system actors.

- Important fields: `email`, `phone`, `display_name`, `user_type`, `status`, `password_hash`.
- Phase 3 adds nullable `username` through `cloudflare/migrations/0002_auth_username.sql` for staff/admin login by email or username.
- Status values: `active`, `inactive`, `suspended`, `archived`.
- User type values: `resident`, `staff`, `system`.
- Unique constraints: `email`, `phone`, `username`.
- Authentication is not implemented in Phase 2; `password_hash` exists for the later staff/admin auth phase.

### `staff`

Stores staff profile records connected to `users` and `roles`.

- Relationships: `staff.user_id -> users.id`, `staff.role_id -> roles.id`.
- Identity fields such as `display_name`, `username`, `email`, `phone`, `status`, and `password_hash` remain on `users`.
- Staff-specific fields such as `staff_code`, `job_title`, `hire_date`, and operational `status` remain on `staff`.
- Status values: `active`, `inactive`, `archived`.
- Unique constraints: `user_id`, `staff_code`.
- Staff code is currently caller-supplied by Super Admin users. There is no staff-code sequence in the v1 schema.
- Staff role/status/account/password management revokes active sessions at the service layer; session revocation data is stored in `sessions.status`, `revoked_at`, and `revocation_reason`.

### `academic_sessions`

Stores hostel academic/session periods.

- Status values: `draft`, `active`, `closed`, `archived`.
- Unique constraints: `code`.
- Active-session rule: partial unique index allows only one row where `status = 'active'`.
- Date rule: `starts_on <= ends_on`.

### `institutions`

Stores schools/institutions that issue student IDs.

- Important fields: `code`, `name`, `status`.
- Status values: `active`, `inactive`, `archived`.
- Unique constraints: `code`.

### `residents`

Stores resident/student profile records linked to `users`.

- Relationships: `residents.user_id -> users.id`.
- `resident_code` is Kissmet's internal resident identifier. It is system-generated when a resident record is created and is not required for normal portal login.
- Resident codes use the public internal format `KSM-RES-0001`, `KSM-RES-0002`, and so on. They are allocated from `resident_code_sequence`, not derived from or equal to the D1 integer primary key.
- `student_id` is the resident's external school or institution student ID.
- `institution_id` links the student ID to the issuing institution.
- `middle_name` stores the optional structured middle name for onboarding.
- `phone_verified_at` records registration phone verification before a normal resident session is issued.
- Status values: `prospect`, `applicant`, `resident`, `past_resident`, `suspended`, `archived`.
- Unique constraints: `user_id`, `resident_code`, `(institution_id, student_id)`.
- Student IDs are not assumed to be globally unique. The same `student_id` may exist at different institutions, but each `(institution_id, student_id)` pair maps to exactly one resident record.

### `resident_code_sequence`

Stores the next numeric value used to allocate Kissmet resident reference codes.

- Single-row table: `id = 1`.
- Important fields: `prefix`, `next_value`, `padding`.
- Default format: `KSM-RES-` plus a zero-padded sequence number with at least four digits.
- The service layer allocates a code with a compare-and-swap update on `next_value`, then inserts it into `residents.resident_code`.
- `residents.resident_code` remains unique, so D1 rejects any unexpected collision instead of silently duplicating codes.

### `rooms`

Stores normalized room inventory.

- A room can contain multiple beds through `beds.room_id`.
- Important fields: `room_code`, `capacity`, `gender_policy`, `status`.
- Individual `beds` rows are the authoritative source of actual occupancy and bed inventory.
- `rooms.capacity` is the configured maximum capacity. Application services must prevent creating active beds beyond this configured capacity.
- Gender policy values: `female`, `male`, `any`.
- Status values: `available`, `maintenance`, `inactive`, `archived`.
- Unique constraints: `room_code`.

### `beds`

Stores normalized bed inventory.

- Relationships: `beds.room_id -> rooms.id`.
- Status values: `available`, `maintenance`, `inactive`, `archived`.
- Unique constraints: `bed_code`, `(room_id, label)`.

### `room_rates`

Stores room pricing by academic session so historical prices are preserved.

- Relationships: `room_rates.room_id -> rooms.id`, `room_rates.academic_session_id -> academic_sessions.id`.
- Status values: `draft`, `active`, `inactive`, `archived`.
- Money fields: `amount_minor`, `currency`.
- Default currency: `GHS`.
- Unique constraints: `rate_code`.
- Active rate rule: partial unique index prevents more than one active rate for the same room/session.
- Rates are versioned by session and status rather than overwritten.

### `applications`

Stores resident application records for a session.

- Relationships: `resident_id -> residents.id`, `academic_session_id -> academic_sessions.id`, `reviewed_by_staff_id -> staff.id`.
- Status values: `draft`, `submitted`, `under_review`, `approved`, `rejected`, `cancelled`, `archived`.
- Unique constraints: `application_number`.
- Application numbers use the format `KSM-APP-0001`, `KSM-APP-0002`, and so on. They are allocated from `application_number_sequence`, not derived from the D1 integer primary key.
- Application creation services allocate `application_number` internally. Frontend callers and API clients must not provide or choose the application number.
- Active application rule: partial unique index prevents multiple active application records for the same resident/session while allowing rejected, cancelled, and archived history.
- Approval rule: approving an application must not automatically allocate a bed. Approval only means the applicant is eligible to proceed to booking/placement. Bed allocation remains a separate explicit staff action.

### `bookings`

Stores booking records for approved/active resident placement workflows.

- Relationships: `resident_id -> residents.id`, `academic_session_id -> academic_sessions.id`, `application_id -> applications.id`.
- Status values: `pending`, `confirmed`, `cancelled`, `expired`, `completed`, `archived`.
- Money fields: `total_amount_minor`, `currency`.
- Pricing source fields: `priced_room_id`, `priced_room_rate_id`.
- Unique constraints: `booking_number`.
- Active booking rule: partial unique index prevents duplicate `pending` or `confirmed` bookings for the same resident/session.
- Booking rule: a booking may reference an approved application, but creating or confirming a booking must still not implicitly create an allocation unless a future service explicitly implements and names that combined operation.
- Booking numbers use the format `KSM-BKG-0001`, `KSM-BKG-0002`, and so on. They are allocated from `booking_number_sequence`, not derived from the D1 integer primary key.
- Confirmation rule: `pending -> confirmed` requires the active payment confirmation setting to be satisfied by verified, non-refunded payments. Confirmation remains an explicit staff action.
- Payment attention fields: `payment_attention_required`, `payment_attention_reason`. Refunds that make an already confirmed booking fall below the threshold flag attention instead of silently changing booking status.
- Financial basis rule: new bookings persist the room selected for pricing in `priced_room_id` and the active room-rate row used in `priced_room_rate_id`. `total_amount_minor` and `currency` remain the immutable captured financial basis used by payment confirmation, receipts, refunds, and payment-attention checks.

### `booking_number_sequence`

Stores the next numeric value used to allocate Kissmet booking numbers.

- Single-row table: `id = 1`.
- Important fields: `prefix`, `next_value`, `padding`.
- Default format: `KSM-BKG-` plus a zero-padded sequence number with at least four digits.
- The service layer allocates a booking number with a compare-and-swap update on `next_value`, then inserts it into `bookings.booking_number`.
- `bookings.booking_number` remains unique, so D1 rejects any unexpected collision instead of silently duplicating booking numbers.

### `application_number_sequence`

Stores the next numeric value used to allocate Kissmet application numbers.

- Single-row table: `id = 1`.
- Default format: `KSM-APP-` plus a zero-padded sequence number with at least four digits.
- The service layer allocates an application number with a compare-and-swap update on `next_value`, then inserts it into `applications.application_number`.
- `applications.application_number` remains unique, so D1 rejects any unexpected collision instead of silently duplicating application numbers.

### `allocations`

Stores bed assignment history.

- Relationships: `booking_id -> bookings.id`, `resident_id -> residents.id`, `academic_session_id -> academic_sessions.id`, `bed_id -> beds.id`, `assigned_by_staff_id -> staff.id`.
- Status values: `active`, `ended`, `cancelled`, `transferred`, `archived`.
- Active bed rule: partial unique index prevents more than one active allocation per bed.
- Active resident/session rule: partial unique index prevents more than one active allocation for a resident in the same session.
- History is preserved by ending/transferring allocations instead of deleting them.
- Allocation rule: active bed assignment is created only through an explicit allocation workflow that selects a specific bed and records the assigning staff member.
- Priced-room rule: normal allocation must target the booking's priced room, unless the selected bed is in another room whose active rate for the booking session has the same `amount_minor` and `currency` as the booking's captured financial basis. Differently priced cross-room allocation is rejected.
- Transfer rule: same-room transfers do not reprice. Cross-room transfers are allowed only when the destination room's active session rate has the same amount and currency as the booking's captured financial basis. Historical room-rate rows are never mutated to make a transfer work.

### `payments`

Stores payment records.

- Relationships: `booking_id -> bookings.id`, `resident_id -> residents.id`, `verified_by_staff_id -> staff.id`.
- Status values: `pending`, `submitted`, `verified`, `rejected`, `refunded`, `cancelled`, `archived`.
- Money fields: `amount_minor`, `currency`.
- Payment method values: `cash`, `bank_transfer`, `mobile_money`, `card`, `other`.
- Unique constraints: `payment_reference`.
- `amount_minor` must be greater than zero.
- Payment references use the format `KSM-PAY-0001`, `KSM-PAY-0002`, and so on. They are allocated from `payment_reference_sequence`, not derived from the D1 integer primary key.
- Verified totals and balances are calculated from `payments`; no manually maintained booking balance is stored.
- Reporting finance queries count only `status = 'verified'` payments as verified revenue. Pending/submitted payments are reported separately, refunded payments are reported separately, and receipt totals are not used as a substitute for payment totals.

### `payment_reference_sequence`

Stores the next numeric value used to allocate Kissmet payment references.

- Single-row table: `id = 1`.
- Default format: `KSM-PAY-` plus a zero-padded sequence number with at least four digits.

### `payment_confirmation_settings`

Stores the active booking confirmation requirement.

- Requirement types: `full`, `fixed`, `percentage`.
- `full`: verified payments must equal the booking total.
- `fixed`: verified payments must meet `fixed_amount_minor`, capped at the booking total.
- `percentage`: verified payments must meet `percentage_basis_points` of the booking total.
- The default row requires full payment in `GHS`.
- Phase 10N exposes narrow read/update settings APIs for this table.
- Updating the row changes future manual booking-confirmation eligibility checks only. It does not automatically confirm bookings, alter payments, alter receipts, rewrite booking totals, rewrite room rates, or clear existing payment-attention states.

### `system_settings`

Stores singleton non-secret global hostel/profile settings.

- Single-row table: `id = 1`.
- Important fields: `organization_name`, `admin_portal_title`, `resident_portal_title`, `support_email`, `support_phone`, `address_text`, `default_currency`.
- Default currency remains `GHS`.
- Timestamps: `created_at`, `updated_at`.
- Settings are one-hostel scoped.
- Secrets are not stored here. Cloudflare credentials, SMS/email provider secrets, R2 credentials, password hashes, session tokens, and OTP values remain outside ordinary D1 settings.
- Updating general settings writes `admin.settings.general_updated`.

### `receipts`

Stores issued receipt records.

- Relationships: `payment_id -> payments.id`, `issued_by_staff_id -> staff.id`.
- Status values: `issued`, `voided`, `archived`.
- Unique constraints: `payment_id`, `receipt_number`.
- Receipts are voided, not deleted.
- Receipt numbers use the format `KSM-RCP-0001`, `KSM-RCP-0002`, and so on. They are allocated from `receipt_number_sequence`, not derived from the D1 integer primary key.
- A payment may have only one active issued receipt.

### `receipt_number_sequence`

Stores the next numeric value used to allocate Kissmet receipt numbers.

- Single-row table: `id = 1`.
- Default format: `KSM-RCP-` plus a zero-padded sequence number with at least four digits.

### `documents`

Stores R2 object metadata and links to domain records.

- Relationships may point to owner user, resident, application, booking, payment, or receipt.
- Document type values: `student_card`, `ghana_card`, `profile_photo`, `application_support`, `payment_slip`, `receipt_pdf`, `other`.
- Status values: `uploaded`, `verified`, `rejected`, `deleted`, `archived`.
- R2 fields: `r2_bucket`, `r2_key`, `original_filename`, `content_type`, `size_bytes`, `checksum_sha256`.
- Unique constraints: `r2_key`.
- No binary file contents are stored in D1.
- Student Card and Ghana Card files must be stored privately in R2; D1 stores only metadata and object references.
- Resident-facing document metadata must not expose private R2 object keys. File viewing/download must be mediated by authenticated backend ownership checks before any private object content is streamed.
- Ghana Card numbers must not be used as authentication credentials.
- Ownership rule: document links must be internally consistent. For example, a payment-slip document linked to a `payment_id` must belong to the same resident as that payment; a receipt document linked to a `receipt_id` must trace through its payment to the same resident; an application document must belong to the same resident as the application. These cross-table ownership rules are enforced in the service layer because SQLite `CHECK` constraints cannot query other tables.
- A document may be attached to multiple related records only when those records belong to the same resident workflow. Services must reject documents attached to unrelated residents, bookings, payments, or receipts.

### `maintenance_requests`

Stores resident or room maintenance issues.

- Relationships may point to resident, room, bed, and assigned staff.
- Request numbers use the format `KSM-MNT-0001`, `KSM-MNT-0002`, and so on. They are allocated from `maintenance_request_sequence`, not derived from the D1 integer primary key.
- Category values: `plumbing`, `electrical`, `furniture`, `cleaning`, `security`, `other`.
- Priority values: `low`, `normal`, `high`, `urgent`.
- Status values: `open`, `assigned`, `in_progress`, `resolved`, `closed`, `cancelled`, `archived`.
- Lifecycle timestamps: `opened_at`, `assigned_at`, `started_at`, `resolved_at`, `closed_at`, `archived_at`.
- Valid workflow transitions are `open -> assigned/cancelled`, `assigned -> in_progress/cancelled`, `in_progress -> resolved/cancelled`, `resolved -> closed/in_progress`, `closed -> archived`, and `cancelled -> archived`.
- Unique constraints: `request_number`.

### `maintenance_request_sequence`

Stores the next numeric value used to allocate Kissmet maintenance request numbers.

- Single-row table: `id = 1`.
- Default format: `KSM-MNT-` plus a zero-padded sequence number with at least four digits.
- `maintenance_requests.request_number` remains unique, so D1 rejects any unexpected collision.

### `announcements`

Stores broadcast announcements and alerts.

- Relationships: `published_by_staff_id -> staff.id`, `created_by_staff_id -> staff.id`.
- Audience values: `all`, `residents`, `staff`.
- Severity values: `normal`, `important`, `high_alert`.
- Status values: `draft`, `published`, `expired`, `archived`.
- Scheduling fields: `starts_at`, `published_at`, `expires_at`.
- Valid workflow transitions are `draft -> published/archived`, `published -> expired/archived`, and `expired -> archived`.
- Severity is independent from lifecycle. A `high_alert` may still be a draft, published, expired, or archived record.
- `high_alert` does not imply SMS or email delivery. SMS and email are selected explicitly through `announcement_channels`.
- Resident portal visibility is restricted to `audience IN ('all', 'residents')`, `status = 'published'`, current scheduling, and an enabled `resident_portal` channel.
- Public website visibility is restricted to `status = 'published'`, current scheduling, and an enabled `public_website` channel. The public endpoint returns an allowlisted announcement shape only.
- Historical announcement records are preserved through lifecycle status changes, not deletion.

### `announcement_channels`

Stores normalized delivery/display channels for announcements. Channels are not stored as comma-separated text.

- Relationships: `announcement_channels.announcement_id -> announcements.id`.
- Channel values: `resident_portal`, `staff_portal`, `public_website`, `sms`, `email`.
- Status values: `enabled`, `disabled`.
- Unique constraints: `(announcement_id, channel)`.
- SMS and email are external delivery channels. Portal and public website channels control visibility only.

### `announcement_delivery_attempts`

Stores external SMS/email delivery attempt records.

- Relationships: `announcement_delivery_attempts.announcement_id -> announcements.id`, `recipient_user_id -> users.id`.
- Channel values: `sms`, `email`.
- Recipient kind values: `resident`, `staff`.
- Status values: `sent`, `failed`.
- Important fields: `provider_message_id`, `provider_status`, `failure_reason`, `idempotency_key`, `attempted_at`.
- Unique constraints: `(announcement_id, channel, recipient_user_id, idempotency_key)` protects against duplicate sends for repeated publish attempts.
- Provider failure is logged here and does not delete, archive, or otherwise mutate the announcement.
- Contact lists are not exposed through admin or public announcement responses; services may expose aggregate recipient counts.

### `messages`

Stores targeted private or operational communication drafts and send history. Messaging is separate from Announcements & Alerts: announcements are broad/public notices, while messages are targeted communications.

- Important fields: `subject`, `body`, `target_type`, `target_label`, `target_config_json`, `status`, `created_by_staff_id`, `sent_by_staff_id`, `sent_at`, `idempotency_key`.
- Target type values: `individual_resident`, `selected_residents`, `room`, `selected_rooms`, `group`, `all_residents`, `staff`.
- Status values: `draft`, `queued`, `sent`, `partially_failed`, `failed`, `archived`.
- Unique constraints: `idempotency_key`.
- Provider-specific delivery statuses are not stored on the message record. Message status only summarizes the resolved delivery outcomes.
- The target configuration records how the target was selected; the final historical recipient set is preserved separately in `message_recipient_snapshots`.

### `message_channels`

Stores normalized selected channels for each message.

- Relationships: `message_channels.message_id -> messages.id`.
- Channel values: `portal`, `sms`, `email`.
- Status values: `enabled`, `disabled`.
- Unique constraints: `(message_id, channel)`.
- SMS and email are explicit opt-in channels and are never inferred from message importance.

### `message_recipient_snapshots`

Stores the resolved recipient set when a message is sent.

- Relationships may point to `users`, `residents`, `staff`, and room context.
- Important fields: `recipient_kind`, `display_name`, `resident_code`, `student_id`, `institution_name`, `staff_code`, `room_id`, `room_code`, `sms_eligible`, `email_eligible`, `portal_eligible`.
- Unique constraints: `(message_id, user_id)`.
- Room and selected-room targets resolve residents from active allocations, not booking status.
- Snapshot rows preserve history. A room-targeted message keeps the residents who were actively allocated at send time even if occupants later transfer rooms.
- Phone and email values are not stored in snapshots and are not exposed in admin message responses.

### `message_delivery_attempts`

Stores per-recipient external SMS/email delivery attempts.

- Relationships: `message_delivery_attempts.message_id -> messages.id`, `recipient_snapshot_id -> message_recipient_snapshots.id`.
- Channel values: `sms`, `email`.
- Status values: `sent`, `delivered`, `failed`.
- Important fields: `provider_message_id`, `provider_status`, `failure_reason`, `idempotency_key`, `attempted_at`.
- Unique constraints: `(message_id, recipient_snapshot_id, channel, idempotency_key)` prevents duplicate sends during retries, double-clicks, refreshes, or repeated requests.
- One failed SMS/email attempt does not erase successful deliveries to other recipients.

### `portal_message_deliveries`

Stores durable portal-message delivery state for future Resident Portal inbox support.

- Relationships: `portal_message_deliveries.message_id -> messages.id`, `recipient_snapshot_id -> message_recipient_snapshots.id`, `user_id -> users.id`.
- Status values: `unread`, `read`.
- Important fields: `delivered_at`, `read_at`.
- Unique constraints: `(message_id, recipient_snapshot_id)`.
- Phase 10J creates the backend foundation only; it does not build the Resident Portal inbox UI.

### `otp_codes`

Stores OTP challenges for later authentication flows.

- Relationships may point to `users` and `residents`.
- Purpose values: `resident_login`, `phone_verification`, `password_reset`.
- Status values: `pending`, `used`, `expired`, `revoked`.
- Expiration: `expires_at`.
- One-time use: `status`, `used_at`.
- Attempt limits: `attempt_count`, `max_attempts`, and `CHECK (attempt_count <= max_attempts)`.
- Rate limiting: `rate_limit_key`, `requested_at`, `request_ip_hash`, plus index on `(rate_limit_key, purpose, requested_at)`.
- OTP codes are stored as `code_hash`, never plaintext.
- Registration OTPs use `purpose = 'phone_verification'` and store temporary onboarding payload in `registration_payload_json` until successful one-time verification creates the user/resident records.

### `sessions`

Stores later application sessions.

- Relationships: `sessions.user_id -> users.id`.
- Status values: `active`, `expired`, `revoked`.
- Expiration: `expires_at`.
- Revocation: `revoked_at`, `revocation_reason`.
- Unique constraints: `session_token_hash`.
- Session tokens are stored as hashes, never plaintext.

### `audit_logs`

Stores append-only operational audit events.

- Relationships may point to actor user and actor staff.
- Required fields: `action`, `entity_type`, `created_at`.
- Entity reference: `entity_type`, `entity_id`.
- Optional context: `metadata_json`, `ip_hash`, `user_agent`.
- Actor deletion uses `ON DELETE SET NULL` so historical logs remain.
- Audit logs are read-only operational/security history in the Admin Portal.
- The read API joins current actor display name, staff code, and role where available while preserving stored actor IDs for historical integrity.
- Supported read filters include search, actor user ID, actor staff ID, action, entity type, and created-at date range.
- API responses redact sensitive metadata keys such as passwords, password hashes, temporary passwords, session tokens, OTP values, authorization headers, secrets, API keys, Cloudflare tokens, SMS secrets, and storage secrets. Historical rows are not rewritten.
- No schema migration was required for the Phase 10M audit viewer.

## Important Indexes

- `idx_one_active_academic_session`: only one active academic session.
- `idx_applications_one_active_per_resident_session`: prevents duplicate active applications.
- `idx_bookings_one_active_per_resident_session`: prevents duplicate pending/confirmed bookings.
- `idx_bookings_priced_room`: supports booking financial-basis checks by priced room.
- `idx_bookings_priced_room_rate`: supports booking financial-basis checks by original room-rate row.
- `idx_allocations_one_active_bed`: prevents more than one active allocation per bed.
- `idx_allocations_one_active_resident_session`: prevents more than one active allocation per resident/session.
- `idx_room_rates_one_active_per_room_session`: prevents more than one active room rate per room/session.
- `idx_announcements_status_severity` and `idx_announcements_current`: support admin/public announcement filtering by lifecycle, severity, and current scheduling.
- `idx_announcement_channels_lookup`: supports portal/public channel visibility checks.
- `idx_announcement_delivery_announcement`: supports external delivery summaries by announcement/channel/status.
- `idx_messages_status_target` and `idx_messages_sent_at`: support admin messaging list filters.
- `idx_message_channels_message`: supports message channel filtering.
- `idx_message_snapshots_message`: supports message detail recipient summaries.
- `idx_message_delivery_summary`: supports delivery summaries by channel/status.
- `idx_portal_message_user_status`: supports future resident portal inbox unread/read lookups.
- Lookup indexes cover status, session, room/bed, resident/payment, OTP rate limiting, sessions, and audit queries.

## Verification

Schema verification SQL lives in:

```text
cloudflare/tests/schema-verification.sql
```

It covers:

- resident creation
- room creation
- multiple beds per room
- room rate creation
- application creation
- booking creation
- bed allocation
- payment creation
- receipt creation
- document metadata creation
- maintenance request creation
- announcement creation
- OTP record creation
- session creation
- audit log creation

Constraint failure checks live in separate files because they are expected to fail:

```text
cloudflare/tests/constraint-duplicate-active-booking.sql
cloudflare/tests/constraint-duplicate-active-allocation.sql
cloudflare/tests/constraint-duplicate-room-rate.sql
cloudflare/tests/constraint-invalid-money.sql
cloudflare/tests/constraint-invalid-foreign-key.sql
```
