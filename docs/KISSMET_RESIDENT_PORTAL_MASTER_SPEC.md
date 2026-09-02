# KISSMET HOSTEL --- RESIDENT PORTAL MASTER SPECIFICATION

**Document role:** Canonical source of truth for the Resident Portal\
**Project:** Kissmet Hostel Management Portal\
**Organization:** Kissmet Group\
**Domain:** kissmetgroup.org\
**Resident Portal:** portal.kissmetgroup.org\
**API:** api.kissmetgroup.org\
**Target scale:** One hostel, fewer than 20 rooms\
**Status:** Resident backend foundation exists; Resident Portal UI is
the next major implementation phase

------------------------------------------------------------------------

# 1. Purpose

This document defines the intended Resident Portal for Kissmet Hostel.

It should be detailed enough for a developer or AI coding model to build
the Resident Portal from scratch while remaining compatible with the
existing Kissmet backend and the locked business rules already
established for the Admin Portal.

The Resident Portal is **not a smaller Admin Portal**.

Its purpose is to give applicants and residents a simple self-service
experience for:

-   registration
-   OTP authentication
-   profile and identity verification
-   hostel applications
-   booking visibility
-   payment submission/history
-   receipts
-   room/bed placement
-   maintenance requests
-   announcements
-   private portal messages
-   account/session access

When this specification conflicts with implementation details, use this
priority:

1.  `KISSMET_HOSTEL_SYSTEM_MASTER_SPEC.md`
2.  this Resident Portal specification
3.  `DATABASE_SCHEMA.md`
4.  `AUTHENTICATION.md`
5.  backend migrations/tests/current production code

The backend remains authoritative.

------------------------------------------------------------------------

# 2. Resident Portal Vision

The Resident Portal should feel like a modern student accommodation
portal rather than an administrative database.

The resident should immediately understand:

**Where am I in the hostel process, what do I need to do next, and what
has Kissmet already approved?**

The interface should reduce confusion around application, payment,
booking, and room allocation.

The primary resident journey is:

**Create Account → Verify Phone → Complete Profile → Upload Required
Documents → Submit Application → Wait for Review → Application Approved
→ Booking Created → Make/Submit Payment → Payment Verified → Booking
Confirmed → Bed Allocated → Manage Stay**

These stages must remain distinct.

The UI should never imply:

-   that an approved application means a room has already been allocated
-   that a payment submission means payment has been verified
-   that a verified payment automatically means the booking is confirmed
-   that a confirmed booking means a bed has already been assigned

------------------------------------------------------------------------

# 3. Product Principles

## 3.1 Mobile first

Most residents are expected to access the portal from phones.

Design mobile first, then adapt to tablet and desktop.

Important actions must remain easy to complete on a small screen.

## 3.2 Plain language

Residents should not need to understand internal hostel terminology.

Prefer:

-   **Application under review**
-   **Payment awaiting verification**
-   **Booking confirmed**
-   **Room assignment pending**

over exposing raw backend terminology without explanation.

## 3.3 Clear next action

Every major state should answer:

**What should I do next?**

Examples:

-   Complete your profile
-   Upload Student Card
-   Upload Ghana Card
-   Submit application
-   Wait for application review
-   Make payment
-   Upload payment slip
-   Wait for payment verification
-   Wait for booking confirmation
-   Wait for room assignment
-   View your room

## 3.4 Honest status

Never manufacture progress.

If something has not happened, say so.

Example:

> Your booking is confirmed. A bed has not yet been assigned.

Do not display a fake room merely because a booking exists.

## 3.5 Backend authority

All ownership, workflow, payment, booking, document, and allocation
rules are enforced by the backend.

Frontend validation is for usability only.

------------------------------------------------------------------------

# 4. Resident Types / Portal States

The portal must work for users at different lifecycle stages.

## New Applicant

Has not yet created a Kissmet resident account.

Primary actions:

-   register
-   verify phone

## Applicant

Account exists but hostel admission/application process is incomplete or
pending.

Primary actions may include:

-   complete profile
-   upload documents
-   create application
-   submit application
-   monitor review

## Approved Applicant

Application is approved.

Primary actions:

-   view approval
-   view booking when created
-   follow payment instructions

## Booked Applicant

Booking exists.

Primary actions:

