export type TargetDbType = "postgresql" | "mongodb" | "mysql" | "unknown";

export function detectTargetDbType(url: string): TargetDbType {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) return "postgresql";
  if (url.startsWith("mongodb://") || url.startsWith("mongodb+srv://")) return "mongodb";
  if (url.startsWith("mysql://") || url.startsWith("mysqlx://")) return "mysql";
  return "unknown";
}

export function convertD1SqlToPostgres(sqliteSql: string): string {
  let sql = sqliteSql;

  // Remove SQLite-specific pragmas
  sql = sql.replace(/^PRAGMA\s+[^\n]+;?\s*$/gim, "");

  // INTEGER PRIMARY KEY AUTOINCREMENT → SERIAL PRIMARY KEY
  sql = sql.replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, "SERIAL PRIMARY KEY");

  // Remaining standalone AUTOINCREMENT → remove
  sql = sql.replace(/\bAUTOINCREMENT\b/gi, "");

  // Type mappings
  sql = sql.replace(/\bDATETIME\b/gi, "TIMESTAMP");
  sql = sql.replace(/\bBLOB\b/gi, "BYTEA");
  sql = sql.replace(/\bREAL\b/gi, "DOUBLE PRECISION");

  // Backtick identifiers → double quotes
  sql = sql.replace(/`([^`]+)`/g, '"$1"');

  // INSERT OR REPLACE / INSERT OR IGNORE → plain INSERT (data wins over clean semantics for migration)
  sql = sql.replace(/\bINSERT\s+OR\s+REPLACE\s+INTO\b/gi, "INSERT INTO");
  sql = sql.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, "INSERT INTO");

  // WITHOUT ROWID → remove
  sql = sql.replace(/\s+WITHOUT\s+ROWID\b/gi, "");

  return sql.trim();
}

export async function runD1MigrationOnPostgres(
  d1SqlDump: string,
  targetPostgresUrl: string
): Promise<{ success: boolean; error?: string }> {
  const { Pool } = (await import("pg")) as typeof import("pg");
  const converted = convertD1SqlToPostgres(d1SqlDump);

  const pool = new Pool({ connectionString: targetPostgresUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(converted);
    await client.query("COMMIT");
    return { success: true };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Migration failed",
    };
  } finally {
    client.release();
    await pool.end();
  }
}
