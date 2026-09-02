import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function migrated() {
  const wasmDir = path.join(root, "node_modules/sql.js/dist");
  const SQL = await initSqlJs({ locateFile: (file) => path.join(wasmDir, file) });
  const sqlite = new SQL.Database();
  sqlite.run("PRAGMA foreign_keys = ON;");
  const dir = path.join(root, "migrations");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    sqlite.run(fs.readFileSync(path.join(dir, file), "utf8"));
  }
  return sqlite;
}

describe("schema", () => {
  it("applies verification SQL", async () => {
    const sqlite = await migrated();
    sqlite.run(fs.readFileSync(path.join(root, "tests/schema-verification.sql"), "utf8"));
    const row = sqlite.exec("SELECT COUNT(*) AS c FROM bookings WHERE booking_number = 'VERIFY-BOOK-1'");
    expect(Number(row[0].values[0][0])).toBe(1);
  });

  it.each([
    "constraint-duplicate-active-booking.sql",
    "constraint-duplicate-active-allocation.sql",
    "constraint-duplicate-room-rate.sql",
    "constraint-invalid-money.sql",
    "constraint-invalid-foreign-key.sql",
  ])("rejects %s", async (file) => {
    const sqlite = await migrated();
    sqlite.run(fs.readFileSync(path.join(root, "tests/schema-verification.sql"), "utf8"));
    expect(() => sqlite.run(fs.readFileSync(path.join(root, "tests", file), "utf8"))).toThrow();
  });
});
