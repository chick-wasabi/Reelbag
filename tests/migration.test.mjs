import { DEFAULT_APPEARANCE } from "../utils/preferences.mjs";
import { DEFAULT_AVATAR } from "../utils/avatars.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testApplication } from "./helpers/application.mjs";
import { MIGRATIONS } from "../lib/server/schema.mjs";

test("additive migrations retain an existing account and reel and initialize new flags safely", async () => {
  const app = await testApplication();
  try {
    const previous = MIGRATIONS.slice(
      0,
      MIGRATIONS.findIndex((sql) =>
        sql.includes("ADD COLUMN IF NOT EXISTS share_token"),
      ),
    ).filter(
      (sql) =>
        !sql.startsWith("ALTER TABLE") &&
        !sql.includes("reels_user_pinned_created"),
    );
    await app.adapter.transaction(previous.map((sql) => [sql, []]));
    const user = randomUUID();
    const reel = randomUUID();
    await app.adapter.query(
      "INSERT INTO users(id,username,password_hash) VALUES($1,$2,$3)",
      [user, "existing_user", "fixture-only"],
    );
    await app.adapter.query(
      "INSERT INTO reels(id,user_id,title,url) VALUES($1,$2,$3,$4)",
      [reel, user, "Existing reel", "https://instagram.com/reel/EXISTING/"],
    );
    await app.db.ready();
    await app.db.ready();
    const [row] = await app.db.query(
      "SELECT title,is_pinned,is_favorite FROM reels WHERE id=$1",
      [reel],
    );
    assert.deepEqual(row, {
      title: "Existing reel",
      is_pinned: false,
      is_favorite: false,
    });
    const [account] = await app.db.query(
      "SELECT username,security_question,security_answer,avatar_url,password_hint,display_name,appearance FROM users WHERE id=$1",
      [user],
    );
    assert.deepEqual(account, {
      username: "existing_user",
      security_question: null,
      security_answer: null,
      avatar_url: DEFAULT_AVATAR,
      password_hint: null,
      display_name: null,
      appearance: DEFAULT_APPEARANCE,
    });
  } finally {
    await app.pg.close();
  }
});
