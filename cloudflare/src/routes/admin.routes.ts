import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requirePermission, requireRole } from "../middleware/auth.middleware";
import { parseLimitOffset } from "../lib/http";
import { requirePositiveInt, requireString, optionalString } from "../auth/validation";
import * as catalog from "../services/catalog.service";
import * as workflow from "../services/workflow.service";
import * as operations from "../services/operations.service";
import * as admin from "../services/admin.service";
import * as documents from "../services/documents.service";
import { writeAudit } from "../lib/audit";

export const adminRoutes = new Hono<AppEnv>();

function q(c: { req: { query: (k: string) => string | undefined } }) {
  return {
    search: c.req.query("search") ?? "",
    ...parseLimitOffset({ limit: c.req.query("limit"), offset: c.req.query("offset") }),
  };
}

adminRoutes.get("/dashboard/overview", requirePermission("admin:read"), async (c) => c.json(await admin.dashboardOverview(c.env.DB)));
adminRoutes.get("/dashboard/occupancy", requirePermission("admin:read"), async (c) => c.json(await admin.dashboardOccupancy(c.env.DB)));
adminRoutes.get("/dashboard/finance", requirePermission("report:finance"), async (c) => c.json(await admin.dashboardFinance(c.env.DB)));
adminRoutes.get("/dashboard/applications", requirePermission("admin:read"), async (c) => c.json(await admin.dashboardApplications(c.env.DB)));
adminRoutes.get("/dashboard/maintenance", requirePermission("admin:read"), async (c) => c.json(await admin.dashboardMaintenance(c.env.DB)));
adminRoutes.get("/dashboard/announcements", requirePermission("announcement:read"), async (c) => c.json(await admin.dashboardAnnouncements(c.env.DB)));

adminRoutes.get("/institutions", requirePermission("admin:read"), async (c) => c.json({ items: await catalog.listInstitutions(c.env.DB) }));
adminRoutes.get("/academic-sessions", requirePermission("admin:read"), async (c) => c.json({ items: await catalog.listAcademicSessions(c.env.DB) }));

adminRoutes.get("/residents", requirePermission("resident:read"), async (c) => {
  const { search, limit, offset } = q(c);
  return c.json({ items: await catalog.listResidents(c.env.DB, search, limit, offset), limit, offset });
});
adminRoutes.post("/residents", requirePermission("resident:write"), async (c) => {
  const body = await c.req.json();
  return c.json(await catalog.createResident(c.env.DB, c.get("auth")!, body), 201);
});
adminRoutes.get("/residents/:id", requirePermission("resident:read"), async (c) => {
  return c.json(await catalog.getResident(c.env.DB, Number(c.req.param("id"))));
});

adminRoutes.get("/rooms", requirePermission("admin:read"), async (c) => c.json({ items: await catalog.listRooms(c.env.DB) }));
adminRoutes.post("/rooms", requirePermission("admin:write"), async (c) => c.json(await catalog.createRoom(c.env.DB, c.get("auth")!, await c.req.json()), 201));
adminRoutes.get("/rooms/:id", requirePermission("admin:read"), async (c) => c.json(await catalog.getRoom(c.env.DB, Number(c.req.param("id")))));
adminRoutes.patch("/rooms/:id/status", requirePermission("admin:write"), async (c) => {
  const body = await c.req.json();
  return c.json(await catalog.updateRoomStatus(c.env.DB, c.get("auth")!, Number(c.req.param("id")), requireString(body.status, "status")));
});
adminRoutes.get("/rooms/:id/beds", requirePermission("admin:read"), async (c) => c.json({ items: await catalog.listBeds(c.env.DB, Number(c.req.param("id"))) }));
adminRoutes.post("/beds", requirePermission("admin:write"), async (c) => c.json(await catalog.createBed(c.env.DB, c.get("auth")!, await c.req.json()), 201));
adminRoutes.patch("/beds/:id/status", requirePermission("admin:write"), async (c) => {
  const body = await c.req.json();
  return c.json(await catalog.updateBedStatus(c.env.DB, c.get("auth")!, Number(c.req.param("id")), requireString(body.status, "status")));
});
adminRoutes.get("/room-rates", requirePermission("admin:read"), async (c) => {
  const roomId = c.req.query("roomId") ? Number(c.req.query("roomId")) : undefined;
  return c.json({ items: await catalog.listRoomRates(c.env.DB, roomId) });
});
adminRoutes.post("/room-rates", requirePermission("admin:write"), async (c) => c.json(await catalog.createRoomRate(c.env.DB, c.get("auth")!, await c.req.json()), 201));
adminRoutes.patch("/room-rates/:id/status", requirePermission("admin:write"), async (c) => {
  const body = await c.req.json();
  return c.json(await catalog.updateRoomRateStatus(c.env.DB, c.get("auth")!, Number(c.req.param("id")), requireString(body.status, "status")));
});
adminRoutes.get("/availability", requirePermission("admin:read"), async (c) => {
  const sessionId = requirePositiveInt(c.req.query("academicSessionId") ?? c.req.query("sessionId"), "academicSessionId");
  const residentId = c.req.query("residentId") ? Number(c.req.query("residentId")) : undefined;
  return c.json(await catalog.availability(c.env.DB, sessionId, residentId));
});

