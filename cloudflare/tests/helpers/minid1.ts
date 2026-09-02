import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs, { type Database as SqlDatabase } from "sql.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

class MiniStatement {
  constructor(
    private sqlite: SqlDatabase,
    private sql: string,
    private params: unknown[] = [],
  ) {}

  bind(...binds: unknown[]) {
    return new MiniStatement(this.sqlite, this.sql, binds);
  }

  private exec() {
    const stmt = this.sqlite.prepare(this.sql);
    if (this.params.length) stmt.bind(this.params as never[]);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return {
      rows,
      changes: this.sqlite.getRowsModified(),
      lastId: Number(this.sqlite.exec("SELECT last_insert_rowid() AS id")[0]?.values[0][0] ?? 0),
    };
  }

  async first<T>() {
    const { rows } = this.exec();
    return (rows[0] as T) ?? null;
  }

  async all<T>() {
    const { rows } = this.exec();
    return { results: rows as T[], success: true };
  }

  async run() {
    const { changes, lastId } = this.exec();
    return { success: true, meta: { changes, last_row_id: lastId, duration: 0 } };
  }
}

class MiniD1 {
  constructor(private sqlite: SqlDatabase) {}
  prepare(sql: string) {
    return new MiniStatement(this.sqlite, sql);
  }
}

class MemoryR2 {
  private files = new Map<string, Uint8Array>();
  async put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream | string) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
    this.files.set(key, bytes);
    return {};
  }
  async get(key: string) {
    const body = this.files.get(key);
    if (!body) return null;
    return { body };
  }
}

export async function createTestEnv() {
  const wasmDir = path.join(root, "node_modules/sql.js/dist");
  const SQL = await initSqlJs({ locateFile: (file) => path.join(wasmDir, file) });
  const sqlite = new SQL.Database();
  sqlite.run("PRAGMA foreign_keys = ON;");
  const migrationsDir = path.join(root, "migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    sqlite.run(fs.readFileSync(path.join(migrationsDir, file), "utf8"));
  }
  sqlite.run(fs.readFileSync(path.join(root, "seeds/development.sql"), "utf8"));
  return {
    env: {
      DB: new MiniD1(sqlite) as unknown as D1Database,
      DOCUMENTS: new MemoryR2() as unknown as R2Bucket,
      ENVIRONMENT: "test",
    },
    sqlite,
  };
}
