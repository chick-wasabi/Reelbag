import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

async function setup(page) {
  await page.goto("/");
  await page.getByLabel("Master PIN", { exact: true }).fill("1234");
  await page.getByLabel("Confirm PIN", { exact: true }).fill("1234");
  await page
    .getByRole("button", { name: "Set Master PIN", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add Reel", exact: true }),
  ).toBeVisible();
}
async function unlock(page, pin = "1234") {
  await page.getByLabel("Enter Master PIN", { exact: true }).fill(pin);
  await page
    .getByRole("button", { name: "Unlock Reelbag", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add Reel", exact: true }),
  ).toBeVisible();
}
async function addReel(page, title, code, folderId) {
  await page.getByRole("button", { name: "Add Reel", exact: true }).click();
  await page
    .getByLabel("Instagram Reel Link")
    .fill(`https://www.instagram.com/reel/${code}/?igsh=tracking`);
  await page.getByLabel("Title / Name").fill(title);
  if (folderId !== undefined)
    await page
      .getByRole("dialog")
      .getByLabel("Folder (optional)")
      .selectOption(folderId);
  await page.getByRole("button", { name: "Save reel", exact: true }).click();
}
async function createFolder(page, name, pin) {
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByLabel("Folder name", { exact: true }).fill(name);
  if (pin) {
    await page.getByLabel("Protect with a PIN").check();
    await page.getByLabel("4-digit folder PIN", { exact: true }).fill(pin);
  }
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
}
test.beforeEach(async ({ page }) => {
  await page.route("https://www.instagram.com/embed.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'window.instgrm = { Embeds: { process() { document.querySelectorAll("blockquote.instagram-media").forEach(el => el.setAttribute("data-test-processed", "true")); } } };',
    }),
  );
});

test("desktop: minimal header, inline folder creation preserves draft, reel/folder CRUD, and search", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await setup(page);
  await page.getByRole("button", { name: "Add Reel", exact: true }).click();
  await expect(page.getByRole("dialog").locator("input, select")).toHaveCount(
    3,
  );
  await page
    .getByLabel("Instagram Reel Link")
    .fill("https://www.instagram.com/reel/BIKE_1/");
  await page.getByLabel("Title / Name").fill("Sunset ride");
  await page
    .getByRole("button", { name: "Create New Folder", exact: true })
    .click();
  await page.getByLabel("Folder name", { exact: true }).fill("Bike Riding");
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await expect(page.getByLabel("Title / Name")).toHaveValue("Sunset ride");
  await expect(page.getByLabel("Instagram Reel Link")).toHaveValue(
    "https://www.instagram.com/reel/BIKE_1/",
  );
  await expect(
    page.getByRole("dialog").getByLabel("Folder (optional)"),
  ).not.toHaveValue("");
  await page.getByRole("button", { name: "Save reel", exact: true }).click();
  await expect(page.locator('[data-test-processed="true"]')).toHaveCount(1);
  await page
    .getByRole("button", { name: "Edit Sunset ride", exact: true })
    .click();
  await page.getByLabel("Title / Name").fill("Evening ride");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Edit folder", exact: true }).click();
  await page.getByLabel("Folder name", { exact: true }).fill("Bike Edits");
  await page.getByRole("button", { name: "Save folder", exact: true }).click();
  await expect(page.getByLabel("Folders", { exact: true })).toContainText(
    "Bike Edits",
  );
  await page.getByLabel("Folders", { exact: true }).selectOption("all");
  await addReel(page, "A good recipe", "RECIPE", "");
  const recipe = page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: "A good recipe", exact: true }),
    });
  await expect(recipe.locator(".reel-folder")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    /undefined|uncategorized|Unfiled|To Try|In Progress|Completed|Collections/,
  );
  await page.getByRole("searchbox", { name: "Search reels" }).fill("evening");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search reels" }).fill("");
  await page.screenshot({
    path: "/tmp/reelbag-minimal-desktop.png",
    fullPage: true,
  });
  await page
    .getByLabel("Folders", { exact: true })
    .selectOption({ label: "Bike Edits" });
  await page.getByRole("button", { name: "Edit folder", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete folder", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete folder", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Evening ride", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete Evening ride", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete reel", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Evening ride", exact: true }),
  ).toHaveCount(0);
  expect(failures).toEqual([]);
});