adminRoutes.get("/applications", requirePermission("application:read"), async (c) => {
  const { search, limit, offset } = q(c);
  return c.json({ items: await workflow.listApplications(c.env.DB, search, limit, offset), limit, offset });
});
adminRoutes.get("/applications/:id", requirePermission("application:read"), async (c) => c.json(await workflow.getApplication(c.env.DB, Number(c.req.param("id")))));
adminRoutes.patch("/applications/:id/status", requirePermission("application:write"), async (c) => {
  const body = await c.req.json();
  return c.json(await workflow.changeApplicationStatus(c.env.DB, c.get("auth")!, Number(c.req.param("id")), requireString(body.status, "status"), optionalString(body.decisionNotes ?? body.decision_notes, "decisionNotes")));
});

adminRoutes.get("/bookings", requirePermission("booking:read"), async (c) => {
  const { search, limit, offset } = q(c);
  return c.json({ items: await workflow.listBookings(c.env.DB, search, limit, offset), limit, offset });
});
adminRoutes.post("/bookings", requirePermission("booking:write"), async (c) => {
  const body = await c.req.json();
  return c.json(await workflow.createBooking(c.env.DB, c.get("auth")!, requirePositiveInt(body.applicationId, "applicationId"), requirePositiveInt(body.roomId, "roomId")), 201);
});
adminRoutes.get("/bookings/:id", requirePermission("booking:read"), async (c) => c.json(await workflow.getBooking(c.env.DB, Number(c.req.param("id")))));
adminRoutes.get("/bookings/:id/payment-summary", requirePermission("booking:read"), async (c) => c.json(await workflow.paymentSummary(c.env.DB, Number(c.req.param("id")))));
adminRoutes.patch("/bookings/:id/status", async (c) => {
  const body = await c.req.json();
  const status = requireString(body.status, "status");
  const auth = c.get("auth")!;
  if (status === "confirmed") {
    if (!auth.permissions.includes("booking:confirm")) return c.json({ error: { code: "forbidden", message: "You do not have permission to confirm bookings" } }, 403);
  } else if (!auth.permissions.includes("booking:write")) {
    return c.json({ error: { code: "forbidden", message: "You do not have permission to update bookings" } }, 403);
  }
  return c.json(await workflow.changeBookingStatus(c.env.DB, auth, Number(c.req.param("id")), status));
});

adminRoutes.get("/payments", requirePermission("payment:read"), async (c) => {
  const { search, limit, offset } = q(c);
  return c.json({ items: await workflow.listPayments(c.env.DB, search, limit, offset), limit, offset });
});
adminRoutes.post("/payments", requirePermission("payment:write"), async (c) => c.json(await workflow.createPayment(c.env.DB, c.get("auth")!, await c.req.json()), 201));
adminRoutes.get("/payments/:id", requirePermission("payment:read"), async (c) => c.json(await workflow.getPayment(c.env.DB, Number(c.req.param("id")))));
adminRoutes.patch("/payments/:id/status", requirePermission("payment:write"), async (c) => {
  const body = await c.req.json();
  return c.json(await workflow.changePaymentStatus(c.env.DB, c.get("auth")!, Number(c.req.param("id")), requireString(body.status, "status")));
});
adminRoutes.post("/payments/:id/verify", requirePermission("payment:verify"), async (c) => c.json(await workflow.verifyPayment(c.env.DB, c.get("auth")!, Number(c.req.param("id")))));
adminRoutes.post("/payments/:id/reject", requirePermission("payment:verify"), async (c) => c.json(await workflow.rejectPayment(c.env.DB, c.get("auth")!, Number(c.req.param("id")))));
adminRoutes.post("/payments/:id/refund", requirePermission("payment:verify"), async (c) => c.json(await workflow.refundPayment(c.env.DB, c.get("auth")!, Number(c.req.param("id")))));
adminRoutes.post("/payments/:id/receipt", requirePermission("receipt:write"), async (c) => c.json(await workflow.issueReceipt(c.env.DB, c.get("auth")!, Number(c.req.param("id"))), 201));
adminRoutes.post("/payments/:id/slip", requirePermission("payment:write"), async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: { code: "invalid_input", message: "file is required" } }, 400);
  const payment = await workflow.getPayment(c.env.DB, Number(c.req.param("id"))) as { id: number; resident_id: number; booking_id: number };
  return c.json(await documents.storeDocument(c.env.DB, c.env.DOCUMENTS, c.get("auth")!, {
    file, residentId: payment.resident_id, documentType: "payment_slip", paymentId: payment.id, bookingId: payment.booking_id,
  }), 201);
});

