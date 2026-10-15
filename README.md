# Reelbag

A minimal Instagram Reel library built with Next.js 16 App Router, React 19, Tailwind CSS, and Lucide. One Master PIN opens your library. Save reels, find them by title, and organize them in folders with optional 4-digit PINs.

## Development

Use Node.js 22 LTS (Node.js >=20.9 is supported). No database, API keys, or environment variables are required.

```sh
npm ci
npm run dev
```

Create a 4–8 digit Master PIN on first launch. Reloading or using Lock app always requires the Master PIN again. HTTPS or localhost is required for Web Crypto PIN hashing.

```sh
npm run lint
npm test
npm run build
npm start
```

## Use

- The header contains the app title, search, folder controls, Add Reel, settings, and lock. There is no sidebar, banner, activity metadata, or profile switcher.
- Add Reel has three fields: Instagram Reel Link, Title / Name, and optional Folder. Create New Folder opens the folder form inline without losing your reel draft.
- Reels without a folder appear directly in All reels, without a category label. Search filters titles in the selected folder or across the visible stream.
- Use the folder dropdown to open a folder. The adjacent icons create, edit, or lock a folder. Editing supports renaming, adding/changing a PIN, removing protection, and deletion.
- Folder PINs are exactly four digits. Locked folder reels are omitted from the stream and search, and their embed containers are not rendered. Unlocking a folder makes it available until you lock it, lock the app, reload, or another tab changes the library. Creating a protected folder unlocks it for the current session.
- Saving a reel into a locked folder does not unlock that folder. Deleting a folder moves its reels into the main stream and removes their folder protection, with explicit confirmation.
- Settings supports changing the Master PIN and JSON export/import. Imports require confirmation and replace the entire library, including all PINs. Invalid backups leave existing data unchanged.

## Existing libraries

The app uses the `reelbag.v2` localStorage key. When only the old `reelbag.v1` data exists, a one-time migration requires every existing PIN before combining the libraries and choosing a new Master PIN. All titles, reel links, and folder memberships are retained; duplicate IDs are remapped and duplicate folder names receive numbered suffixes. Old task metadata is removed from the new format. Add optional folder PINs after migration.

The original v1 browser entry is left untouched as a recovery copy. It can still contain old information; remove it manually only after verifying your migrated library and exporting a current backup. Older JSON backups follow the same verification and migration flow before import replaces the current library. Migration and imports never silently skip libraries with unavailable PINs.

## Privacy and persistence

Master and folder PINs use salted PBKDF2-SHA256 hashes with 210,000 iterations. Raw PINs are never saved. These locks protect the interface; data is **not encrypted**, and this is not server authentication. Anyone with browser storage access or a JSON backup can read the saved links and titles, including locked folders. Short PINs are vulnerable to offline guessing. There is no PIN recovery.

Your browser saves the library locally. Clearing browser data, using private browsing, or changing domains may remove or isolate it. Export backups to transfer between devices; there is no automatic sync. Writes are validated before saving; storage quota errors preserve the last saved state. Another-tab changes lock the UI, and revision checks reject stale writes. localStorage is not a transactional database for concurrent writers.

## Instagram embeds

Cards lazily load the official `https://www.instagram.com/embed.js` script near the viewport and trigger `window.instgrm.Embeds.process()`. Instagram controls the player, cookies, thumbnail, login requirements, and availability. Private, removed, or restricted reels may not display. Original links remain available; script failures include a Retry action. No Instagram login credentials are requested by Reelbag.

Managed cloud networks may need `www.instagram.com`, `*.cdninstagram.com`, and `*.fbcdn.net` allowed. The cloud policy used during initial development blocked live Instagram access; automated tests stub the script and separately test blocked-script fallbacks. Passing these tests does not prove that a particular live reel is playable.

Shared links are supported through `/?url=` with a URL-encoded Reel URL, or `?text=` containing a Reel link. Unlocking the app opens a prefilled Add Reel form; links are never saved without submission. This is not an installed native OS share target or offline PWA.

## Tests

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Set `CHROMIUM_PATH` to an existing Chromium binary to skip the browser download. Browser tests cover inline folder creation, reel/folder CRUD, Master and folder PINs, protected content exclusion, reloads, backups, migration, cross-tab locking, failed embeds, and grid layouts from 320 px to desktop. Tests use isolated browser storage and a dedicated production server on port 3100, leaving your development server alone.

## Vercel

Push this directory to GitHub and import it into Vercel using the Next.js preset and Node.js 22. Keep the default `npm run build` command. No environment variables or backend provisioning are necessary. Vercel supplies HTTPS. The build uses Next.js's supported webpack mode. Run `npm audit --omit=dev` and keep dependencies patched before deployment.

## Structure

```text
app/
  layout.js             Metadata and root document
  page.js               Single-library state, header, stream, and dialog routing
  globals.css           Dark theme and responsive layouts
components/
  FolderBar.jsx         Folder selection and actions
  FolderModal.jsx       Folder name and optional PIN
  MigrationWizard.jsx   One-time legacy verification and migration
  Modal.jsx             Accessible dialog and focus management
  PinForm.jsx           Master/folder PIN creation and verification
  ReelCard.jsx          Official Instagram embed and reel actions
  ReelModal.jsx         Three-field save/edit form
  SettingsPanel.jsx     Master PIN settings and backups
utils/storage.js        Versioned persistence, validation, hashing, migration
public/icon.svg         App icon
tests/                  Unit and browser tests
```
