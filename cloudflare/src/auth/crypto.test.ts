import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, hashSessionToken, generateOtp } from "./crypto";

describe("crypto", () => {
  it("hashes and verifies passwords with PBKDF2", async () => {
    const stored = await hashPassword("KissmetAdmin123!");
    expect(stored.startsWith("pbkdf2$sha256$210000$")).toBe(true);
    expect(await verifyPassword("KissmetAdmin123!", stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
  });

  it("verifies the development seed hash", async () => {
    const seed = "pbkdf2$sha256$210000$c0fe22a417bd3b885c3c83664e010e10$df8066f69e1a2ae92d9cee13964c940fa0d91beec3defff41671a7bfe65f3b6f";
    expect(await verifyPassword("KissmetAdmin123!", seed)).toBe(true);
  });

  it("hashes session tokens with SHA-256", async () => {
    const a = await hashSessionToken("abc");
    const b = await hashSessionToken("abc");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("generates 6-digit OTPs", () => {
    expect(generateOtp()).toMatch(/^\d{6}$/);
  });
});
