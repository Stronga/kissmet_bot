import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { fail } from "../lib/http";
import { loadAuthFromToken } from "../services/auth.service";

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) fail(401, "unauthorized", "Authentication required");
  const auth = await loadAuthFromToken(c.env.DB, match[1]);
  c.set("auth", auth);
  await next();
};

export function requireRole(...roles: string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get("auth");
    if (!auth) fail(401, "unauthorized", "Authentication required");
    if (!auth.role || !roles.includes(auth.role)) fail(403, "forbidden", "You do not have access to this resource");
    await next();
  };
}

export function requirePermission(...permissions: string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get("auth");
    if (!auth) fail(401, "unauthorized", "Authentication required");
    if (!permissions.every((p) => auth.permissions.includes(p))) {
      fail(403, "forbidden", "You do not have permission to perform this action");
    }
    await next();
  };
}

export const requireResident: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = c.get("auth");
  if (!auth) fail(401, "unauthorized", "Authentication required");
  if (auth.userType !== "resident" || !auth.residentId) {
    fail(403, "forbidden", "Resident access only");
  }
  await next();
};

export const requireStaff: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = c.get("auth");
  if (!auth) fail(401, "unauthorized", "Authentication required");
  if (auth.userType !== "staff" || !auth.staffId) fail(403, "forbidden", "Staff access only");
  await next();
};
