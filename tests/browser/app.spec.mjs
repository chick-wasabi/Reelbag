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
    .getByLabel("Instagram Reel or Post Link")
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
async function folderAction(page, name, action) {
  await page
    .getByRole("button", { name: `Folder actions for ${name}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
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
    .getByLabel("Instagram Reel or Post Link")
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
  await folderAction(page, "Bike Riding", "Rename Folder");
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
  for (const width of [320, 390, 640, 768, 1024, 1280, 1536]) {
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
      width < 640 ? 1 : width < 1024 ? 2 : width < 1280 ? 3 : 4,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/reelbag-cloud-mobile.png",
    fullPage: true,
  });
  await selectFilter(page, "Bike Edits");
  await expect(
    page.getByRole("heading", { name: "Bike Edits", exact: true }),
  ).toBeVisible();
  await folderAction(page, "Bike Edits", "Delete Folder");
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
    await openProfileItem(page, "Sign Out");
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
    await folderAction(other, "Pranks", "Lock Folder");
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
    .getByLabel("Instagram Reel or Post Link")
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
  ).toHaveCount(0);
  await expect(sidebar.locator(".sidebar-count")).toHaveCount(3);
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
  await page
    .locator("#main-content")
    .evaluate((el) =>
      Promise.all(
        el
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
  const clip = card.locator(".embed-viewport");
  const shell = card.locator(".embed-shell");
  const clipped = await clip.boundingBox();
  const shellBox = await shell.boundingBox();
  const frame = await iframe.boundingBox();
  const cardBox = await card.boundingBox();
  expect(Math.abs(clipped.width - (cardBox.width - 2))).toBeLessThan(1);
  expect(clipped.height).toBeLessThanOrEqual(460);
  await expect(clip).toHaveCSS("overflow", "hidden");
  expect(shellBox.y).toBe(clipped.y - 10);
  expect(frame.y).toBe(shellBox.y - 50);
  expect(Math.abs(frame.height - shellBox.height - 210)).toBeLessThan(1);
  for (const width of [390, 768, 1536]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(clip).toHaveCSS("height", width < 768 ? "430px" : "460px");
    await expect(shell).toHaveCSS("height", width < 768 ? "450px" : "480px");
    const viewportBox = await clip.boundingBox();
    const embedBox = await shell.boundingBox();
    const iframeBox = await iframe.boundingBox();
    expect(embedBox.y).toBe(viewportBox.y - 10);
    expect(embedBox.height - viewportBox.height).toBe(20);
    expect(iframeBox.y).toBe(embedBox.y - 50);
    expect(iframeBox.height - embedBox.height).toBe(210);
  }
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
  await expect(
    page.getByRole("heading", { name: "All Reels", exact: true }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: "Settings", exact: true }),
  ).toHaveCount(0);
  await expect(
    sidebar.getByRole("button", { name: "Sign out", exact: true }),
  ).toHaveCount(0);
  const toggleIcon = await sidebar
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .locator("svg")
    .boundingBox();
  const navIcon = await sidebar
    .getByRole("button", { name: "All Reels", exact: true })
    .locator("svg")
    .boundingBox();
  expect(
    Math.abs(
      toggleIcon.x + toggleIcon.width / 2 - navIcon.x - navIcon.width / 2,
    ),
  ).toBeLessThan(1);
  await expect(sidebar.locator(".sidebar-toggle")).toHaveCSS(
    "position",
    "static",
  );

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
    "https://www.instagram.com/reel/REMAKE/embed/?autoplay=1&muted=0",
  );
  await expect(
    player.getByRole("button", { name: "Pause video", exact: true }),
  ).toBeVisible();
  const replayRequest = page.waitForRequest(
    (request) =>
      request.url() ===
      "https://www.instagram.com/reel/REMAKE/embed/?autoplay=1&muted=0",
  );
  await card
    .getByRole("button", { name: "Replay Video to remake", exact: true })
    .click();
  await replayRequest;
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
  ).toHaveCount(0);
  await expect(
    sidebar
      .getByRole("button", { name: "Open folder Remakes", exact: true })
      .locator(".sidebar-count"),
  ).toHaveCount(0);
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
  await openProfileItem(page, "Sign Out");
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
  await expect(
    page.getByRole("heading", { name: "Pinned Reels", exact: true }),
  ).toBeVisible();
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
  await expect(
    page.getByRole("heading", { name: "Favorites", exact: true }),
  ).toBeVisible();
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
  await expect(header.getByRole("button")).toHaveCount(2);
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
  await expect(page.locator(".sidebar-account")).toHaveCount(0);
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
  const legacySave = await page.evaluate(
    async () =>
      (
        await fetch("/api/account/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appearance: {
              theme: "dark",
              accent: "#b5f36d",
              columns: "5",
              spacing: "compact",
            },
          }),
        })
      ).status,
  );
  expect(legacySave).toBe(200);
  await page.reload();
  await expect(page.locator(".reel-grid")).toHaveCSS("gap", "24px");
  await expect
    .poll(() =>
      page
        .locator(".reel-grid")
        .evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
        ),
    )
    .toBe(4);

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
  await expect(page.getByLabel("Desktop grid", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Card spacing", { exact: true })).toHaveCount(0);
  await expect(page.locator('input[type="color"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "Use Electric Blue", exact: true })
    .click();
  await expect(page.getByLabel("Accent color", { exact: true })).toHaveValue(
    "#3b82f6",
  );
  await page.getByLabel("Accent color", { exact: true }).fill("#zz");
  await expect(
    page.getByRole("button", { name: "Save appearance", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".reel-fab")).toHaveCSS(
    "background-color",
    "rgb(59, 130, 246)",
  );
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
  await expect(page.locator(".reel-grid")).toHaveCSS("gap", "24px");
  expect(
    await page
      .locator(".reel-grid")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(4);
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
  await page.getByRole("button", { name: /Add another account/i }).click();
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

test("accent previews recolor outlined logos, sidebar, favicon, buttons and focus rings and cancel cleanly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await register(page);
  await folder(page, "Theme folder");
  await selectFilter(page, "All reels");
  await openProfileItem(page, "Appearance & Settings");
  for (const [hex, rgb] of [
    ["#3b82f6", "rgb(59, 130, 246)"],
    ["#a855f7", "rgb(168, 85, 247)"],
  ]) {
    await page.getByLabel("Accent color", { exact: true }).fill(hex);
    await expect(page.locator(".reel-fab")).toHaveCSS("background-color", rgb);
    for (const scope of [".sidebar", ".mobile-brand"]) {
      await expect(page.locator(`${scope} .logo-bookmark`)).toHaveCSS(
        "fill",
        rgb,
      );
      await expect(page.locator(`${scope} .logo-frame`)).toHaveCSS(
        "stroke",
        rgb,
      );
      await expect(page.locator(`${scope} .logo-frame`)).toHaveCSS(
        "fill",
        "rgb(16, 18, 20)",
      );
      await expect(page.locator(`${scope} .logo-play`)).toHaveCSS(
        "fill",
        "rgb(16, 18, 20)",
      );
      await expect(page.locator(`${scope} .brand-dot`)).toHaveCSS("color", rgb);
    }
    await expect(page.locator(".sidebar .folder-link > svg")).toHaveCSS(
      "stroke",
      rgb,
    );
    await expect(page.locator(".sidebar-link.active .sidebar-count")).toHaveCSS(
      "background-color",
      rgb,
    );
    await expect(
      page.getByRole("button", { name: "Save appearance", exact: true }),
    ).toHaveCSS("background-color", rgb);
    await page.getByLabel("Theme", { exact: true }).focus();
    await expect(page.getByLabel("Theme", { exact: true })).toHaveCSS(
      "outline-color",
      rgb,
    );
    expect(
      await page
        .locator(".sidebar")
        .evaluate((el) => getComputedStyle(el, "::before").backgroundImage),
    ).toContain(rgb.slice(4, -1));
    const favicon = await page
      .locator('link[data-reelbag-theme="true"]')
      .getAttribute("href");
    expect(decodeURIComponent(favicon)).toContain(`stroke="${hex}"`);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      hex,
    );
  }
  await page.screenshot({
    path: "/tmp/reelbag-purple-preview.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openProfileItem(page, "Appearance & Settings");
  await page.getByLabel("Accent color", { exact: true }).fill("abc");
  await expect(page.locator(".reel-fab")).toHaveCSS(
    "background-color",
    "rgb(170, 187, 204)",
  );
  await page.locator(".modal-backdrop").click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".reel-fab")).toHaveCSS(
    "background-color",
    "rgb(181, 243, 109)",
  );
  const library = await page.evaluate(async () =>
    (await fetch("/api/library")).json(),
  );
  expect(library.user.appearance.accent).toBe("#b5f36d");
  await expect(page.locator('link[data-reelbag-theme="true"]')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await openProfileItem(page, "Appearance & Settings");
  await page.getByLabel("Accent color", { exact: true }).fill("#3b82f6");
  await expect(page.locator(".mobile-brand .logo-bookmark")).toHaveCSS(
    "fill",
    "rgb(59, 130, 246)",
  );
  await page
    .getByRole("button", { name: "Save appearance", exact: true })
    .click();
  await expect(
    page.getByText("Appearance saved.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await expect(page.locator(".mobile-brand .logo-bookmark")).toHaveCSS(
    "fill",
    "rgb(59, 130, 246)",
  );
  await openProfileItem(page, "Sign Out");
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await expect(page.locator(".brand-mark .logo-bookmark")).toHaveCSS(
    "fill",
    "rgb(181, 243, 109)",
  );
});

test("username invitations notify recipients, accepted folders respect roles, and owners can revoke access", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await register(page);
  await folder(page, "Crew edits");
  await addReel(page, "Owner inspiration", "SHARE_OWNER");
  const friendContext = await browser.newContext({
    viewport: { width: 1536, height: 1000 },
  });
  await connect(friendContext);
  const friend = await friendContext.newPage();
  try {
    const friendName = await register(friend);
    await folderAction(page, "Crew edits", "Share Folder");
    await page.getByLabel("Reelbag username", { exact: true }).fill(friendName);
    await page
      .getByLabel("Access role", { exact: true })
      .selectOption("collaborator");
    await page
      .getByRole("button", { name: "Send Invite", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("status")).toContainText(
      "Invitation sent",
    );
    await friend.evaluate(() => window.dispatchEvent(new Event("focus")));
    await friend
      .getByRole("button", { name: "Notifications, 1 unread", exact: true })
      .click();
    await expect(friend.getByText(/invited you to collaborate/)).toBeVisible();
    await friend
      .getByRole("button", { name: "Accept Crew edits", exact: true })
      .click();
    await expect(
      friend.getByRole("button", {
        name: "Open shared folder Crew edits",
        exact: true,
      }),
    ).toBeVisible();
    await friend
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await friend
      .getByRole("button", {
        name: "Open shared folder Crew edits",
        exact: true,
      })
      .click();
    await expect(
      friend.getByRole("heading", { name: "Crew edits", exact: true }),
    ).toBeVisible();
    await expect(
      friend.getByRole("heading", { name: "Owner inspiration", exact: true }),
    ).toBeVisible();
    await expect(
      friend.getByLabel("Actions for Owner inspiration", { exact: true }),
    ).toHaveCount(0);
    await friend
      .getByRole("button", {
        name: "Folder actions for Crew edits",
        exact: true,
      })
      .click();
    await expect(
      friend.getByRole("menuitem", { name: "Rename Folder", exact: true }),
    ).toHaveCount(0);
    await expect(
      friend.getByRole("menuitem", { name: "Share Folder", exact: true }),
    ).toHaveCount(0);
    await expect(
      friend.getByRole("menuitem", { name: "Delete Folder", exact: true }),
    ).toHaveCount(0);
    await friend.keyboard.press("Escape");
    await addReel(friend, "Friend contribution", "SHARE_FRIEND");
    await expect(
      friend.getByRole("heading", { name: "Friend contribution", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: `Revoke ${friendName}`, exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("status")).toHaveText(
      "Access revoked.",
    );
    await friend.reload();
    await expect(
      friend.getByRole("button", {
        name: "Open shared folder Crew edits",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(friend.getByRole("article")).toHaveCount(0);
  } finally {
    await friendContext.close();
  }
});

test("secret links keep previews private, return through login, join read-only, and can be disabled", async ({
  page,
  browser,
}) => {
  await register(page);
  await folder(page, "Link-only folder");
  await addReel(page, "Hidden until joined", "SECRET_REEL");
  await folderAction(page, "Link-only folder", "Share Folder");
  await page
    .getByRole("button", { name: "Copy Secret Link", exact: true })
    .click();
  const urlInput = page.getByLabel("Secret share URL", { exact: true });
  await expect(urlInput).toBeVisible();
  const link = await urlInput.inputValue();
  expect(link).toMatch(/\/share\/folder\/[a-f0-9-]{36}$/);
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await connect(guestContext);
  const guest = await guestContext.newPage();
  try {
    await guest.goto(link);
    await expect(
      guest.getByRole("link", { name: "Log In or Sign Up", exact: true }),
    ).toBeVisible();
    await expect(
      guest.getByText("Hidden until joined", { exact: true }),
    ).toHaveCount(0);
    await expect(guest.locator("iframe")).toHaveCount(0);
    await guest
      .getByRole("link", { name: "Log In or Sign Up", exact: true })
      .click();
    await guest.getByRole("button", { name: "Sign Up", exact: true }).click();
    await guest.getByLabel("Username", { exact: true }).fill(username());
    await guest.getByLabel("Password or PIN", { exact: true }).fill(secret);
    await guest
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(guest).toHaveURL(link);
    await expect(
      guest.getByRole("button", { name: "Join as viewer", exact: true }),
    ).toBeVisible();
    await expect(guest.getByRole("article")).toHaveCount(0);
    await guest
      .getByRole("button", { name: "Join as viewer", exact: true })
      .click();
    await expect(
      guest.getByRole("heading", { name: "Hidden until joined", exact: true }),
    ).toBeVisible();
    await expect(
      guest.getByLabel("Actions for Hidden until joined", { exact: true }),
    ).toHaveCount(0);
    expect(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Disable secret link", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("status")).toHaveText(
      "Secret link disabled.",
    );
    await guest.reload();
    await expect(
      guest.locator(".share-intro").getByRole("alert"),
    ).toContainText("revoked");
    await expect(guest.getByRole("article")).toHaveCount(0);
  } finally {
    await guestContext.close();
  }
});

test("owned and shared folders stay reachable in one sidebar scroll region with persistent view context", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const recipient = await register(page);
  const statuses = await page.evaluate(async () => {
    const results = [];
    for (let i = 1; i <= 24; i++)
      results.push(
        (
          await fetch("/api/folders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: `Folder ${String(i).padStart(2, "0")}`,
              protected: false,
            }),
          })
        ).status,
      );
    return results;
  });
  expect(statuses.every((status) => status === 201)).toBe(true);
  const ownerContext = await browser.newContext();
  await connect(ownerContext);
  const owner = await ownerContext.newPage();
  try {
    await register(owner);
    const inviteStatus = await owner.evaluate(async (username) => {
      const folder = await (
        await fetch("/api/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Shared navigation", protected: false }),
        })
      ).json();
      return (
        await fetch(`/api/sharing/folder/${folder.folderId}/invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, role: "viewer" }),
        })
      ).status;
    }, recipient);
    expect(inviteStatus).toBe(200);
    const accepted = await page.evaluate(async () => {
      const notifications = await (await fetch("/api/notifications")).json();
      return (
        await fetch(`/api/notifications/${notifications.items[0].id}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "accepted" }),
        })
      ).status;
    });
    expect(accepted).toBe(200);
    await page.reload();
    const folders = page.locator(".sidebar-folders");
    await expect(
      folders.getByRole("button", { name: /^Open (shared )?folder / }),
    ).toHaveCount(25);
    await expect(folders.locator(".sidebar-count")).toHaveCount(0);
    expect(
      await folders.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    await page
      .getByRole("button", {
        name: "Open shared folder Shared navigation",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Shared navigation", exact: true }),
    ).toBeVisible();
    expect(await folders.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(
      page.getByRole("button", { name: "All Reels", exact: true }),
    ).toBeInViewport();
    await page
      .getByRole("button", { name: "Open folder Folder 01", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Folder 01", exact: true }),
    ).toBeVisible();
    await selectFilter(page, "All reels");
    await addReel(page, "Context count", "CONTEXT_COUNT", "");
    await expect(
      page.getByLabel("1 reel in this view", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("searchbox", { name: "Search reels" })
      .fill("no matching reel");
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(
      page.getByLabel("1 reel in this view", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const heading = await page.locator(".section-heading").boundingBox();
    const search = await page
      .getByRole("searchbox", { name: "Search reels" })
      .boundingBox();
    expect(heading.y + heading.height).toBeLessThan(search.y);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(
      page.getByRole("heading", { name: "All Reels", exact: true }),
    ).toBeInViewport();
  } finally {
    await ownerContext.close();
  }
});

test("folder context menus manage inactive folders without navigation and deletion keeps reels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await register(page);
  await folder(page, "Bike");
  await addReel(page, "Keep this reel", "KEEP_FOLDER_REEL");
  await folder(page, "Recipes");
  await expect(page.locator(".current-folder-name")).toHaveCount(0);
  await expect(page.locator(".stream-navigation")).toBeHidden();
  const trigger = page.getByRole("button", {
    name: "Folder actions for Bike",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Rename Folder", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Recipes", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await folderAction(page, "Bike", "Rename Folder");
  await page.getByLabel("Folder name", { exact: true }).fill("Bike Remakes");
  await page.getByRole("button", { name: "Save folder", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Recipes", exact: true }),
  ).toBeVisible();
  await folderAction(page, "Bike Remakes", "Delete Folder");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open folder Bike Remakes", exact: true }),
  ).toBeVisible();
  await folderAction(page, "Bike Remakes", "Delete Folder");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete folder", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recipes", exact: true }),
  ).toBeVisible();
  await selectFilter(page, "All reels");
  await expect(
    page.getByRole("heading", { name: "Keep this reel", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary").locator(".sidebar-count"),
  ).toHaveCount(3);
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await folderAction(page, "Recipes", "Rename Folder");
  await expect(page.getByLabel("Folder name", { exact: true })).toHaveValue(
    "Recipes",
  );
});

test("locked folder management resumes its action after PIN verification without switching views", async ({
  page,
}) => {
  await register(page);
  await folder(page, "Private edits", "4567");
  await addReel(page, "Protected idea", "PROTECTED_CONTEXT");
  await folderAction(page, "Private edits", "Lock Folder");
  await expect(
    page.getByRole("heading", { name: "All Reels", exact: true }),
  ).toBeVisible();
  await folderAction(page, "Private edits", "Rename Folder");
  await page.getByLabel("Folder PIN", { exact: true }).fill("4567");
  await page.getByRole("button", { name: "Open folder", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Rename folder", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Folder name", { exact: true }).fill("Private remakes");
  await page.getByRole("button", { name: "Save folder", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "All Reels", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Open folder Private remakes",
      exact: true,
    }),
  ).toBeVisible();
});

test("sharing actions follow the accent and report clipboard success without false positives", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          if (window.__rejectCopy) throw new Error("Clipboard unavailable");
          window.__copiedLink = value;
        },
      },
    });
  });
  await register(page);
  await folder(page, "Shimmer sharing");
  const saved = await page.evaluate(
    async () =>
      (
        await fetch("/api/account/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appearance: {
              theme: "dark",
              accent: "#3b82f6",
              columns: "auto",
              spacing: "comfortable",
            },
          }),
        })
      ).status,
  );
  expect(saved).toBe(200);
  await page.reload();
  await folderAction(page, "Shimmer sharing", "Share Folder");
  const username = page.getByLabel("Reelbag username", { exact: true });
  const invite = page.locator(".invite-button");
  await expect(invite).not.toHaveClass(/is-ready/);
  await expect(invite).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(invite).toHaveCSS("border-color", "rgb(59, 130, 246)");
  await expect(invite).toHaveCSS("color", "rgb(59, 130, 246)");
  expect(
    await invite.evaluate(
      (el) => getComputedStyle(el, "::before").animationName,
    ),
  ).toBe("none");
  await username.fill("   ");
  await expect(invite).not.toHaveClass(/is-ready/);
  await username.fill("friend_username");
  await expect(invite).toHaveClass(/is-ready/);
  await expect(invite).toHaveCSS("background-color", "rgb(59, 130, 246)");
  await expect(invite).toHaveCSS("color", "rgb(15, 23, 42)");
  expect(
    await invite.evaluate(
      (el) => getComputedStyle(el, "::before").animationName,
    ),
  ).toBe("secret-link-shimmer");
  const button = page.locator(".secret-link-button");
  await expect(button).toHaveCSS("background-color", "rgb(59, 130, 246)");
  expect(
    await button.evaluate(
      (el) => getComputedStyle(el, "::before").animationName,
    ),
  ).toBe("secret-link-shimmer");
  await button.click();
  await expect(button).toHaveText("✓ Link Copied!");
  await expect(button).toHaveClass(/is-copied/);
  const copied = await page.evaluate(() => window.__copiedLink);
  await expect(
    page.getByLabel("Secret share URL", { exact: true }),
  ).toHaveValue(copied);
  expect(copied).toMatch(/\/share\/folder\/[a-f0-9-]{36}$/);
  await expect(button).toHaveText("Copy Secret Link", { timeout: 5000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await invite.evaluate(
      (el) => getComputedStyle(el, "::before").animationName,
    ),
  ).toBe("none");
  expect(
    await button.evaluate(
      (el) => getComputedStyle(el, "::before").animationName,
    ),
  ).toBe("none");
  await page.evaluate(() => {
    window.__rejectCopy = true;
  });
  await button.click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Select and copy",
  );
  await expect(button).toHaveText("Copy Secret Link");
  await expect(button).not.toHaveClass(/is-copied/);
});

test("motion preserves players across filters, keeps avatars still, and honors reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await register(page);
  await addReel(page, "Motion inspiration", "MOTION_REEL", "");
  await page
    .getByRole("button", { name: "Favorite Motion inspiration", exact: true })
    .click();
  const frame = page.locator("iframe.reel-iframe");
  await frame.evaluate((element) => {
    window.__motionPlayer = element;
  });
  const avatar = page.locator(".avatar-button .profile-avatar");
  await expect(avatar).not.toHaveAttribute("data-motion", /.+/);
  await expect(avatar.locator(".profile-avatar-art")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  expect(
    await frame.evaluate((element) => element === window.__motionPlayer),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Favorites", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator(".reel-fab")
      .evaluate((el) => getComputedStyle(el, "::before").animationDuration),
  ).toBe("12s");
  const glass = await page.locator(".reel-card").evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      edges: [
        style.borderTopColor,
        style.borderLeftColor,
        style.borderRightColor,
        style.borderBottomColor,
      ],
      backdrop: style.backdropFilter,
      shadow: style.boxShadow,
    };
  });
  expect(new Set(glass.edges).size).toBe(1);
  expect(glass.backdrop).toContain("blur");
  expect(glass.shadow).toContain("rgba(0, 0, 0, 0.3)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".reel-fab")
      .evaluate((el) => getComputedStyle(el, "::before").animationName),
  ).toBe("none");
  await expect(page.locator(".sidebar")).toHaveCSS("transition-duration", "0s");
  await page.getByRole("button", { name: "All Reels", exact: true }).click();
  expect(
    await page
      .locator("#main-content")
      .evaluate((el) => el.getAnimations().length),
  ).toBe(0);
  expect(
    await frame.evaluate((element) => element === window.__motionPlayer),
  ).toBe(true);
});
