import { describe, expect, it, beforeAll } from "vitest";
import app from "../index";
import { createTestEnv } from "../../tests/helpers/minid1";
import { mockSms } from "../services/sms.service";
import { hashOtp } from "./crypto";

let env: { DB: D1Database; DOCUMENTS: R2Bucket; ENVIRONMENT?: string };

async function json(path: string, init: RequestInit = {}) {
  const res = await app.fetch(new Request(`http://localhost${path}`, init), env);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

describe("auth", () => {
  beforeAll(async () => {
    env = (await createTestEnv()).env;
  });

  it("logs in valid staff", async () => {
    const res = await json("/auth/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "admin", password: "KissmetAdmin123!" }),
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe("super_admin");
  });

  it("rejects invalid password", async () => {
    const res = await json("/auth/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "admin", password: "nope-nope-nope" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects inactive staff", async () => {
    await env.DB.prepare(`UPDATE staff SET status = 'inactive' WHERE id = 1`).run();
    const res = await json("/auth/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "admin", password: "KissmetAdmin123!" }),
    });
    expect(res.status).toBe(401);
    await env.DB.prepare(`UPDATE staff SET status = 'active' WHERE id = 1`).run();
  });

  it("rate limits staff login", async () => {
    let last = 0;
    for (let i = 0; i < 10; i += 1) {
      const res = await json("/auth/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: "unknown-user-xyz", password: "Password123!" }),
      });
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it("requests resident OTP generically", async () => {
    mockSms.sent.length = 0;
    const res = await json("/auth/resident/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionCode: "ug", studentId: "10938472" }),
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockSms.lastOtp()).toMatch(/^\d{6}$/);
  });

  it("accepts the correct OTP", async () => {
    mockSms.sent.length = 0;
    await json("/auth/resident/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionCode: "ug", studentId: "10938472" }),
    });
    const otp = mockSms.lastOtp();
    const res = await json("/auth/resident/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionCode: "ug", studentId: "10938472", otp }),
    });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("resident");
  });

  it("rejects incorrect OTP", async () => {
    await json("/auth/resident/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionCode: "ug", studentId: "10938473" }),
    });
    const res = await json("/auth/resident/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionCode: "ug", studentId: "10938473", otp: "000000" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects expired OTP", async () => {
    const hash = await hashOtp("654321");
    await env.DB.prepare(
      `INSERT INTO otp_codes (user_id, resident_id, purpose, code_hash, status, expires_at, attempt_count, max_attempts, rate_limit_key)
       VALUES (3, 2, 'resident_login', ?, 'pending', '2000-01-01T00:00:00.000Z', 0, 5, 'expired-test')`,
    ).bind(hash).run();
    const res = await json("/auth/resident/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionCode: "ug", studentId: "10938473", otp: "654321" }),
    });
    expect(res.status).toBe(401);
  });

  it("enforces OTP attempt limit", async () => {
    mockSms.sent.length = 0;
    await json("/auth/resident/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionCode: "ug", studentId: "10938474" }),
    });
    let last = 0;
    for (let i = 0; i < 5; i += 1) {
      const res = await json("/auth/resident/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionCode: "ug", studentId: "10938474", otp: "111111" }),
      });
      last = res.status;
    }
    expect(last).toBe(401);
  });

  it("rejects OTP reuse", async () => {
    mockSms.sent.length = 0;
    await json("/auth/resident/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionCode: "ug", studentId: "10938472" }),
    });
    const otp = mockSms.lastOtp();
    const first = await json("/auth/resident/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionCode: "ug", studentId: "10938472", otp }),
    });
    expect(first.status).toBe(200);
    const second = await json("/auth/resident/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionCode: "ug", studentId: "10938472", otp }),
    });
    expect(second.status).toBe(401);
  });

  it("returns a valid session on /auth/me and revokes on logout", async () => {
    const login = await json("/auth/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "admin@kissmetgroup.org", password: "KissmetAdmin123!" }),
    });
    const headers = { Authorization: `Bearer ${login.body.token}` };
    const me = await json("/auth/me", { headers });
    expect(me.status).toBe(200);
    const out = await json("/auth/logout", { method: "POST", headers });
    expect(out.status).toBe(200);
    const after = await json("/auth/me", { headers });
    expect(after.status).toBe(401);
  });

  it("rejects unauthorized admin routes", async () => {
    const res = await json("/admin/residents");
    expect(res.status).toBe(401);
  });

  it("rejects role-restricted routes", async () => {
    mockSms.sent.length = 0;
    await json("/auth/resident/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionCode: "ug", studentId: "10938472" }),
    });
    const otp = mockSms.lastOtp();
    const login = await json("/auth/resident/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionCode: "ug", studentId: "10938472", otp }),
    });
    const res = await json("/admin/residents", { headers: { Authorization: `Bearer ${login.body.token}` } });
    expect(res.status).toBe(403);
  });
});
