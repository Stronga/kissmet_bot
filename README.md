# Kissmet Hostel

Local v1 of the Kissmet Hostel Management Portal. Canonical specs live in `docs/`.

Canonical journey stays distinct: Registration → OTP → Application → Review/Approval → Booking → Payment → Manual Booking Confirmation → Explicit Bed Allocation → Stay.

Locked rules: approval does not book or allocate; payment verification does not confirm; confirmation does not allocate; occupancy is active allocations over usable beds; captured booking totals are immutable.

## Layout

- `cloudflare/` — Worker API on port 8787
- `admin-frontend/` — Admin portal on port 5173
- `resident-frontend/` — Resident portal on port 5174 (responsive web app; full viewport on desktop)
- `docs/` — canonical specifications

## Seed Super Admin

- Username: `admin`
- Email: `admin@kissmetgroup.org`
- Password: see the first comment in `cloudflare/seeds/development.sql`

Do not use seed data in production.

Resident demo login: institution `ug`, student ID `10938472`. Mock SMS prints the OTP to the API console.

## Local run

From the repo root:

```bash
cd cloudflare
npm install
npm run migrate:local
npm run seed:local
npm run dev
```

In another terminal:

```bash
cd admin-frontend
cp .env.example .env
npm install
npm run dev
```

In a third terminal:

```bash
cd resident-frontend
cp .env.example .env
npm install
npm run dev
```

Admin: http://localhost:5173  
Resident: http://localhost:5174  
API: http://localhost:8787

## Tests

```bash
cd cloudflare && npm run typecheck && npm test && npm run db:verify:local
cd admin-frontend && npm run typecheck && npm test
cd resident-frontend && npm run typecheck && npm test
```

Constraint SQL under `cloudflare/tests/constraint-*.sql` is expected to fail (covered by vitest).

## Notes

- Money uses integer minor units (`GHS 2500.00` = `250000`).
- Public refs are `KSM-RES` / `KSM-APP` / `KSM-BKG` / `KSM-PAY` / `KSM-RCP` / `KSM-MNT` from sequences, not row IDs.
- Private files stream through authenticated routes.
- `wrangler.toml` D1 id is a local placeholder, not a Cloudflare account id.
- Wrangler is pinned to 4.19.2 because newer 4.x releases require Node 22.