-   view captured hostel fee
-   make/submit payment
-   monitor verification
-   view booking status

## Confirmed Resident Awaiting Allocation

Booking is confirmed but no active allocation exists.

Primary message:

**Booking confirmed --- room assignment pending.**

## Allocated Resident

Has an active bed allocation.

Primary actions:

-   view room and bed
-   view hostel information
-   create maintenance request
-   view messages and announcements
-   view payment/receipt history

## Past / Suspended / Archived Resident

Portal behavior should respect backend account/resident status.

Do not invent access beyond the authentication and status rules defined
by the backend.

------------------------------------------------------------------------

# 5. Authentication Experience

The Resident Portal does not use resident-code/password login as its
normal authentication flow.

Existing residents log in using:

-   institution
-   student ID
-   OTP sent to registered phone

The interface should therefore provide separate entry points:

**Log In**

and

**New Applicant / Register**

------------------------------------------------------------------------

# 6. Registration Flow

Recommended registration journey:

## Step 1 --- Start Registration

Collect only the information required by the backend registration
contract.

This includes the resident's identity/contact/institution information
required for account creation.

The frontend must not ask for unnecessary sensitive data.

## Step 2 --- Institution and Student ID

Resident selects institution and enters student ID.

Institution choices come from the backend's public/eligible institution
data.

Student ID uniqueness is scoped to the institution.

## Step 3 --- Phone Verification

The backend sends an OTP to the submitted phone.

UI should show a masked destination where supported.

Example:

**We sent a verification code to +233•••••1234.**

## Step 4 --- Enter OTP

Provide:

-   OTP field
-   Verify button
-   resend control when allowed
-   expiry/resend messaging

Never expose backend OTP hashes or internal OTP data.

## Step 5 --- Account Creation

Only after successful OTP verification should the permanent
resident/user account be created according to backend rules.

The resident receives their Kissmet resident code after creation.

The code may be shown in profile/account information, but it is not the
normal login credential.

------------------------------------------------------------------------

# 7. Login Flow

Login screen should contain:

-   Institution
-   Student ID
-   Continue / Send OTP

After valid identification:

-   show OTP verification screen
-   verify OTP
-   establish resident session
-   redirect to dashboard

Do not reveal whether unrelated residents exist through overly specific
authentication errors.

Resident sessions use the backend's bearer-session mechanism.

Logout revokes the session.

------------------------------------------------------------------------

# 8. Resident Portal Information Architecture

Recommended primary navigation:

``` text
Home
Application
Booking
Payments
My Room
Maintenance
Messages
Announcements
Profile
```

Receipts may live inside Payments rather than requiring a permanent
top-level navigation item.

On mobile, use a compact bottom navigation for the most important
destinations plus a More/Menu area.

Suggested bottom navigation:

``` text
Home
Application
Payments
My Room
More
```

The More area can expose:

-   Booking
-   Maintenance
-   Messages
-   Announcements
-   Profile
-   Logout

Navigation should adapt to the resident's lifecycle.

For example, My Room may show **Not assigned yet** rather than
disappearing entirely.

------------------------------------------------------------------------

# 9. Resident Dashboard / Home

The dashboard is the most important Resident Portal screen.

It should answer:

1.  What is my current status?
2.  What do I need to do next?
3.  Is there anything requiring my attention?
4.  What is my current booking/payment/room state?

Recommended structure:

## Welcome Header

Example:

**Welcome, Ama**

Below:

-   Resident code
-   Institution
-   current resident/application state

## Progress / Journey Card

Display the resident journey as understandable milestones:

``` text
Account
Documents
Application
Booking
Payment
Confirmation
Room Assignment
```

Each milestone may be:

-   Complete
-   Current
-   Waiting
-   Not started
-   Attention required

The progress indicator is informational only.

It must derive from real backend state.

## Next Action Card

Prominent card showing the single most important next step.

Examples:

**Upload your Student Card**

**Submit your application**

**Your application is under review**

**Payment required: GHS 2,500.00**

**Payment submitted --- awaiting verification**

**Booking confirmed --- room assignment pending**

**You have been assigned Room 101, Bed A**

## Quick Summary

Possible cards:

-   Application
-   Booking
-   Payment
-   Room

Each should link to its detailed section.

## Notices

Show important published resident announcements and unread portal
messages.