adminRoutes.get("/receipts", requirePermission("receipt:read"), async (c) => {
  const { search, limit, offset } = q(c);
  return c.json({ items: await workflow.listReceipts(c.env.DB, search, limit, offset), limit, offset });
});
adminRoutes.get("/receipts/:id", requirePermission("receipt:read"), async (c) => c.json(await workflow.getReceipt(c.env.DB, Number(c.req.param("id")))));
adminRoutes.post("/receipts/:id/void", requirePermission("receipt:write"), async (c) => {
  const body = await c.req.json();
  return c.json(await workflow.voidReceipt(c.env.DB, c.get("auth")!, Number(c.req.param("id")), requireString(body.reason, "reason")));
});

adminRoutes.get("/allocations", requirePermission("allocation:read"), async (c) => {
  const { search, limit, offset } = q(c);
  return c.json({ items: await workflow.listAllocations(c.env.DB, search, limit, offset), limit, offset });
});
adminRoutes.post("/allocations", requirePermission("allocation:write"), async (c) => c.json(await workflow.createAllocation(c.env.DB, c.get("auth")!, await c.req.json()), 201));
adminRoutes.get("/allocations/:id", requirePermission("allocation:read"), async (c) => c.json(await workflow.getAllocation(c.env.DB, Number(c.req.param("id")))));
adminRoutes.post("/allocations/:id/transfer", requirePermission("allocation:write"), async (c) => {
  const body = await c.req.json();
  return c.json(await workflow.transferAllocation(c.env.DB, c.get("auth")!, Number(c.req.param("id")), requirePositiveInt(body.bedId, "bedId"), optionalString(body.notes, "notes")));
});
adminRoutes.patch("/allocations/:id/status", requirePermission("allocation:write"), async (c) => {
  const body = await c.req.json();
  return c.json(await workflow.changeAllocationStatus(c.env.DB, c.get("auth")!, Number(c.req.param("id")), requireString(body.status, "status")));
});

adminRoutes.get("/maintenance", requirePermission("maintenance:read"), async (c) => {
  const { search, limit, offset } = q(c);
  return c.json({ items: await operations.listMaintenance(c.env.DB, search, limit, offset), limit, offset });
});
adminRoutes.get("/maintenance/:id", requirePermission("maintenance:read"), async (c) => c.json(await operations.getMaintenance(c.env.DB, Number(c.req.param("id")))));
adminRoutes.post("/maintenance", requirePermission("maintenance:create"), async (c) => c.json(await operations.createMaintenance(c.env.DB, c.get("auth")!, await c.req.json()), 201));
adminRoutes.post("/maintenance/:id/assign", requirePermission("maintenance:assign"), async (c) => {
  const body = await c.req.json();
  return c.json(await operations.assignMaintenance(c.env.DB, c.get("auth")!, Number(c.req.param("id")), requirePositiveInt(body.staffId, "staffId")));
});
adminRoutes.post("/maintenance/:id/start", requirePermission("maintenance:update"), async (c) => c.json(await operations.transitionMaintenance(c.env.DB, c.get("auth")!, Number(c.req.param("id")), "start")));
adminRoutes.post("/maintenance/:id/resolve", requirePermission("maintenance:resolve"), async (c) => c.json(await operations.transitionMaintenance(c.env.DB, c.get("auth")!, Number(c.req.param("id")), "resolve")));
adminRoutes.post("/maintenance/:id/close", requirePermission("maintenance:close"), async (c) => c.json(await operations.transitionMaintenance(c.env.DB, c.get("auth")!, Number(c.req.param("id")), "close")));
adminRoutes.post("/maintenance/:id/cancel", requirePermission("maintenance:update"), async (c) => c.json(await operations.transitionMaintenance(c.env.DB, c.get("auth")!, Number(c.req.param("id")), "cancel")));

