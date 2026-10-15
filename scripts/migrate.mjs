import { createNeonDatabase } from "../lib/server/database.mjs";
try {
  const db = await createNeonDatabase(process.env.DATABASE_URL);
  await db.ready();
  console.log("Reelbag database schema initialized.");
} catch {
  console.error(
    "Migration failed. Check DATABASE_URL, Neon connectivity, and schema permissions. Credentials were not logged.",
  );
  process.exitCode = 1;
}