------------------------------------------------------------------------

# 10. Profile

The Profile page should show the resident's known identity/account
information.

Possible sections:

## Personal Information

-   name
-   phone
-   email where present
-   resident code

## Academic Identity

-   institution
-   student ID

## Hostel Status

-   resident lifecycle status
-   current academic session where applicable

## Documents

-   Student Card
-   Ghana Card
-   other permitted identity/supporting documents

Each document should show an understandable status such as:

-   Not uploaded
-   Uploaded
-   Awaiting verification
-   Verified
-   Rejected

Where the backend provides a rejection reason, show it safely.

------------------------------------------------------------------------

# 11. Profile Editing

Only expose fields that the backend permits residents to update.

Do not create frontend-only editable fields that cannot be persisted.

Sensitive identity changes should follow backend restrictions.

If institution/student ID cannot be edited after verification, display
them as read-only.

Phone-number changes must not bypass OTP/security rules.

------------------------------------------------------------------------

# 12. Identity Documents

Required application documents currently include:

-   Student Card
-   Ghana Card

Files are private.

Supported upload formats follow backend rules:

-   PDF
-   JPEG
-   PNG
-   WebP

Maximum file size:

**5 MB**

The Resident Portal should clearly show upload requirements before file
selection.

Example:

**PDF, JPG, PNG or WebP --- maximum 5 MB**

After upload, show document state.

Do not expose R2 object keys or public storage URLs.

Document access must use authenticated backend access.

------------------------------------------------------------------------

# 13. Application Experience

The Application section should present the hostel application as a clear
workflow.

## No Application

Show:

**You have not started an application for the current academic
session.**

CTA:

**Start Application**

## Draft

Show:

-   application number if already allocated
-   academic session
-   creation date
-   required documents
-   readiness checklist
-   notes where applicable

CTA:

**Submit Application**

only when backend requirements are satisfied.

## Submitted

Show:

**Application submitted**

and explain that Kissmet staff will review it.

The resident should not be able to edit administrative decision fields.

## Under Review

Show:

**Your application is being reviewed.**

Avoid giving an artificial completion date unless the hostel explicitly
provides one.

## Approved

Show approval prominently.

Example:

**Application approved**

Then explain:

**Approval allows the booking process to continue. It does not mean a
bed has been assigned yet.**

## Rejected

Show:

**Application not approved**

If a resident-visible reason exists, display it.

Do not expose private staff notes that are not intended for residents.

## Cancelled / Archived

Show historical status clearly.

------------------------------------------------------------------------

# 14. Booking Experience

The Booking page is separate from the Application page.

A booking should show:

-   booking number
-   academic session
-   priced room/category where appropriate
-   captured amount
-   currency
-   booking status
-   payment progress
-   payment-attention state where relevant

Important:

The displayed amount must use the booking's captured total.

Do not recalculate from the current room rate.

## Pending Booking

Example:

**Booking pending**

**Total: GHS 2,500.00**

Then show the payment requirement.

## Confirmed Booking

Example:

**Booking confirmed**

If no allocation exists:

**Your booking is confirmed. Room assignment is still pending.**

## Cancelled / Expired / Completed / Archived

Display status and appropriate read-only history.

------------------------------------------------------------------------

# 15. Payment Experience

The Payments section should be simple and trustworthy.

Recommended summary:

-   Booking total
-   Verified payments
-   Pending/submitted payments
-   Outstanding balance
-   Confirmation requirement
-   Booking confirmation eligibility/status

All amounts must come from backend-calculated financial state.

Do not calculate financial truth independently in the browser beyond
formatting.

------------------------------------------------------------------------

# 16. Payment Instructions

For v1, automatic payment-gateway/Mobile Money collection is not
required unless separately added later.

The portal should support the hostel's current manual/offline payment
process.

A payment instructions card may contain admin-configured payment
directions when that capability is added.

Do not hardcode bank/Mobile Money account information into frontend
source code.

------------------------------------------------------------------------

# 17. Submit Payment / Upload Slip

Where the resident payment workflow permits submission, the portal
should allow the resident to provide the required payment details and
upload proof.

Display clear status after submission:

**Payment submitted --- awaiting verification**

Do not display **Paid** merely because a slip was uploaded.

The payment becomes financially verified only after staff verification.