adminRoutes.get("/announcements", requirePermission("announcement:read"), async (c) => {
  const { search, limit, offset } = q(c);
  return c.json({ items: await operations.listAnnouncements(c.env.DB, search, limit, offset), limit, offset });
});
adminRoutes.post("/announcements", requirePermission("announcement:write"), async (c) => c.json(await operations.createAnnouncement(c.env.DB, c.get("auth")!, await c.req.json()), 201));
adminRoutes.get("/announcements/:id", requirePermission("announcement:read"), async (c) => c.json(await operations.getAnnouncement(c.env.DB, Number(c.req.param("id")))));
adminRoutes.patch("/announcements/:id", requirePermission("announcement:write"), async (c) => c.json(await operations.updateAnnouncement(c.env.DB, c.get("auth")!, Number(c.req.param("id")), await c.req.json())));
adminRoutes.post("/announcements/:id/publish", requirePermission("announcement:publish"), async (c) => c.json(await operations.publishAnnouncement(c.env.DB, c.get("auth")!, Number(c.req.param("id")))));
adminRoutes.post("/announcements/:id/expire", requirePermission("announcement:publish"), async (c) => c.json(await operations.expireAnnouncement(c.env.DB, c.get("auth")!, Number(c.req.param("id")))));
adminRoutes.post("/announcements/:id/archive", requirePermission("announcement:write"), async (c) => c.json(await operations.archiveAnnouncement(c.env.DB, c.get("auth")!, Number(c.req.param("id")))));

adminRoutes.get("/messages", requirePermission("message:read"), async (c) => {
  const { search, limit, offset } = q(c);
  return c.json({ items: await operations.listMessages(c.env.DB, search, limit, offset), limit, offset });
});
adminRoutes.post("/messages/preview", requirePermission("message:write"), async (c) => {
  const body = await c.req.json();
  return c.json(await operations.previewMessage(c.env.DB, requireString(body.targetType, "targetType"), body.targetConfig ?? body.target_config ?? {}));
});
adminRoutes.post("/messages", requirePermission("message:write"), async (c) => c.json(await operations.createMessageDraft(c.env.DB, c.get("auth")!, await c.req.json()), 201));
adminRoutes.get("/messages/:id", requirePermission("message:read"), async (c) => c.json(await operations.getMessage(c.env.DB, Number(c.req.param("id")))));
adminRoutes.post("/messages/:id/send", requirePermission("message:send"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(await operations.sendMessage(c.env.DB, c.get("auth")!, Number(c.req.param("id")), optionalString((body as { idempotencyKey?: string }).idempotencyKey, "idempotencyKey")));
});
adminRoutes.post("/messages/:id/archive", requirePermission("message:write"), async (c) => c.json(await operations.archiveMessage(c.env.DB, c.get("auth")!, Number(c.req.param("id")))));

adminRoutes.get("/reports/overview", requirePermission("report:read"), async (c) => {
  const sessionId = c.req.query("academicSessionId") ? Number(c.req.query("academicSessionId")) : undefined;
  return c.json(await admin.reportOverview(c.env.DB, sessionId));
});
adminRoutes.get("/reports/occupancy", requirePermission("report:read"), async (c) => c.json(await admin.reportOccupancy(c.env.DB)));
adminRoutes.get("/reports/residents", requirePermission("report:read"), async (c) => c.json(await admin.reportResidents(c.env.DB, c.req.query("status"))));
adminRoutes.get("/reports/applications-bookings", requirePermission("report:read"), async (c) => {
  const sessionId = c.req.query("academicSessionId") ? Number(c.req.query("academicSessionId")) : undefined;
  return c.json(await admin.reportApplicationsBookings(c.env.DB, sessionId, c.req.query("bookingStatus")));
});
adminRoutes.get("/reports/finance", requirePermission("report:finance"), async (c) => c.json(await admin.reportFinance(c.env.DB, c.req.query("from"), c.req.query("to"))));
adminRoutes.get("/reports/outstanding", requirePermission("report:finance"), async (c) => c.json(await admin.reportOutstanding(c.env.DB)));
adminRoutes.get("/reports/maintenance", requirePermission("report:read"), async (c) => c.json(await admin.reportMaintenance(c.env.DB, c.req.query("from"), c.req.query("to"))));

