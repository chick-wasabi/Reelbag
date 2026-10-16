import { PGlite } from "@electric-sql/pglite";
import { createDatabase } from "../../lib/server/database.mjs";
import { createApi } from "../../lib/server/api.mjs";

export async function testApplication({ secureCookies = false } = {}) {
  const pg = new PGlite();
  const adapter = {
    async query(sql, params) {
      return (await pg.query(sql, params)).rows;
    },
    transaction: (statements) =>
      pg.transaction(async (tx) => {
        const results = [];
        for (const [sql, params] of statements)
          results.push((await tx.query(sql, params)).rows);
        return results;
      }),
  };
  const db = createDatabase(adapter);
  const fetchImpl = async () =>
    new Response("<html><body>Public Instagram embed</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  return {
    pg,
    db,
    adapter,
    handle: createApi({ db, secureCookies, fetchImpl }),
  };
}
