import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireString, requireOtp, requirePositiveInt, optionalString } from "../auth/validation";
import { requireAuth } from "../middleware/auth.middleware";
import {
  listPublicInstitutions,
  logout,
  publicAuth,
  requestRegistrationOtp,
  requestResidentOtp,
  staffLogin,
  verifyRegistrationOtp,
  verifyResidentOtp,
} from "../services/auth.service";
import { sha256Hex } from "../auth/crypto";

export const authRoutes = new Hono<AppEnv>();

async function requestMeta(c: { req: { header: (n: string) => string | undefined } }) {
  const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "local";
  return {
    ipHash: await sha256Hex(ip),
    userAgent: c.req.header("user-agent") ?? undefined,
  };
}

authRoutes.post("/staff/login", async (c) => {
  const body = await c.req.json();
  const identifier = requireString(body.identifier, "identifier");
  const password = requireString(body.password, "password", 8, 200);
  const result = await staffLogin(c.env.DB, identifier, password, await requestMeta(c));
  return c.json(result);
});

authRoutes.post("/resident/request-otp", async (c) => {
  const body = await c.req.json();
  const institutionCode = requireString(body.institutionCode, "institutionCode");
  const studentId = requireString(body.studentId, "studentId");
  const result = await requestResidentOtp(c.env.DB, institutionCode, studentId, await requestMeta(c));
  return c.json(result);
});

authRoutes.post("/resident/verify-otp", async (c) => {
  const body = await c.req.json();
  const result = await verifyResidentOtp(
    c.env.DB,
    requireString(body.institutionCode, "institutionCode"),
    requireString(body.studentId, "studentId"),
    requireOtp(body.otp),
    await requestMeta(c),
  );
  return c.json(result);
});

authRoutes.post("/register/request-otp", async (c) => {
  const body = await c.req.json();
  const gender = requireString(body.gender, "gender");
  if (!["female", "male", "other"].includes(gender)) {
    return c.json({ error: { code: "invalid_input", message: "gender must be female, male, or other" } }, 400);
  }
  const result = await requestRegistrationOtp(
    c.env.DB,
    {
      firstName: requireString(body.firstName, "firstName"),
      lastName: requireString(body.lastName, "lastName"),
      middleName: optionalString(body.middleName, "middleName"),
      gender: gender as "female" | "male" | "other",
      phone: requireString(body.phone, "phone"),
      email: optionalString(body.email, "email"),
      institutionId: requirePositiveInt(body.institutionId, "institutionId"),
      studentId: requireString(body.studentId, "studentId"),
      dateOfBirth: optionalString(body.dateOfBirth, "dateOfBirth"),
    },
    await requestMeta(c),
  );
  return c.json(result);
});

authRoutes.post("/register/verify-otp", async (c) => {
  const body = await c.req.json();
  const result = await verifyRegistrationOtp(
    c.env.DB,
    requireString(body.phone, "phone"),
    requireOtp(body.otp),
    await requestMeta(c),
  );
  return c.json(result);
});

authRoutes.post("/logout", requireAuth, async (c) => {
  await logout(c.env.DB, c.get("auth")!);
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, (c) => c.json({ user: publicAuth(c.get("auth")!) }));

export const publicRoutes = new Hono<AppEnv>();
publicRoutes.get("/institutions", async (c) => {
  const items = await listPublicInstitutions(c.env.DB);
  return c.json({ items });
});