test("protected folder reels cannot leak into stream/search and both locks reset after reload", async ({
  page,
}) => {
  await setup(page);
  await createFolder(page, "Pranks", "4567");
  await addReel(page, "Secret prank", "SECRET");
  await page.getByRole("button", { name: "Lock folder", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Secret prank" })).toHaveCount(
    0,
  );
  await page.getByRole("searchbox", { name: "Search reels" }).fill("Secret");
  await expect(page.getByRole("article")).toHaveCount(0);
  await page
    .getByLabel("Folders", { exact: true })
    .selectOption({ label: "🔒 Pranks" });
  await page.getByLabel("Folder PIN", { exact: true }).fill("0000");
  await page.getByRole("button", { name: "Open folder" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "doesn’t match",
  );
  await page.getByLabel("Folder PIN", { exact: true }).fill("4567");
  await page.getByRole("button", { name: "Open folder" }).click();
  await expect(
    page.getByRole("heading", { name: "Secret prank" }),
  ).toBeVisible();
  await page.reload();
  await page.getByLabel("Enter Master PIN", { exact: true }).fill("0000");
  await page.getByRole("button", { name: "Unlock Reelbag" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "doesn’t match",
  );
  await unlock(page);
  await expect(page.getByRole("heading", { name: "Secret prank" })).toHaveCount(
    0,
  );
  await page
    .getByLabel("Folders", { exact: true })
    .selectOption({ label: "🔒 Pranks" });
  await page.getByLabel("Folder PIN", { exact: true }).fill("4567");
  await page.getByRole("button", { name: "Open folder" }).click();
  await page.getByRole("button", { name: "Edit folder", exact: true }).click();
  await page.getByLabel("Protect with a PIN").uncheck();
  await page.getByRole("button", { name: "Save folder", exact: true }).click();
  await page.getByRole("button", { name: "Lock app", exact: true }).click();
  await unlock(page);
  await expect(
    page.getByRole("heading", { name: "Secret prank" }),
  ).toBeVisible();
});

test("backup round trip preserves folder PINs; malformed import does not overwrite data", async ({
  page,
}) => {
  await setup(page);
  await createFolder(page, "Magic", "4567");
  await addReel(page, "Card trick", "MAGIC");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON Backup" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const backup = JSON.parse(await readFile(path, "utf8"));
  expect(backup.version).toBe(2);
  expect(backup.profiles).toBeUndefined();
  expect(backup.folders[0].pin.hash).toHaveLength(64);
  await page
    .getByLabel("Import Reelbag backup")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{broken"),
    });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "not valid JSON",
  );
  await page.getByLabel("Import Reelbag backup").setInputFiles(path);
  await page.getByRole("button", { name: "Replace & import" }).click();
  await unlock(page);
  await expect(page.getByRole("heading", { name: "Card trick" })).toHaveCount(
    0,
  );
  await page
    .getByLabel("Folders", { exact: true })
    .selectOption({ label: "🔒 Magic" });
  await page.getByLabel("Folder PIN", { exact: true }).fill("4567");
  await page.getByRole("button", { name: "Open folder" }).click();
  await expect(page.getByRole("heading", { name: "Card trick" })).toBeVisible();
});

test("mobile: three-field shared-link save, change Master PIN, responsive header and one-column grid", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FMOBILE%2F");
  await page.getByLabel("Master PIN", { exact: true }).fill("1234");
  await page.getByLabel("Confirm PIN", { exact: true }).fill("1234");
  await page
    .getByRole("button", { name: "Set Master PIN", exact: true })
    .click();
  await expect(page.getByLabel("Instagram Reel Link")).toHaveValue(
    "https://www.instagram.com/reel/MOBILE/",
  );
  await page.getByLabel("Title / Name").fill("Weekend plans");
  await page.getByRole("button", { name: "Save reel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Weekend plans" }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/reelbag-minimal-mobile.png",
    fullPage: true,
  });
  for (const width of [320, 390, 768, 1024, 1536]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const columns = await page
      .locator(".reel-grid")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      );
    expect(columns).toBe(
      width < 640 ? 1 : width < 1024 ? 2 : width < 1440 ? 3 : 4,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Change Master PIN" }).click();
  await page.getByLabel("Current Master PIN").fill("1234");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Master PIN", { exact: true }).fill("9876");
  await page.getByLabel("Confirm PIN", { exact: true }).fill("9876");
  await page.getByRole("button", { name: "Set Master PIN" }).click();
  await unlock(page, "9876");
  await expect(
    page.getByRole("heading", { name: "Weekend plans" }),
  ).toBeVisible();
});

