import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./env";
import { HttpError, jsonError } from "./lib/http";
import { requireAuth, requireResident, requireStaff } from "./middleware/auth.middleware";
import { authRoutes, publicRoutes } from "./routes/auth.routes";
import { adminRoutes } from "./routes/admin.routes";
import { residentRoutes } from "./routes/resident.routes";
import { publicAnnouncements } from "./services/operations.service";
import { one } from "./lib/db";

const app = new Hono<AppEnv>();

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
    ],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(jsonError(err), err.status as 400);
  }
  console.error(err);
  return c.json({ error: { code: "internal_error", message: "We could not complete that request. Please try again." } }, 500);
});

app.get("/health", (c) => c.json({ ok: true, service: "kissmet-api" }));
app.get("/health/db", async (c) => {
  const row = await one<{ ping: number }>(c.env.DB, "SELECT 1 AS ping");
  return c.json({ ok: true, db: row?.ping === 1 });
});

app.route("/auth", authRoutes);
app.route("/public", publicRoutes);
app.get("/public/announcements", async (c) => c.json({ items: await publicAnnouncements(c.env.DB) }));

app.use("/admin/*", requireAuth, requireStaff);
app.route("/admin", adminRoutes);

app.use("/resident/*", requireAuth, requireResident);
app.route("/resident", residentRoutes);

export default app;
