# Reelbag

A responsive Instagram Reel catalog built with Next.js 16 App Router, React 19, Tailwind CSS, and Lucide. Create PIN-protected local profiles, organize reels into collections, track progress, and transfer your library with JSON backups. The original Next.js 14 requirement was upgraded with approval because that line has unpatched security advisories.

## Run locally

Use Node.js 22 LTS and npm. No database, API key, or environment variables are required.

```sh
npm ci
npm run dev
```

Open the development server in a browser. Create a profile with a 4–8 digit PIN, create a collection, and save an Instagram Reel URL with a title. The title and your notes are searchable. Instagram provides the official caption, creator, and player within its embed; the app does not scrape Instagram or copy the caption into your local search index.

```sh
npm run lint
npm test
npm run build
npm start
```

The production start command uses port 3000 by default (`PORT` can override it). PIN hashing requires HTTPS or localhost. Opening a development server over plain HTTP on a LAN IP will not enable Web Crypto on most browsers.

## Deploy on Vercel

Push this directory to a GitHub repository and import it into Vercel. Select the Next.js framework preset, use Node.js 22, and keep the default `npm run build` command. If this directory is nested in another repository, set Vercel’s Root Directory to this directory. There are no runtime secrets or database setup steps. Vercel supplies HTTPS.

Before deployment, run `npm audit --omit=dev` and keep the framework patched. A successful build is not a dependency security audit. Builds use Next.js’s supported webpack mode for a predictable build in restricted cloud environments.

## Data and PINs

- Each profile has independent folders, reels, and a salted PBKDF2-SHA256 PIN hash (210,000 iterations). The original PIN is never saved. Profiles lock when the page reloads or you select Switch profile.
- This is a multi-profile, browser-local application. It is not a server-authenticated multi-tenant service. Data is not encrypted; users with browser storage access or a backup can read all profiles. Short PINs are vulnerable to offline guessing. Do not store sensitive material here.
- Local data is stored under `reelbag.v1` in localStorage. Writes are validated and acknowledged only after they succeed. Storage failures are displayed, and the current page retains the last saved state. Another-tab changes lock the profile; revision checks reject stale writes. Browser storage cannot provide fully transactional cross-tab writes.
- Export JSON Backup includes all profiles and their PIN hashes. Keep backups private. Import validates sizes, IDs, relationships, status values, credentials, and Instagram URLs, then asks for confirmation before replacing the whole dataset. Import does not merge or reset PINs. There is no PIN recovery.
- Deleting a collection moves its reels to Unfiled. Deleting a profile removes its entire library. Destructive actions require confirmation.
- Back up before clearing browser data, changing domains, or switching devices. There is no cloud sync, telemetry, or backend database. Private browsing may discard data when the session closes. Each origin/browser has its own library.

## Instagram embeds

Cards load the official `https://www.instagram.com/embed.js` script near the viewport and call `window.instgrm.Embeds.process()`. Instagram controls iframe content, login requirements, cookies, and playback. Private, removed, restricted, or embed-disabled reels may not display. Every card includes an original link, and script failures include Retry. No Instagram credentials are required or stored.

The official embed script and its iframe may require network access to `www.instagram.com` and Instagram/Meta CDN domains in managed environments. Instagram can change its CDN destinations. Fallback links remain usable when third-party embeds are blocked. The grid uses one column on mobile, two on small tablets, three on larger screens, and four from 1440 px. Instagram’s iframe layout is controlled by Instagram.

## Mobile saving

The Help dialog includes iOS Shortcuts instructions and Android Copy link instructions. A deployed URL supports `/?url=` with a URL-encoded Instagram Reel link (or `?text=` containing a Reel URL). Unlock a profile to open the prefilled Add Reel dialog. A link is saved only when the user submits that form. This app does not claim native OS share-target or offline PWA support.

## Validation

`npm test` exercises PIN hashing, URL validation, backup validation, import limits, and storage conflict/quota handling. Browser tests exercise profile isolation, CRUD, filters, backup round trips, reload persistence, and responsive navigation against the production server.

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

To use a preinstalled Chromium binary, set `CHROMIUM_PATH` to its absolute path when running the browser tests. The browser suite stubs Instagram’s script to test app behavior deterministically; it does not prove that a live Instagram reel is publicly playable.

## Structure

```text
app/                  App Router layout, dashboard, styles
components/           Accessible dialogs, account/folder/reel forms, Instagram card
utils/storage.js      Persistence, backup validation, URLs, PBKDF2
public/icon.svg       Application icon
tests/                Unit and browser tests
```

No build outputs, dependency folders, user data, or secret values belong in Git. The lockfile is included for repeatable installs.
