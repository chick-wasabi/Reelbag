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
  await context.route("https://api.dicebear.com/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#b5f36d"/><path d="M10 12h5v5h-5zm15 0h5v5h-5zM12 26h16v4H12z" fill="#15181a"/></svg>',
    }),
  );
  await context.route("https://www.instagram.com/reel/*/embed/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><style>
        *{box-sizing:border-box}body{margin:0;background:#101820;color:#d7e4dd;font:14px Arial}
        header{height:55px;padding:20px;background:white;color:#333}
        main{aspect-ratio:9/16;display:grid;place-content:center;text-align:center;background:linear-gradient(150deg,#293c39,#132026 50%,#30394a)}
        button{width:80px;height:62px;border:1px solid #e0f2db66;background:#bde9a922;color:#e0f2db;border-radius:20px;font-size:15px;margin:auto;cursor:pointer}
        footer{height:240px;background:white;color:#333;padding:20px}
        </style></head><body><header>Instagram profile</header><main>
        <button aria-label="Play video" onclick="
          const current=this.getAttribute('aria-label');
          if(current==='Play video'){this.textContent='Pause';this.setAttribute('aria-label','Pause video')}
          else if(current==='Pause video'){this.textContent='Replay';this.setAttribute('aria-label','Replay video')}
          else{window.open('https://www.instagram.com/reel/REDIRECT/','_blank');try{top.location.href='https://www.instagram.com/reel/REDIRECT/'}catch{};this.textContent='Pause';this.setAttribute('aria-label','Pause video')}
        ">Play</button></main><footer>Likes · Comments · Instagram</footer><script>if(new URLSearchParams(location.search).get('autoplay')==='1'){const button=document.querySelector('button');button.textContent='Pause';button.setAttribute('aria-label','Pause video')}</script></body></html>`,
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
async function openProfileItem(page, name) {
  await page
    .getByRole("button", { name: "Open profile menu", exact: true })
    .click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function selectFilter(page, name) {
  const sidebar = page.getByRole("complementary", {
    name: "Desktop workspace",
  });
  if (await sidebar.isVisible()) {
    const label =
      name === "All reels"
        ? "All Reels"
        : ["Pinned", "Favorites"].includes(name)
          ? name
          : `Open folder ${name}`;
    await sidebar.getByRole("button", { name: label, exact: true }).click();
  } else
    await page
      .getByRole("button", { name: `Filter ${name}`, exact: true })
      .click();
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
  await expect(page.locator("iframe.reel-iframe")).toHaveCount(1);
  await page.getByLabel("Actions for Sunset ride", { exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Sunset ride", exact: true })
    .click();
  await page.getByLabel("Title / Name").fill("Evening ride");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Edit folder", exact: true }).click();
  await page.getByLabel("Folder name", { exact: true }).fill("Bike Edits");
  await page.getByRole("button", { name: "Save folder", exact: true }).click();
  await selectFilter(page, "All reels");
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
  await selectFilter(page, "Bike Edits");
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
  await page.getByLabel("Actions for Evening ride", { exact: true }).click();
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
    await selectFilter(other, "Pranks");
    await other.getByLabel("Folder PIN", { exact: true }).fill("0000");
    await other
      .getByRole("button", { name: "Open folder", exact: true })
      .click();
    await expect(other.getByRole("dialog").getByRole("alert")).toContainText(
      "doesn’t match",
    );
    await other.getByLabel("Folder PIN", { exact: true }).fill("4567");
    await other
      .getByRole("button", { name: "Open folder", exact: true })
      .click();
    await expect(
      other.getByRole("heading", { name: "Secret prank" }),
    ).toBeVisible();
    await other.reload();
    await expect(
      other.getByRole("heading", { name: "Secret prank" }),
    ).toBeVisible();
    await selectFilter(other, "Pranks");
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
  await openProfileItem(page, "Data & Backups");
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
  await openProfileItem(page, "Data & Backups");
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

test("sidebar collapses, folder counts follow moves, and full-width cropped embeds request autoplay on replay", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await register(page);
  await folder(page, "Inspiration");
  await addReel(page, "Video to remake", "REMAKE");
  await folder(page, "Remakes");
  await addReel(page, "Weekend idea", "WEEKEND", "");
  await page.getByRole("button", { name: "All Reels", exact: true }).click();
  const sidebar = page.getByRole("complementary", {
    name: "Desktop workspace",
  });
  await expect(sidebar).toBeVisible();
  await expect(
    sidebar.getByText("Your personal vault for video remakes & inspiration", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    sidebar
      .getByRole("button", { name: "Open folder Inspiration", exact: true })
      .locator(".sidebar-count"),
  ).toHaveText("1");
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Video to remake", exact: true }),
  });
  const iframe = card.locator("iframe.reel-iframe");
  await expect(iframe).toHaveAttribute(
    "src",
    "https://www.instagram.com/reel/REMAKE/embed/",
  );
  await expect(iframe).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-presentation",
  );
  await expect(
    page.locator('script[src="https://www.instagram.com/embed.js"]'),
  ).toHaveCount(0);
  const clip = card.locator(".embed-shell");
  const clipped = await clip.boundingBox();
  const frame = await iframe.boundingBox();
  const cardBox = await card.boundingBox();
  expect(Math.abs(clipped.width - (cardBox.width - 2))).toBeLessThan(1);
  expect(clipped.height).toBeLessThanOrEqual(480);
  await expect(clip).toHaveCSS("overflow", "hidden");
  const footer = await card
    .frameLocator("iframe")
    .locator("footer")
    .boundingBox();
  const profile = await card
    .frameLocator("iframe")
    .locator("header")
    .boundingBox();
  expect(footer.y).toBeGreaterThanOrEqual(clipped.y + clipped.height - 1);
  expect(profile.y + profile.height).toBeLessThanOrEqual(clipped.y + 1);
  expect(frame.y).toBe(clipped.y - 55);
  expect(Math.abs(frame.height - clipped.height - 165)).toBeLessThan(1);
  const player = card.frameLocator("iframe");
  await player.getByRole("button", { name: "Play video", exact: true }).click();
  await player
    .getByRole("button", { name: "Pause video", exact: true })
    .click();
  await player
    .getByRole("button", { name: "Replay video", exact: true })
    .click();
  await expect(
    player.getByRole("button", { name: "Pause video", exact: true }),
  ).toBeVisible();
  expect(page.context().pages()).toHaveLength(1);
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await page.screenshot({
    path: "/tmp/reelbag-vault-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await expect(sidebar).toHaveCSS("width", "84px");
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await expect(sidebar).toHaveCSS("width", "264px");
  await expect(
    sidebar.getByRole("button", { name: "Browse folders", exact: true }),
  ).toHaveCount(0);
  await expect(
    sidebar.getByRole("button", { name: "Pinned", exact: true }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: "Favorites", exact: true }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Replay Video to remake", exact: true })
    .click();
  await expect(iframe).toHaveAttribute(
    "src",
    "https://www.instagram.com/reel/REMAKE/embed/?autoplay=1",
  );
  await expect(
    player.getByRole("button", { name: "Pause video", exact: true }),
  ).toBeVisible();
  await card.getByLabel("Actions for Video to remake", { exact: true }).click();
  await card
    .getByRole("button", { name: "Move Video to remake", exact: true })
    .click();
  await page
    .getByLabel("Move to folder", { exact: true })
    .selectOption({ label: "Remakes" });
  await page.getByRole("button", { name: "Move reel", exact: true }).click();
  await expect(
    sidebar
      .getByRole("button", { name: "Open folder Inspiration", exact: true })
      .locator(".sidebar-count"),
  ).toHaveText("0");
  await expect(
    sidebar
      .getByRole("button", { name: "Open folder Remakes", exact: true })
      .locator(".sidebar-count"),
  ).toHaveText("1");
  const persisted = await page.evaluate(async () =>
    (await fetch("/api/library")).json(),
  );
  expect(
    persisted.reels.find((reel) => reel.title === "Video to remake").folderId,
  ).toBe(persisted.folders.find((folder) => folder.name === "Remakes").id);
  await page.setViewportSize({ width: 412, height: 915 });
  await expect(sidebar).toBeHidden();
  const mobileClip = await clip.boundingBox();
  expect(mobileClip.height).toBeLessThanOrEqual(480);
  await expect(page.locator(".reel-fab")).toBeVisible();
  await expect(page.locator(".mobile-brand .brand-tagline")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/reelbag-vault-mobile.png",
    fullPage: true,
  });
});

test("optional custom recovery accepts a typo, password eye toggles work, and recovery can be disabled", async ({
  page,
}) => {
  const name = username();
  const updated = "Updated-password-9876";
  await page.goto("/");
  await page.getByRole("button", { name: "Sign Up", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page.getByLabel("Password or PIN", { exact: true }).fill(secret);
  await page
    .getByRole("button", { name: "Show password or pin", exact: true })
    .click();
  await expect(
    page.getByLabel("Password or PIN", { exact: true }),
  ).toHaveAttribute("type", "text");
  await page
    .getByRole("button", { name: "Hide password or pin", exact: true })
    .click();
  await expect(
    page.getByLabel("Password or PIN", { exact: true }),
  ).toHaveAttribute("type", "password");
  await page.getByLabel("Set up account recovery (optional)").check();
  await page
    .getByLabel("Security question", { exact: true })
    .selectOption("custom");
  await page
    .getByLabel("Custom question", { exact: true })
    .fill("My first dream car?");
  await page.getByLabel("Recovery answer", { exact: true }).fill("Bugatti");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add Reel", exact: true }),
  ).toBeVisible();
  await addReel(page, "Keep after recovery", "RECOVER", "");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Find recovery question", exact: true })
    .click();
  await expect(
    page.getByText("My first dream car?", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Your recovery answer", { exact: true })
    .fill("  BUGATI!!  ");
  await page.getByLabel("New password", { exact: true }).fill(updated);
  await page.getByLabel("Confirm new password", { exact: true }).fill(updated);
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.locator(".success-text")).toContainText("Password reset");
  await page.getByLabel("Password or PIN", { exact: true }).fill(updated);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Keep after recovery", exact: true }),
  ).toBeVisible();
  await openProfileItem(page, "Account Security");
  await page
    .getByRole("button", { name: "Account recovery", exact: true })
    .click();
  await page.getByLabel("Current password", { exact: true }).fill(updated);
  await page.getByLabel("Enable recovery question").uncheck();
  await page
    .getByRole("button", { name: "Disable recovery", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const state = await page.evaluate(
    async (username) =>
      (
        await fetch("/api/auth/recovery/question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        })
      ).json(),
    name,
  );
  expect(state.question).toBeNull();
});

test("pins reorder the grid, stars filter favorites, and both flags survive reload and work on phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await register(page);
  await addReel(page, "Older inspiration", "PIN_OLD", "");
  await addReel(page, "Latest inspiration", "PIN_NEW", "");
  await expect(
    page.getByRole("article").first().getByRole("heading"),
  ).toHaveText("Latest inspiration");
  await page
    .getByRole("button", { name: "Pin Older inspiration", exact: true })
    .click();
  await expect(
    page.getByRole("article").first().getByRole("heading"),
  ).toHaveText("Older inspiration");
  await page
    .getByRole("button", { name: "Favorite Older inspiration", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Unfavorite Older inspiration",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Pinned", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("article").first().getByRole("heading"),
  ).toHaveText("Older inspiration");
  await expect(
    page.getByRole("button", { name: "Unpin Older inspiration", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await selectFilter(page, "Favorites");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Unfavorite Older inspiration", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Filter Favorites", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await selectFilter(page, "Pinned");
  await page
    .getByRole("button", { name: "Unpin Older inspiration", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Filter Pinned", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("30 avatars, profile syncing, public password hints, clean header and branded FAB", async ({
  page,
}) => {
  const name = username();
  await page.goto("/");
  await page.getByRole("button", { name: "Sign Up", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page.getByLabel("Password or PIN", { exact: true }).fill(secret);
  await page.getByText("Choose your avatar", { exact: true }).click();
  await expect(
    page.getByRole("group", { name: "30 pixel avatars" }).getByRole("button"),
  ).toHaveCount(30);
  await page
    .getByRole("button", { name: "Choose Wizard avatar", exact: true })
    .click();
  await page
    .getByLabel("Password hint (optional)", { exact: true })
    .fill("My original road trip clue");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".reel-fab")).toBeVisible();
  await expect(page.locator(".reel-fab")).toHaveCSS(
    "background-color",
    "rgb(181, 243, 109)",
  );
  const header = page.getByRole("banner");
  await expect(header.getByRole("button")).toHaveCount(1);
  await expect(header.getByRole("button", { name: "Add Reel" })).toHaveCount(0);
  await expect(header.getByRole("combobox")).toHaveCount(0);
  await expect(header.locator(".header-actions img")).toHaveAttribute(
    "src",
    /seed=pixel_wizard/,
  );
  await openProfileItem(page, "Profile");
  await page.getByText("Choose your avatar", { exact: true }).click();
  await page
    .getByRole("button", { name: "Choose Cyber bot avatar", exact: true })
    .click();
  await page.getByLabel("Display name", { exact: true }).fill("Pixel Rider");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByText("Profile saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await openProfileItem(page, "Account Security");
  await page
    .getByLabel("Password hint (optional)", { exact: true })
    .fill("My updated road trip clue");
  await page
    .getByRole("button", { name: "Save password hint", exact: true })
    .click();
  await expect(
    page.getByText("Password hint saved.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("banner").locator(".header-actions img"),
  ).toHaveAttribute("src", /seed=pixel_cyber_bot/);
  await expect(page.locator(".sidebar-account img")).toHaveAttribute(
    "src",
    /seed=pixel_cyber_bot/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".reel-fab")).toBeVisible();
  await openProfileItem(page, "Sign Out");
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Find recovery question", exact: true })
    .click();
  await expect(
    page.getByText("Password hint: My updated road trip clue", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reset password", exact: true }),
  ).toBeDisabled();
});

test("keyboard profile menu, cloud appearance controls, password change and switch account", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const name = await register(page);
  await addReel(page, "Appearance reel", "APPEAR");
  const trigger = page.getByRole("button", {
    name: "Open profile menu",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Profile", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Account Security", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await openProfileItem(page, "Appearance & Settings");
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await page.getByLabel("Desktop grid", { exact: true }).selectOption("5");
  await page
    .getByLabel("Card spacing", { exact: true })
    .selectOption("compact");
  await page.getByLabel("Accent color", { exact: true }).fill("#8a65ee");
  await page
    .getByRole("button", { name: "Save appearance", exact: true })
    .click();
  await expect(
    page.getByText("Appearance saved.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".reel-fab")).toHaveCSS(
    "background-color",
    "rgb(138, 101, 238)",
  );
  await expect(page.locator(".reel-grid")).toHaveCSS("gap", "12px");
  expect(
    await page
      .locator(".reel-grid")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(5);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".reel-fab")).toHaveCSS(
    "background-color",
    "rgb(138, 101, 238)",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .locator(".reel-grid")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(1);
  await openProfileItem(page, "Account Security");
  await page.getByLabel("Current password", { exact: true }).fill(secret);
  await page
    .getByLabel("New password", { exact: true })
    .fill("Updated-test-9876");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Updated-test-9876");
  await page
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await openProfileItem(page, "Switch Account");
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page
    .getByLabel("Password or PIN", { exact: true })
    .fill("Updated-test-9876");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Appearance reel", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