test("legacy migration verifies every old PIN, keeps all reels, and retains the original data", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const salt = "0123456789abcdef0123456789abcdef";
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode("1234"),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bytes = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: encoder.encode(salt),
          iterations: 210000,
          hash: "SHA-256",
        },
        key,
        256,
      ),
    );
    const pin = {
      salt,
      hash: Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
      iterations: 210000,
    };
    const profile = (id, name, code) => ({
      id,
      name,
      pin,
      color: "lime",
      folders: [{ id: "same-folder", name: "Favorites", color: "lime" }],
      reels: [
        {
          id: "same-reel",
          title: `${name} reel`,
          url: `https://www.instagram.com/reel/${code}/`,
          folderId: "same-folder",
          status: "Completed",
          note: "Remove this note",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    localStorage.setItem(
      "reelbag.v1",
      JSON.stringify({
        version: 1,
        profiles: [
          profile("p1", "Personal", "OLD_1"),
          profile("p2", "Friends", "OLD_2"),
        ],
      }),
    );
  });
  const original = await page.evaluate(() =>
    localStorage.getItem("reelbag.v1"),
  );
  await page.reload();
  await page.getByLabel("Existing PIN for Personal").fill("1234");
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await expect(page.getByLabel("Existing PIN for Friends")).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("reelbag.v2")),
  ).toBeNull();
  await page.getByLabel("Existing PIN for Friends").fill("1234");
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await page.getByLabel("Master PIN", { exact: true }).fill("5678");
  await page.getByLabel("Confirm PIN", { exact: true }).fill("5678");
  await page.getByRole("button", { name: "Set Master PIN" }).click();
  await expect(
    page.getByRole("heading", { name: "Personal reel" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Friends reel" }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("reelbag.v1"))).toBe(
    original,
  );
  const migrated = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("reelbag.v2")),
  );
  expect(migrated.reels.every((r) => !("note" in r) && !("status" in r))).toBe(
    true,
  );
  await page.reload();
  await unlock(page, "5678");
  await expect(page.getByRole("article")).toHaveCount(2);
});

test("cross-tab changes lock the app and an embed failure retains the original link", async ({
  page,
  context,
}) => {
  await setup(page);
  await page.unroute("https://www.instagram.com/embed.js");
  await page.route("https://www.instagram.com/embed.js", (route) =>
    route.abort(),
  );
  await addReel(page, "Public reel", "FALLBACK", "");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open original", exact: true }),
  ).toHaveAttribute("href", "https://www.instagram.com/reel/FALLBACK/");
  const other = await context.newPage();
  await other.goto("/");
  await other.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("reelbag.v2"));
    data.revision += 1;
    localStorage.setItem("reelbag.v2", JSON.stringify(data));
  });
  await expect(page.getByLabel("Enter Master PIN")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await other.close();
});