adminRoutes.get("/staff", requirePermission("staff:read"), async (c) => {
  const { search, limit, offset } = q(c);
  return c.json({ items: await admin.listStaff(c.env.DB, search, limit, offset), limit, offset });
});
adminRoutes.get("/roles", requirePermission("staff:read"), async (c) => c.json({ items: await admin.listRoles(c.env.DB) }));
adminRoutes.post("/staff", requireRole("super_admin"), async (c) => c.json(await admin.createStaff(c.env.DB, c.get("auth")!, await c.req.json()), 201));
adminRoutes.get("/staff/:id", requirePermission("staff:read"), async (c) => c.json(await admin.getStaff(c.env.DB, Number(c.req.param("id")))));
adminRoutes.patch("/staff/:id/role", requireRole("super_admin"), async (c) => {
  const body = await c.req.json();
  return c.json(await admin.changeStaffRole(c.env.DB, c.get("auth")!, Number(c.req.param("id")), requirePositiveInt(body.roleId, "roleId")));
});
adminRoutes.patch("/staff/:id/status", requireRole("super_admin"), async (c) => {
  const body = await c.req.json();
  return c.json(await admin.changeStaffStatus(c.env.DB, c.get("auth")!, Number(c.req.param("id")), requireString(body.status, "status")));
});
adminRoutes.patch("/staff/:id/account-status", requireRole("super_admin"), async (c) => {
  const body = await c.req.json();
  return c.json(await admin.changeAccountStatus(c.env.DB, c.get("auth")!, Number(c.req.param("id")), requireString(body.status, "status")));
});
adminRoutes.post("/staff/:id/reset-password", requireRole("super_admin"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(await admin.resetStaffPassword(c.env.DB, c.get("auth")!, Number(c.req.param("id")), optionalString((body as { password?: string }).password, "password")));
});

adminRoutes.get("/audit-logs", requirePermission("audit:read"), async (c) => {
  const { search, limit, offset } = q(c);
  await writeAudit(c.env.DB, { actor: c.get("auth"), action: "admin.audit_logs.accessed", entityType: "audit_log" });
  return c.json(await admin.listAuditLogs(c.env.DB, {
    search,
    actorUserId: c.req.query("actorUserId") ? Number(c.req.query("actorUserId")) : undefined,
    actorStaffId: c.req.query("actorStaffId") ? Number(c.req.query("actorStaffId")) : undefined,
    action: c.req.query("action") ?? undefined,
    entityType: c.req.query("entityType") ?? undefined,
    from: c.req.query("from") ?? undefined,
    to: c.req.query("to") ?? undefined,
    limit, offset,
  }));
});
adminRoutes.get("/audit-logs/:id", requirePermission("audit:read"), async (c) => {
  const id = Number(c.req.param("id"));
  await writeAudit(c.env.DB, { actor: c.get("auth"), action: "admin.audit_logs.detail_accessed", entityType: "audit_log", entityId: id });
  return c.json(await admin.getAuditLog(c.env.DB, id));
});

adminRoutes.get("/settings", requirePermission("settings:read"), async (c) => c.json(await admin.getSettings(c.env.DB)));
adminRoutes.patch("/settings/general", requireRole("super_admin"), async (c) => c.json(await admin.updateGeneralSettings(c.env.DB, c.get("auth")!, await c.req.json())));
adminRoutes.patch("/settings/payment-confirmation", requireRole("super_admin"), async (c) => c.json(await admin.updatePaymentConfirmation(c.env.DB, c.get("auth")!, await c.req.json())));

adminRoutes.get("/documents", requirePermission("document:read"), async (c) => {
  const residentId = c.req.query("residentId") ? Number(c.req.query("residentId")) : undefined;
  return c.json({ items: await admin.listDocuments(c.env.DB, residentId) });
});
adminRoutes.get("/documents/:id", requirePermission("document:read"), async (c) => {
  return c.json(documents.publicDocument(await admin.getDocumentMeta(c.env.DB, Number(c.req.param("id")))));
});
adminRoutes.get("/documents/:id/content", requirePermission("document:read"), async (c) => {
  const result = await documents.streamDocument(c.env.DB, c.env.DOCUMENTS, c.get("auth")!, Number(c.req.param("id")));
  return new Response(result.object.body, {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `inline; filename="${result.filename}"`,
    },
  });
});
adminRoutes.post("/documents/:id/verify", requirePermission("document:write"), async (c) => {
  const body = await c.req.json();
  return c.json(await documents.verifyDocument(c.env.DB, c.get("auth")!, Number(c.req.param("id")), requireString(body.status, "status") as "verified" | "rejected", optionalString(body.reason, "reason")));
});