Payment-slip files remain private in R2.

------------------------------------------------------------------------

# 18. Payment History

Show each resident-owned payment with:

-   payment reference
-   amount
-   method
-   submitted/created date
-   status
-   verification date where available
-   rejection/refund state where applicable

Statuses should be translated into understandable UI labels without
changing backend meaning.

Examples:

-   Pending
-   Awaiting verification
-   Verified
-   Rejected
-   Refunded
-   Cancelled

------------------------------------------------------------------------

# 19. Receipts

Verified payments may have receipts.

Residents should be able to view their own receipt information.

Recommended receipt display:

-   receipt number
-   payment reference
-   amount
-   payment method
-   issue date
-   status

Allow browser print/download behavior where supported.

A voided receipt must be clearly marked **Voided**.

Do not hide the underlying payment simply because its receipt was
voided.

------------------------------------------------------------------------

# 20. My Room / Allocation

The My Room section must use active allocation data.

Never infer a room from the booking alone.

## No Allocation

If booking is confirmed:

**Booking confirmed --- room assignment pending**

If booking is not confirmed:

explain the actual preceding state.

## Active Allocation

Show:

-   room code/name
-   bed code/label
-   academic session
-   assigned date
-   allocation status

Potential future hostel information may include floor/location guidance
where already stored.

Do not expose other residents assigned to the same room unless a future
privacy-reviewed feature explicitly allows it.

------------------------------------------------------------------------

# 21. Allocation History

If/when a resident-scoped allocation-history API is added, residents may
see previous assignments/transfers.

Until then, do not fabricate history from current allocation data.

Current active allocation remains the primary v1 requirement.

------------------------------------------------------------------------

# 22. Maintenance Requests

Residents should be able to report hostel issues from the portal.

CTA:

**Report an Issue**

Form should use backend-supported fields such as:

-   category
-   priority where resident selection is permitted
-   title/summary
-   description

When an active allocation exists, the backend should associate room/bed
context according to existing service rules.

The resident should not manually claim another resident's room or bed.

------------------------------------------------------------------------

# 23. Maintenance History

Show resident-owned requests with:

-   request number
-   category
-   priority
-   title
-   status
-   submitted date
-   updated/resolved information where available

Use understandable statuses:

-   Open
-   Assigned
-   In progress
-   Resolved
-   Closed
-   Cancelled

Residents should not receive staff-only maintenance controls.

------------------------------------------------------------------------

# 24. Announcements

Resident Portal announcements display published announcements intended
for residents/all audiences through the resident portal channel.

Recommended list:

-   title
-   severity
-   publish date
-   short body preview

Important/high-alert announcements should be visually distinguishable
without creating panic-oriented design.

Only currently valid published announcements should appear.

Do not expose draft, archived, expired, staff-only, or
public-website-only records unless backend rules explicitly include
them.

------------------------------------------------------------------------

# 25. Messages / Inbox

Private portal messages are separate from announcements.

The resident inbox should be backed by durable
`portal_message_deliveries`.

Recommended inbox:

``` text
Messages
  Unread
  All
```

Each item:

-   subject
-   short preview
-   sent date
-   read/unread state

Message detail:

-   subject
-   body
-   sent date
-   sender label where safely available

Opening a message should mark/read it only through the supported backend
mechanism.

Never show messages based only on current target membership.

The historical delivery record determines what the resident received.

------------------------------------------------------------------------

# 26. Notifications

The bell/notification experience may aggregate resident-visible events
such as:

-   new portal message
-   important announcement
-   application status change
-   payment verification result
-   booking confirmation
-   room assignment
-   maintenance update

Do not create a fake notification store if the backend does not yet
support a durable event.

For v1, the bell may primarily surface real unread portal
messages/announcements until broader notification infrastructure exists.

------------------------------------------------------------------------

# 27. Empty States

Every major page needs a useful empty state.

Examples:

### Application

**No application yet**

Start an application for the active academic session.

### Payments

**No payments yet**

Payment information will appear after a booking is created.

### My Room

**No room assigned yet**

Your room and bed will appear here after an allocation is made.

### Maintenance

**No maintenance requests**

You have not reported any hostel issues.

### Messages

**No messages**

Messages from Kissmet Hostel will appear here.

Empty states must explain the actual workflow rather than merely say "No
data."

