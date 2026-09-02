import { beforeAll, describe, expect, it } from "vitest";
import app from "../index";
import { createTestEnv } from "../../tests/helpers/minid1";
import { mockSms } from "./sms.service";

let env: { DB: D1Database; DOCUMENTS: R2Bucket; ENVIRONMENT?: string };
let token = "";

async function json(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await app.fetch(new Request(`http://localhost${path}`, { ...init, headers }), env);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

describe("locked business rules", () => {
  beforeAll(async () => {
    env = (await createTestEnv()).env;
    const login = await json("/auth/staff/login", {
      method: "POST",
      body: JSON.stringify({ identifier: "admin", password: "KissmetAdmin123!" }),
    });
    token = login.body.token;
  });

  it("approval does not create a booking or allocate a bed", async () => {
    mockSms.sent.length = 0;
    await json("/auth/resident/request-otp", {
      method: "POST",
      body: JSON.stringify({ institutionCode: "ug", studentId: "10938472" }),
    });
    const otp = mockSms.lastOtp();
    const residentLogin = await app.fetch(
      new Request("http://localhost/auth/resident/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionCode: "ug", studentId: "10938472", otp }),
      }),
      env,
    );
    const residentBody = await residentLogin.json() as { token: string };
    const residentHeaders = { Authorization: `Bearer ${residentBody.token}`, "Content-Type": "application/json" };

    await app.fetch(new Request("http://localhost/resident/documents", {
      method: "POST",
      headers: { Authorization: residentHeaders.Authorization },
      body: (() => {
        const form = new FormData();
        form.set("documentType", "student_card");
        form.set("file", new File([new Uint8Array([1, 2, 3, 4])], "card.png", { type: "image/png" }));
        return form;
      })(),
    }), env);
    await app.fetch(new Request("http://localhost/resident/documents", {
      method: "POST",
      headers: { Authorization: residentHeaders.Authorization },
      body: (() => {
        const form = new FormData();
        form.set("documentType", "ghana_card");
        form.set("file", new File([new Uint8Array([1, 2, 3, 4])], "ghana.png", { type: "image/png" }));
        return form;
      })(),
    }), env);

    const appCreate = await app.fetch(new Request("http://localhost/resident/applications", {
      method: "POST",
      headers: residentHeaders,
      body: "{}",
    }), env);
    const application = await appCreate.json() as { id: number };
    await app.fetch(new Request(`http://localhost/resident/applications/${application.id}/submit`, {
      method: "POST",
      headers: residentHeaders,
    }), env);
    await json(`/admin/applications/${application.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "under_review" }) });
    const approved = await json(`/admin/applications/${application.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) });
    expect(approved.status).toBe(200);

    const bookings = await json("/admin/bookings");
    expect(bookings.body.items.filter((b: { application_id: number }) => b.application_id === application.id)).toHaveLength(0);
    const allocations = await json("/admin/allocations");
    expect(allocations.body.items.filter((a: { resident_id: number }) => a.resident_id === 1)).toHaveLength(0);

    const booking = await json("/admin/bookings", { method: "POST", body: JSON.stringify({ applicationId: application.id, roomId: 1 }) });
    expect(booking.status).toBe(201);
    expect(booking.body.total_amount_minor).toBe(250000);
    const captured = booking.body.total_amount_minor;

    await env.DB.prepare(`UPDATE room_rates SET amount_minor = 999999 WHERE id = 1`).run();
    const reloaded = await json(`/admin/bookings/${booking.body.id}`);
    expect(reloaded.body.total_amount_minor).toBe(captured);

    const payment = await json("/admin/payments", {
      method: "POST",
      body: JSON.stringify({ bookingId: booking.body.id, residentId: 1, amountMinor: 250000, currency: "GHS", method: "mobile_money" }),
    });
    expect(payment.status).toBe(201);
    await json(`/admin/payments/${payment.body.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "submitted" }) });
    const verified = await json(`/admin/payments/${payment.body.id}/verify`, { method: "POST" });
    expect(verified.status).toBe(200);
    const stillPending = await json(`/admin/bookings/${booking.body.id}`);
    expect(stillPending.body.status).toBe("pending");

    const over = await json("/admin/payments", {
      method: "POST",
      body: JSON.stringify({ bookingId: booking.body.id, residentId: 1, amountMinor: 100, currency: "GHS", method: "cash" }),
    });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe("overpayment");

    const confirmed = await json(`/admin/bookings/${booking.body.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) });
    expect(confirmed.status).toBe(200);
    const allocAfterConfirm = await json("/admin/allocations");
    expect(allocAfterConfirm.body.items.filter((a: { booking_id: number }) => a.booking_id === booking.body.id)).toHaveLength(0);

    const occupancyBefore = await json("/admin/dashboard/occupancy");
    expect(occupancyBefore.body.occupiedBeds).toBe(0);

    const allocated = await json("/admin/allocations", {
      method: "POST",
      body: JSON.stringify({
        bookingId: booking.body.id,
        residentId: 1,
        academicSessionId: 1,
        bedId: 1,
        startsOn: "2026-09-01",
      }),
    });
    expect(allocated.status).toBe(201);
    const occupancyAfter = await json("/admin/dashboard/occupancy");
    expect(occupancyAfter.body.occupiedBeds).toBe(1);
    expect(occupancyAfter.body.usableBeds).toBeGreaterThan(0);
    expect(occupancyAfter.body.occupancyPercent).toBe(
      Math.round((occupancyAfter.body.occupiedBeds * 10000) / occupancyAfter.body.usableBeds) / 100,
    );

    const emptyTargets = await json("/admin/messages/preview", {
      method: "POST",
      body: JSON.stringify({ targetType: "selected_residents", targetConfig: { residentIds: [] } }),
    });
    expect(emptyTargets.status).toBe(400);
    expect(emptyTargets.body.error.code).toBe("empty_targets");
  });
});
