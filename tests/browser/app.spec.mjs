import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import { testApplication } from "../helpers/application.mjs";

let application;
const secret = "Secure-test-9876";
const username = () => `browser_${randomBytes(5).toString("hex")}`;
test.beforeAll(async () => {
  application = await testApplication();
});
test.afterAll(async () => {
  await application.pg.close();
});
async function connect(context) {
  await context.route("**/api/**", async (route) => {
    const req = route.request();
    const response = await application.handle(
      new Request(req.url(), {
        method: req.method(),
        headers: await req.allHeaders(),
        ...(["GET", "HEAD"].includes(req.method())
          ? {}
          : { body: req.postDataBuffer() }),
      }),
      new URL(req.url()).pathname.slice("/api/".length).split("/"),
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
  await context.route("https://www.instagram.com/embed.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'window.instgrm={Embeds:{process(){document.querySelectorAll("blockquote.instagram-media").forEach(el=>el.setAttribute("data-test-processed","true"));}}};',
    }),
  );
}
test.beforeEach(async ({ context }) => connect(context));
async function register(page, name = username()) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign Up", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page.getByLabel("Password or PIN", { exact: true }).fill(secret);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add Reel", exact: true }),
  ).toBeVisible();
  return name;
}
async function login(page, name) {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page.getByLabel("Password or PIN", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add Reel", exact: true }),
  ).toBeVisible();
}
async function addReel(page, title, code, folderId) {
  await page.getByRole("button", { name: "Add Reel", exact: true }).click();
  await page
    .getByLabel("Instagram Reel Link")
    .fill(`https://instagram.com/reel/${code}/?igsh=tracking`);
  await page.getByLabel("Title / Name").fill(title);
  if (folderId !== undefined)
    await page
      .getByRole("dialog")
      .getByLabel("Folder (optional)")
      .selectOption(folderId);
  await page.getByRole("button", { name: "Save reel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function folder(page, name, pin) {
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByLabel("Folder name", { exact: true }).fill(name);
  if (pin) {
    await page.getByLabel("Protect with a PIN").check();
    await page.getByLabel("4-digit folder PIN", { exact: true }).fill(pin);
  }
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("cloud signup, three-field inline folder creation, reel and folder CRUD, and clean responsive grid", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1536, height: 1000 });
  await register(page);
  await page.getByRole("button", { name: "Add Reel", exact: true }).click();
  await expect(page.getByRole("dialog").locator("input,select")).toHaveCount(3);
  await page
    .getByLabel("Instagram Reel Link")
    .fill("https://instagram.com/reel/BIKE/");
  await page.getByLabel("Title / Name").fill("Sunset ride");
  await page
    .getByRole("button", { name: "Create New Folder", exact: true })
    .click();
  await page.getByLabel("Folder name", { exact: true }).fill("Bike Riding");
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await expect(page.getByLabel("Title / Name")).toHaveValue("Sunset ride");
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
  await page.getByLabel("Folders", { exact: true }).selectOption("all");
  await addReel(page, "Recipe idea", "RECIPE", "");
  await expect(
    page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", { name: "Recipe idea", exact: true }),
      })
      .locator(".reel-folder"),
  ).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search reels" }).fill("evening");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search reels" }).fill("");
  await page.screenshot({
    path: "/tmp/reelbag-cloud-desktop.png",
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
  await page.screenshot({
    path: "/tmp/reelbag-cloud-mobile.png",
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
    page.getByRole("heading", { name: "Evening ride" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete Evening ride", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete reel", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Evening ride" })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(() => localStorage.getItem("reelbag.v2")),
  ).toBeNull();
  expect(errors).toEqual([]);
});

test("another device sees saved Postgres data while another user is isolated and logout revokes only one device", async ({
  page,
  browser,
}) => {
  const name = await register(page);
  await folder(page, "Favorites");
  await addReel(page, "Saved everywhere", "GLOBAL");
  const library = await page.evaluate(async () =>
    (await fetch("/api/library")).json(),
  );
  const device = await browser.newContext({
    viewport: { width: 412, height: 915 },
  });
  await connect(device);
  const mobile = await device.newPage();
  const outsider = await browser.newContext();
  await connect(outsider);
  const other = await outsider.newPage();
  try {
    await login(mobile, name);
    await expect(
      mobile.getByRole("heading", { name: "Saved everywhere" }),
    ).toBeVisible();
    await register(other);
    await expect(
      other.getByRole("heading", { name: "Saved everywhere" }),
    ).toHaveCount(0);
    const status = await other.evaluate(
      async (id) =>
        (
          await fetch(`/api/reels/${id}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
        ).status,
      library.reels[0].id,
    );
    expect(status).toBe(404);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
    await mobile.reload();
    await expect(
      mobile.getByRole("heading", { name: "Saved everywhere" }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  } finally {
    await device.close();
    await outsider.close();
  }
});

test("folder PINs are verified by SQL-backed API and protected content is absent from API responses", async ({
  page,
  browser,
}) => {
  const name = await register(page);
  await folder(page, "Pranks", "4567");
  await addReel(page, "Secret prank", "SECRET");
  const device = await browser.newContext();
  await connect(device);
  const other = await device.newPage();
  try {
    await login(other, name);
    await expect(
      other.getByRole("heading", { name: "Secret prank" }),
    ).toHaveCount(0);
    const library = await other.evaluate(async () =>
      (await fetch("/api/library")).json(),
    );
    expect(library.reels).toHaveLength(0);
    expect(JSON.stringify(library)).not.toMatch(/pin_code|password_hash/);
    await other
      .getByLabel("Folders", { exact: true })
      .selectOption({ label: "🔒 Pranks" });
    await other.getByLabel("Folder PIN", { exact: true }).fill("0000");
    await other.getByRole("button", { name: "Open folder" }).click();
    await expect(other.getByRole("dialog").getByRole("alert")).toContainText(
      "doesn’t match",
    );
    await other.getByLabel("Folder PIN", { exact: true }).fill("4567");
    await other.getByRole("button", { name: "Open folder" }).click();
    await expect(
      other.getByRole("heading", { name: "Secret prank" }),
    ).toBeVisible();
    await other.reload();
    await expect(
      other.getByRole("heading", { name: "Secret prank" }),
    ).toBeVisible();
    await other
      .getByLabel("Folders", { exact: true })
      .selectOption({ label: "Pranks" });
    await other
      .getByRole("button", { name: "Lock folder", exact: true })
      .click();
    await expect(
      other.getByRole("heading", { name: "Secret prank" }),
    ).toHaveCount(0);
  } finally {
    await device.close();
  }
});

test("portable cloud backups append without credentials and legacy browser imports preserve originals", async ({
  page,
}) => {
  await register(page);
  await addReel(page, "Recipe", "BACKUP", "");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON Backup" }).click();
  const download = await promise;
  const path = await download.path();
  const backup = JSON.parse(await readFile(path, "utf8"));
  expect(backup.version).toBe(3);
  expect(JSON.stringify(backup)).not.toMatch(/hash|password/);
  await page.getByLabel("Import Reelbag backup").setInputFiles(path);
  await page
    .getByRole("button", { name: "Import to cloud", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(2);
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
    localStorage.setItem(
      "reelbag.v2",
      JSON.stringify({
        version: 2,
        revision: 1,
        masterPin: pin,
        folders: [],
        reels: [
          {
            id: "old-reel",
            title: "Local memory",
            url: "https://instagram.com/reel/OLD/",
            folderId: null,
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    );
  });
  const original = await page.evaluate(() =>
    localStorage.getItem("reelbag.v2"),
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Import previous browser library" })
    .click();
  await page.getByLabel("Previous Master PIN").fill("1234");
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await page.getByRole("button", { name: "Copy to cloud account" }).click();
  await expect(
    page.getByRole("heading", { name: "Local memory" }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("reelbag.v2"))).toBe(
    original,
  );
});

test("server write errors keep reel drafts available and never show an unsaved card", async ({
  page,
}) => {
  await register(page);
  await page.route("**/api/reels", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Database temporarily unavailable." }),
    }),
  );
  await page.getByRole("button", { name: "Add Reel", exact: true }).click();
  await page
    .getByLabel("Instagram Reel Link")
    .fill("https://instagram.com/reel/UNSAVED/");
  await page.getByLabel("Title / Name").fill("Keep my draft");
  await page.getByRole("button", { name: "Save reel", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Database temporarily unavailable",
  );
  await expect(page.getByLabel("Title / Name")).toHaveValue("Keep my draft");
  await expect(page.getByRole("article")).toHaveCount(0);
});