------------------------------------------------------------------------

# 28. Error Handling

Resident-facing errors should be understandable.

Do not expose:

-   SQL
-   stack traces
-   internal IDs unnecessarily
-   Cloudflare implementation details
-   provider secrets
-   raw backend exception internals

Examples:

Instead of:

`SQLITE_CONSTRAINT`

show:

**We could not complete that request. Please try again.**

For a known workflow rule:

**Your application cannot be submitted until the required documents are
uploaded.**

Preserve enough backend error specificity to guide the resident safely.

------------------------------------------------------------------------

# 29. Loading and Network States

Mobile connections may be slow or unreliable.

Every data page should have:

-   loading state
-   retry state
-   safe empty state
-   submission-in-progress state

Prevent accidental duplicate submissions.

Disable action buttons while a mutation is pending.

Do not optimistically display irreversible workflow success before the
backend confirms it.

------------------------------------------------------------------------

# 30. Accessibility and Usability

Use:

-   semantic labels
-   keyboard-accessible controls
-   sufficient contrast
-   visible focus states
-   readable touch targets
-   clear error association
-   meaningful status text in addition to color

Do not rely on green/red alone to communicate state.

Forms should remain usable on common mobile viewport sizes.

------------------------------------------------------------------------

# 31. Visual Direction

The Resident Portal should visually belong to the same Kissmet system as
the Admin Portal but feel friendlier and simpler.

Recommended direction:

-   white/light neutral surfaces
-   Kissmet teal as primary accent
-   clean cards
-   minimal visual clutter
-   larger touch targets than Admin Portal
-   simpler language
-   status chips
-   prominent next-action card
-   clear payment amounts
-   clear progress journey

Avoid turning the resident experience into a dense admin table
interface.

Desktop may use a sidebar.

Mobile should use a compact header and bottom navigation/menu.

------------------------------------------------------------------------

# 32. Suggested Resident Routes

Recommended route structure:

``` text
/
 /login
 /register
 /verify-otp

 /home
 /profile
 /documents

 /application
 /application/:id

 /booking
 /payments
 /payments/:id
 /receipts/:id

 /room

 /maintenance
 /maintenance/new
 /maintenance/:id

 /messages
 /messages/:id

 /announcements
 /announcements/:id
```

Exact route nesting may vary, but domain boundaries should remain clear.

------------------------------------------------------------------------

# 33. Resident API Direction

Reuse existing resident/public/auth endpoints wherever they already
satisfy the requirement.

Do not create duplicate resident APIs merely because the frontend is
new.

Before implementing each screen:

1.  inspect existing route
2.  inspect request/response contract
3.  inspect ownership enforcement
4.  inspect tests
5.  identify only genuine API gaps
6.  add the smallest backend extension necessary
7.  add tests before considering the screen complete

All resident data access must be scoped by the authenticated resident on
the backend.

Never accept a resident ID from the browser as proof of ownership.

------------------------------------------------------------------------

# 34. Recommended Build Phases

## Phase R1 --- Resident Frontend Foundation

Build:

-   resident frontend app
-   routing
-   API client
-   auth/session provider
-   protected routes
-   responsive shell
-   mobile navigation
-   shared formatting/status components
-   error/loading patterns

No fake dashboard data.

## Phase R2 --- Registration and OTP

Build:

-   new applicant registration
-   institution selection
-   phone OTP request
-   OTP verification
-   successful account creation
-   resident login
-   logout/session restoration

Test invalid/expired OTP and ownership/security boundaries.

## Phase R3 --- Home and Profile

Build:

-   resident dashboard
-   journey/progress model derived from real state
-   next-action card
-   profile
-   institution/student identity
-   resident code
-   allowed profile editing

## Phase R4 --- Documents

Build:

-   Student Card upload
-   Ghana Card upload
-   document status
-   authenticated viewing where supported
-   replacement/re-upload behavior according to backend rules

Test file type/size/ownership/privacy.

## Phase R5 --- Applications

Build:

-   application list/current application
-   create draft
-   readiness checklist
-   submit
-   status timeline
-   approval/rejection display

Do not expose admin actions.

## Phase R6 --- Booking

Build:

-   booking detail
-   captured amount
-   priced room information where appropriate
-   booking lifecycle
-   clear distinction between booking and allocation

