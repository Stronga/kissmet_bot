import type { AuthUser } from "../env";
import { writeAudit } from "../lib/audit";
import { one, run } from "../lib/db";
import { fail } from "../lib/http";
import { sha256Hex } from "../auth/crypto";
import { nowIso } from "../lib/time";

const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export function publicDocument(row: Record<string, unknown>) {
  return {
    id: row.id,
    residentId: row.resident_id,
    applicationId: row.application_id,
    bookingId: row.booking_id,
    paymentId: row.payment_id,
    receiptId: row.receipt_id,
    documentType: row.document_type,
    status: row.status,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    rejectionReason: row.rejection_reason,
  };
}

export async function storeDocument(
  db: D1Database,
  bucket: R2Bucket,
  actor: AuthUser,
  input: {
    file: File;
    residentId: number;
    documentType: string;
    applicationId?: number | null;
    bookingId?: number | null;
    paymentId?: number | null;
    receiptId?: number | null;
  },
) {
  if (!ALLOWED.has(input.file.type)) fail(400, "invalid_file_type", "Upload PDF, JPG, PNG, or WebP files only");
  if (input.file.size <= 0 || input.file.size > MAX_BYTES) fail(400, "file_too_large", "Maximum file size is 5 MB");
  if (input.paymentId) {
    const payment = await one<{ resident_id: number }>(db, `SELECT resident_id FROM payments WHERE id = ?`, input.paymentId);
    if (!payment || payment.resident_id !== input.residentId) fail(400, "ownership_mismatch", "Document must belong to the same resident as the payment");
  }
  if (input.applicationId) {
    const app = await one<{ resident_id: number }>(db, `SELECT resident_id FROM applications WHERE id = ?`, input.applicationId);
    if (!app || app.resident_id !== input.residentId) fail(400, "ownership_mismatch", "Document must belong to the same resident as the application");
  }
  if (input.receiptId) {
    const receipt = await one<{ resident_id: number }>(
      db,
      `SELECT p.resident_id FROM receipts r JOIN payments p ON p.id = r.payment_id WHERE r.id = ?`,
      input.receiptId,
    );
    if (!receipt || receipt.resident_id !== input.residentId) fail(400, "ownership_mismatch", "Document must belong to the same resident as the receipt");
  }
  const resident = await one<{ user_id: number }>(db, `SELECT user_id FROM residents WHERE id = ?`, input.residentId);
  if (!resident) fail(404, "not_found", "Resident not found");
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const checksum = await sha256Hex(Array.from(bytes).map((b) => String.fromCharCode(b)).join(""));
  const key = `residents/${input.residentId}/${input.documentType}/${crypto.randomUUID()}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: input.file.type } });
  const ins = await run(
    db,
    `INSERT INTO documents (
        owner_user_id, resident_id, application_id, booking_id, payment_id, receipt_id,
        document_type, status, r2_bucket, r2_key, original_filename, content_type, size_bytes, checksum_sha256
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded', 'kissmet-documents', ?, ?, ?, ?, ?)`,
    resident.user_id, input.residentId, input.applicationId ?? null, input.bookingId ?? null, input.paymentId ?? null,
    input.receiptId ?? null, input.documentType, key, input.file.name, input.file.type, input.file.size, checksum,
  );
  const id = Number(ins.meta.last_row_id);
  await writeAudit(db, { actor, action: "documents.uploaded", entityType: "document", entityId: id, metadata: { document_type: input.documentType } });
  const row = await one<Record<string, unknown>>(db, `SELECT * FROM documents WHERE id = ?`, id);
  return publicDocument(row!);
}

export async function streamDocument(
  db: D1Database,
  bucket: R2Bucket,
  actor: AuthUser,
  id: number,
) {
  const row = await one<{
    id: number;
    resident_id: number;
    owner_user_id: number;
    document_type: string;
    r2_key: string;
    content_type: string;
    original_filename: string;
    status: string;
  }>(db, `SELECT * FROM documents WHERE id = ?`, id);
  if (!row || row.status === "deleted") fail(404, "not_found", "Document not found");
  if (row.document_type === "ghana_card" && actor.userType === "staff" && !actor.permissions.includes("document:ghana_card")) {
    fail(403, "forbidden", "Ghana Card access is restricted");
  }
  if (actor.userType === "resident" && actor.residentId !== row.resident_id) {
    fail(403, "forbidden", "You cannot access this document");
  }
  const object = await bucket.get(row.r2_key);
  if (!object) fail(404, "not_found", "Document file is unavailable");
  await writeAudit(db, { actor, action: "documents.accessed", entityType: "document", entityId: id });
  return { object, contentType: row.content_type, filename: row.original_filename };
}

export async function verifyDocument(db: D1Database, actor: AuthUser, id: number, status: "verified" | "rejected", reason?: string | null) {
  const row = await one<{ id: number }>(db, `SELECT id FROM documents WHERE id = ?`, id);
  if (!row) fail(404, "not_found", "Document not found");
  await run(
    db,
    `UPDATE documents SET status = ?, verified_at = ?, verified_by_staff_id = ?, rejection_reason = ?, updated_at = ? WHERE id = ?`,
    status, nowIso(), actor.staffId, reason ?? null, nowIso(), id,
  );
  await writeAudit(db, { actor, action: `documents.${status}`, entityType: "document", entityId: id });
  return publicDocument((await one<Record<string, unknown>>(db, `SELECT * FROM documents WHERE id = ?`, id))!);
}
