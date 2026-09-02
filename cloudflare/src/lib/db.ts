export async function one<T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T | null> {
  const row = await db.prepare(sql).bind(...binds).first<T>();
  return row ?? null;
}

export async function all<T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T[]> {
  const res = await db.prepare(sql).bind(...binds).all<T>();
  return (res.results ?? []) as T[];
}

export async function run(db: D1Database, sql: string, ...binds: unknown[]) {
  return db.prepare(sql).bind(...binds).run();
}

export async function allocateCode(
  db: D1Database,
  table:
    | "resident_code_sequence"
    | "application_number_sequence"
    | "booking_number_sequence"
    | "payment_reference_sequence"
    | "receipt_number_sequence"
    | "maintenance_request_sequence",
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const row = await one<{ prefix: string; next_value: number; padding: number }>(
      db,
      `SELECT prefix, next_value, padding FROM ${table} WHERE id = 1`,
    );
    if (!row) throw new Error(`Sequence table ${table} is not initialized`);
    const updated = await run(
      db,
      `UPDATE ${table} SET next_value = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1 AND next_value = ?`,
      row.next_value + 1,
      row.next_value,
    );
    if ((updated.meta.changes ?? 0) === 1) {
      return `${row.prefix}${String(row.next_value).padStart(row.padding, "0")}`;
    }
  }
  throw new Error(`Could not allocate code from ${table}`);
}