## Phase R7 --- Payments and Receipts

Build:

-   financial summary
-   payment history
-   supported payment submission
-   payment-slip upload
-   verification status
-   outstanding balance
-   receipt view/print

Do not mark submitted payments as verified.

## Phase R8 --- My Room

Build:

-   active allocation
-   room/bed details
-   pending-assignment state
-   allocation status

Do not infer placement from bookings.

## Phase R9 --- Maintenance

Build:

-   create resident request
-   request list
-   detail/status
-   active allocation context

## Phase R10 --- Announcements and Messages

Build:

-   resident announcements
-   message inbox
-   unread/read state
-   message detail
-   safe notification indicators

Use durable portal delivery data for private messages.

## Phase R11 --- Resident UX Hardening

Review:

-   mobile responsiveness
-   empty states
-   loading/retry
-   duplicate submission protection
-   accessibility
-   session expiry
-   unauthorized access
-   stale state refresh
-   workflow language

## Phase R12 --- End-to-End Validation

Test complete resident journeys:

``` text
register
-> OTP
-> profile/documents
-> application
-> staff review
-> booking
-> payment submission
-> staff verification
-> booking confirmation
-> allocation
-> resident sees room
-> maintenance/message/announcement use
```

------------------------------------------------------------------------

# 35. Dashboard State Logic

The dashboard should derive the next action from backend state.

Conceptually:

``` text
No resident account
    -> Register

Account exists but profile requirements incomplete
    -> Complete profile

Required documents missing
    -> Upload required documents

No application
    -> Start application

Application draft
    -> Complete and submit application

Application submitted/under_review
    -> Wait for review

Application rejected
    -> Show decision / permitted next action

Application approved, no booking
    -> Booking process pending/admin action

Booking pending, payment required
    -> Show payment requirement

Payment submitted but unverified
    -> Await payment verification

Verified amount below confirmation threshold
    -> Show remaining required amount

Threshold satisfied but booking pending
    -> Await booking confirmation

Booking confirmed, no allocation
    -> Room assignment pending

Active allocation
    -> Show room/bed
```

This is a presentation model only.

Do not implement a second independent workflow engine in the frontend.

------------------------------------------------------------------------

# 36. Security Rules

A Resident Portal implementation must never:

1.  trust a browser-supplied resident ID as authorization
2.  allow a resident to read another resident's profile
3.  allow a resident to read another resident's documents
4.  allow a resident to read another resident's application
5.  allow a resident to read another resident's booking/payment/receipt
6.  allow a resident to read another resident's allocation
7.  allow a resident to read another resident's maintenance requests
8.  expose raw recipient contact lists
9.  expose private R2 object URLs
10. expose Ghana Card data beyond authorized document access
11. expose OTP values/hashes
12. expose session token hashes
13. expose internal audit metadata
14. expose staff-only notes/actions
15. infer permissions from hidden frontend buttons

Ownership checks belong in backend routes/services.

------------------------------------------------------------------------

# 37. Financial Rules for Resident UI

The Resident Portal must preserve the same financial truth as Admin.

Use:

``` text
captured booking total
verified payment total
pending/submitted payment total
refunded total
outstanding balance
confirmation threshold
```

Do not:

-   use current room rate to replace booking total
-   count a submitted slip as verified money
-   treat a receipt as a payment calculation
-   silently remove refunded payments
-   claim booking confirmation before backend status is confirmed

Money is formatted from integer minor units.

------------------------------------------------------------------------

# 38. Privacy Rules

Resident Portal is a private authenticated portal.

Avoid exposing:

-   roommate identities
-   staff private details
-   other residents' data
-   private admin notes
-   internal audit logs
-   provider credentials
-   storage keys
-   internal system diagnostics

Only expose resident-owned or intentionally resident-public information.

------------------------------------------------------------------------

# 39. Communications Rules

Announcements and Messages remain distinct.

**Announcement:** broad notice.

**Message:** private targeted communication.

The Resident Portal should not merge them into one ambiguous feed.

A Home page may show previews from both, but their source/type must
remain clear.

SMS/email delivery is supplemental.

Portal records remain the durable in-app source for private messages.

------------------------------------------------------------------------

# 40. Production Considerations

Before Resident Portal production launch:

