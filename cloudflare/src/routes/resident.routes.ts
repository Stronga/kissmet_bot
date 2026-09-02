import { Hono } from "hono";
import type { AppEnv } from "../env";
import { optionalString } from "../auth/validation";
import * as portal from "../services/resident-portal.service";
import * as documents from "../services/documents.service";
import * as workflow from "../services/workflow.service";

export const residentRoutes = new Hono<AppEnv>();

residentRoutes.get("/home", async (c) => c.json(await portal.residentHome(c.env.DB, c.get("auth")!)));
residentRoutes.get("/profile", async (c) => c.json(await portal.residentProfile(c.env.DB, c.get("auth")!)));
residentRoutes.patch("/profile", async (c) => c.json(await portal.updateResidentProfile(c.env.DB, c.get("auth")!, await c.req.json())));
residentRoutes.get("/documents", async (c) => c.json({ items: await portal.residentDocuments(c.env.DB, c.get("auth")!) }));
residentRoutes.post("/documents", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  const documentType = String(form.get("documentType") ?? "");
  if (!(file instanceof File)) return c.json({ error: { code: "invalid_input", message: "file is required" } }, 400);
  if (!["student_card", "ghana_card", "profile_photo", "application_support", "other"].includes(documentType)) {
    return c.json({ error: { code: "invalid_input", message: "Invalid document type" } }, 400);
  }
  return c.json(await documents.storeDocument(c.env.DB, c.env.DOCUMENTS, c.get("auth")!, {
    file,
    residentId: c.get("auth")!.residentId!,
    documentType,
  }), 201);
});
residentRoutes.get("/documents/:id/content", async (c) => {
  const result = await documents.streamDocument(c.env.DB, c.env.DOCUMENTS, c.get("auth")!, Number(c.req.param("id")));
  return new Response(result.object.body, {
    headers: { "Content-Type": result.contentType, "Content-Disposition": `inline; filename="${result.filename}"` },
  });
});
residentRoutes.get("/applications", async (c) => c.json({ items: await portal.residentApplications(c.env.DB, c.get("auth")!) }));
residentRoutes.post("/applications", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(await portal.residentCreateApplication(c.env.DB, c.get("auth")!, optionalString((body as { notes?: string }).notes, "notes")), 201);
});
residentRoutes.post("/applications/:id/submit", async (c) => c.json(await portal.residentSubmitApplication(c.env.DB, c.get("auth")!, Number(c.req.param("id")))));
residentRoutes.get("/booking", async (c) => c.json(await portal.residentBooking(c.env.DB, c.get("auth")!)));
residentRoutes.get("/payments", async (c) => c.json({ items: await portal.residentPayments(c.env.DB, c.get("auth")!) }));
residentRoutes.post("/payments", async (c) => c.json(await portal.residentCreatePayment(c.env.DB, c.get("auth")!, await c.req.json()), 201));
residentRoutes.post("/payments/:id/slip", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: { code: "invalid_input", message: "file is required" } }, 400);
  const payment = await workflow.getPayment(c.env.DB, Number(c.req.param("id"))) as { id: number; resident_id: number; booking_id: number };
  if (payment.resident_id !== c.get("auth")!.residentId) return c.json({ error: { code: "forbidden", message: "You cannot access this payment" } }, 403);
  return c.json(await documents.storeDocument(c.env.DB, c.env.DOCUMENTS, c.get("auth")!, {
    file, residentId: payment.resident_id, documentType: "payment_slip", paymentId: payment.id, bookingId: payment.booking_id,
  }), 201);
});
residentRoutes.get("/receipts", async (c) => c.json({ items: await portal.residentReceipts(c.env.DB, c.get("auth")!) }));
residentRoutes.get("/receipts/:id", async (c) => c.json(await portal.residentReceipt(c.env.DB, c.get("auth")!, Number(c.req.param("id")))));
residentRoutes.get("/room", async (c) => c.json(await portal.residentRoom(c.env.DB, c.get("auth")!)));
residentRoutes.get("/maintenance", async (c) => c.json({ items: await portal.residentMaintenance(c.env.DB, c.get("auth")!) }));
residentRoutes.post("/maintenance", async (c) => c.json(await portal.residentCreateMaintenance(c.env.DB, c.get("auth")!, await c.req.json()), 201));
residentRoutes.get("/announcements", async (c) => c.json({ items: await portal.listResidentAnnouncements(c.env.DB) }));
residentRoutes.get("/inbox", async (c) => c.json({ items: await portal.residentInbox(c.env.DB, c.get("auth")!) }));
residentRoutes.get("/inbox/:id", async (c) => c.json(await portal.residentInboxItem(c.env.DB, c.get("auth")!, Number(c.req.param("id")))));
residentRoutes.post("/inbox/:id/read", async (c) => c.json(await portal.markInboxRead(c.env.DB, c.get("auth")!, Number(c.req.param("id")))));
