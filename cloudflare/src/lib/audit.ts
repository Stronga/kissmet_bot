import type { AuthUser } from "../env";
import { run } from "./db";

const SENSITIVE_KEY =
  /(password|password_hash|temporary_password|token|session_token|otp|otp_hash|authorization|secret|api_key|cloudflare_token|sms_secret|storage_secret)/i;

export function redactMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactMetadata);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : redactMetadata(v);
    }
    return out;
  }
  return value;
}

export async function writeAudit(
  db: D1Database,
  input: {
    actor?: AuthUser | null;
    action: string;
    entityType: string;
    entityId?: number | null;
    metadata?: unknown;
    ipHash?: string | null;
    userAgent?: string | null;
  },
) {
  await run(
    db,
    `INSERT INTO audit_logs (actor_user_id, actor_staff_id, action, entity_type, entity_id, metadata_json, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    input.actor?.userId ?? null,
    input.actor?.staffId ?? null,
    input.action,
    input.entityType,
    input.entityId ?? null,
    input.metadata ? JSON.stringify(input.metadata) : null,
    input.ipHash ?? null,
    input.userAgent ?? null,
  );
}
