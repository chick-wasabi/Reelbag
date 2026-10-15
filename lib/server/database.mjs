import { MIGRATIONS } from "./schema.mjs";

export function createDatabase(adapter) {
  let initialization;
  function ready() {
    if (!initialization) {
      initialization = adapter
        .transaction(MIGRATIONS.map((sql) => [sql, []]))
        .catch((error) => {
          initialization = undefined;
          throw error;
        });
    }
    return initialization;
  }
  return {
    ready,
    async query(sql, values = []) {
      await ready();
      return adapter.query(sql, values);
    },
    async transaction(statements) {
      await ready();
      return adapter.transaction(statements);
    },
  };
}

export async function createNeonDatabase(url) {
  if (!url) throw new Error("DATABASE_URL is not configured.");
  const parsed = new URL(url);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname.endsWith(".neon.tech")
  ) {
    throw new Error("DATABASE_URL must be a Neon Postgres connection string.");
  }
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  return createDatabase({
    query: (text, params) => sql.query(text, params),
    transaction: (statements) =>
      sql.transaction(
        statements.map(([text, params]) => sql.query(text, params)),
      ),
  });
}
