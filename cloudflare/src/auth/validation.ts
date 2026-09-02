import { fail } from "../lib/http";

export function requireString(value: unknown, field: string, min = 1, max = 200): string {
  if (typeof value !== "string") fail(400, "invalid_input", `${field} is required`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    fail(400, "invalid_input", `${field} must be between ${min} and ${max} characters`);
  }
  return trimmed;
}

export function optionalString(value: unknown, field: string, max = 2000): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") fail(400, "invalid_input", `${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) fail(400, "invalid_input", `${field} is too long`);
  return trimmed;
}

export function requirePositiveInt(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) fail(400, "invalid_input", `${field} must be a positive integer`);
  return n;
}

export function requireInt(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n)) fail(400, "invalid_input", `${field} must be an integer`);
  return n;
}

export function requireOtp(value: unknown): string {
  const otp = requireString(value, "otp", 6, 6);
  if (!/^\d{6}$/.test(otp)) fail(400, "invalid_input", "otp must be a 6-digit code");
  return otp;
}