-   confirm OTP SMS provider
-   configure production SMS secrets
-   review OTP rate limiting and abuse controls
-   verify resident session expiry/revocation
-   verify CORS for `portal.kissmetgroup.org`
-   verify private R2 access
-   verify upload limits
-   verify all resident ownership checks
-   test slow/mobile network behavior
-   test session expiry during forms
-   test duplicate form/payment submission protection
-   test application/payment/allocation end-to-end
-   verify resident messages cannot leak across recipients

------------------------------------------------------------------------

# 41. Known Backend Gaps to Handle Carefully

Do not fabricate functionality for an API gap.

Known project limitations relevant to Resident Portal include:

-   no resident-scoped full allocation-history endpoint yet
-   no payment-scoped document list endpoint
-   live SMS/email providers are not connected
-   some stored branding settings are not dynamically applied
-   broader notification infrastructure is not yet established
-   some resident-facing API shapes may require small extensions as
    screens are implemented

For each gap, prefer the smallest backend extension that preserves
existing domain rules.

------------------------------------------------------------------------

# 42. Resident Portal Definition of Done

Resident Portal v1 is complete when a real applicant/resident can:

-   register
-   verify phone
-   log in using institution + student ID + OTP
-   view profile
-   upload required identity documents
-   create and submit an application
-   view application status
-   view approved booking and captured amount
-   understand payment requirements
-   submit supported payment information/proof
-   view payment verification status and outstanding balance
-   view receipts
-   distinguish confirmed booking from room allocation
-   view active room/bed once allocated
-   create/view maintenance requests
-   view resident announcements
-   receive/read private portal messages
-   log out safely

and when:

-   all resident ownership rules are enforced server-side
-   mobile experience is usable
-   financial values reconcile with Admin Portal
-   allocation state reconciles with Admin Portal
-   private files remain private
-   end-to-end workflow tests pass
-   production OTP/session/R2/CORS configuration is verified

------------------------------------------------------------------------

# 43. Rules for an AI Coding Model

When building the Resident Portal:

1.  Read the master system specification first.
2.  Inspect existing backend routes before adding APIs.
3.  Do not duplicate business logic in React.
4.  Never use booking status as room assignment.
5.  Never use application approval as booking/allocation.
6.  Never use payment submission as verification.
7.  Never use payment verification as automatic booking confirmation.
8.  Use captured booking totals, not current room rates.
9.  Use active allocations for My Room.
10. Keep announcements and private messages distinct.
11. Keep files private.
12. Enforce ownership on the backend.
13. Do not expose admin-only information.
14. Build mobile first.
15. Provide clear next-action messaging.
16. Do not fake unavailable data.
17. Add backend tests for every API extension.
18. Add frontend tests for workflow-critical states.
19. Validate each phase before moving to the next.
20. Update this specification when the Resident Portal vision or a
    locked workflow materially changes.

------------------------------------------------------------------------

# 44. Companion Documents

Use together:

``` text
KISSMET_HOSTEL_SYSTEM_MASTER_SPEC.md
KISSMET_RESIDENT_PORTAL_MASTER_SPEC.md
DATABASE_SCHEMA.md
AUTHENTICATION.md
ADMIN_FRONTEND.md
```

Document roles:

-   `KISSMET_HOSTEL_SYSTEM_MASTER_SPEC.md` --- entire system
    architecture and locked business rules.
-   `KISSMET_RESIDENT_PORTAL_MASTER_SPEC.md` --- resident experience, UI
    direction, implementation plan, and resident-specific constraints.
-   `DATABASE_SCHEMA.md` --- database source of truth.
-   `AUTHENTICATION.md` --- authentication/RBAC/security source of
    truth.
-   `ADMIN_FRONTEND.md` --- existing Admin Portal implementation
    reference.

------------------------------------------------------------------------

# 45. Final Product Vision

The Resident Portal should make hostel administration feel
straightforward to the student.

At any moment, the resident should be able to open the portal and
understand:

**My application status.**

**My booking status.**

**How much I need to pay.**

**Whether my payment has been verified.**

**Whether my booking has been confirmed.**

**Whether I have been assigned a room and bed.**

**What Kissmet needs from me next.**

That clarity is the central design goal of the Resident Portal.

------------------------------------------------------------------------

**End of Resident Portal Master Specification**
