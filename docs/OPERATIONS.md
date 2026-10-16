# Reelbag development & operations

Setup, deployment, data behavior, security, and validation details for maintainers.

[← Product showcase](../README.md)

## Configure and run

Use Node.js 22 LTS. Create a database at [Neon](https://console.neon.tech), choose **Connect**, and copy the **Postgres connection string** into the `DATABASE_URL` variable in `.env.local`. `.env.example` documents the required name; it intentionally contains no credential. Never commit a real connection string or use a `NEXT_PUBLIC_` variable for it.

```sh
npm ci
npm run db:migrate
npm run dev
```

`db:migrate` reads `.env.local` automatically. The first database-backed API request also initializes the tables, so no manual SQL is necessary. Initialization takes a Postgres advisory lock and applies additive, idempotent DDL in one transaction. The Neon role must have CREATE permission in its schema as well as normal read/write permissions. Existing unrelated tables are never dropped. A pre-existing incompatible schema requires an explicit migration; initialization will not silently rewrite it.

The app builds without a connection string. Without a usable `DATABASE_URL`, live account and database operations return a clear 503, and no data is saved locally as a fallback. No additional session secret is needed: opaque session tokens are random and only SHA-256 token hashes are stored in Postgres.

## Deploy to Vercel

1. Import this GitHub repository with the Next.js framework preset and Node.js 22.
2. In **Project Settings → Environment Variables**, add your Neon connection string as `DATABASE_URL` for the intended Production/Preview environments. Use a separate Neon database or branch for previews when data isolation is required.
3. Deploy or redeploy after changing environment variables. Keep the default `npm run build` command.
4. Open the HTTPS site, sign up, save a reel, then log in on a second device to verify the same library. Secure production cookies require HTTPS.

Managed cloud environments need network access to the connection string's Neon hostname over HTTPS. The Neon serverless driver uses encrypted HTTP queries; no WebSocket server or local Postgres daemon is required. Instagram embeds additionally use `www.instagram.com` and Instagram/Meta CDNs. Avatar images load from `api.dicebear.com`; an icon fallback appears when they cannot load.

## Accounts and security

- Usernames are case-insensitive and unique: 3–32 letters, digits, or underscores. Passwords/PINs require at least 8 characters and at most 72 UTF-8 bytes, avoiding bcrypt truncation. An 8-digit PIN is allowed, though a strong password is recommended.
- Passwords and four-digit folder PINs are bcrypt-hashed with cost 12 on the server. Hashes and database credentials are never returned in account/library responses.
- Login creates a random 256-bit opaque cookie token. Postgres stores only its SHA-256 hash. Cookies are HttpOnly, SameSite=Lax, host-only, and Secure with a `__Host-` prefix in production. Sessions expire after 30 days. Each device signs in separately; signing out deletes only that device's session and folder grants.
- Every request derives the user from its session. Ownership is checked on the server for reads and writes. A composite foreign key also prevents linking a reel to another user's folder. Protected folder reels are excluded in SQL, not simply hidden by CSS.
- Folder unlock grants belong to the current session. They survive page reloads and expire when that session expires or signs out. Changing/removing a folder PIN invalidates other sessions' grants by advancing the folder's protection version. Lock folder revokes this session's grant.
- Parameterized queries prevent SQL injection. Mutations require a matching Origin and reject cross-site requests; API responses use no-store caching. Request size, field length, URLs, and IDs are validated server-side.
- Authentication and PIN attempt throttles live in Postgres, so they work across serverless instances. Auth allows 10 attempts per username and 50 per client IP in 15 minutes; successful login resets that username's counter. Folder unlocks allow 10 attempts per account/folder in 15 minutes and reset after success. A trusted reverse proxy must control `x-real-ip`/`x-forwarded-for`; Vercel supplies forwarding headers.
- Optional account recovery can be enabled at signup or configured in **avatar menu → Account Security → Account recovery**, which requires the current password. Choose a preset or custom question. Answers are normalized for case, accents, spacing, and punctuation, then stored as salted scrypt hashes, including position-indexed deletion fingerprints; plaintext answers are never stored. Answers with at least six normalized characters accept one missing, extra, or substituted character (for example, `bugati` for `bugatti`); shorter answers require an exact normalized match. Recovery questions are public to someone who knows the username, so choose an answer others cannot guess.
- Signup and Profile offer 30 seeded DiceBear Pixel Art avatars. Only the fixed picker URLs are accepted by the API. The selected `users.avatar_url` syncs across sessions/devices and appears in the top-right profile menu. Existing users receive the default Hero avatar through an additive migration.
- An optional password hint (up to 160 characters) can be set at signup or in Account Security. It is deliberately visible on recovery to anyone who knows the username, even if no recovery question was configured; never include a password or recovery answer. A hint alone cannot authorize a reset. Hints are stored as text, excluded from backups, and cleared after a successful password reset because the old clue is obsolete.
- Recovery resets allow five attempts per username per 15 minutes, with additional username/IP limits. A successful reset revokes every existing session and folder unlock; sign in again with the new password. Recovery is unavailable unless explicitly configured.
- Folder PINs restrict application access, not database administrators or someone who already has an unlocked session. There is no end-to-end encryption, email verification or administrator UI in this version. Never store highly sensitive material here.

## Data model and behavior

`users`, `folders`, and `reels` contain the requested ownership and timestamp fields. `folders.pin_code` stores a bcrypt hash, never plaintext. Supporting `sessions`, `folder_unlocks`, and `rate_limits` tables provide server-enforced authentication and protection. `folders.pin_version` invalidates obsolete grants. Additive migrations add `users.avatar_url`, `users.password_hint`, `users.display_name`, a validated JSONB `users.appearance` object, nullable `users.security_question` / `security_answer` fields and default-false `reels.is_pinned` / `is_favorite` flags without changing existing records. The security-answer field contains only the hashed recovery representation. SQL definitions live in `lib/server/schema.mjs`.

Folders and reels are fetched from Postgres after login. Saves update the displayed library after the database confirms the write; failed saves leave the draft available. The dashboard refreshes when focused and every 30 seconds while visible, so changes made on another device appear without a new login. This is polling, not realtime push.

Pin and star controls persist per account across devices. Pinned reels appear first; Pinned and Favorites filters are available in the sidebar and mobile filter tabs. Protected reels remain excluded until unlocked, including in these filters.

Add Reel has three fields: Instagram Reel Link, Title / Name, and optional Folder. Inline folder creation preserves the draft. Reels without a folder have no category label. Folder deletion retains its reels in the main stream and removes their folder protection, with confirmation. Reels saved into locked folders stay hidden until the folder is unlocked.

Display names are independent of immutable login usernames. Profile edits and appearance preferences sync through Postgres. Appearance changes preview instantly across inline logos, sidebar tints/icons/badges, focus rings, buttons, the tab favicon, and the browser theme color. Closing without saving restores the saved preferences; Save persists the preview to the account. Appearance supports dark/light themes, six preset swatches, and an inline hex field accepting three or six digits with an optional #. Invalid or incomplete colors preserve the last valid preview and cannot be saved. The grid always uses one/two/three/four columns at the default/sm/lg/xl breakpoints, 24 px gaps, and cards capped at 380 px. Legacy stored column and spacing preferences no longer affect layout. Signing out resets the UI to the default appearance until another account signs in. Switching accounts revokes this device’s session and returns to global login; it never mixes local profiles or libraries.

Account Security manages hints, optional recovery, and password changes. Password changes require the current password, use bcrypt, are rate-limited, atomically revoke other devices’ sessions, and clear the stale password hint while keeping this device signed in. Recovery resets continue to revoke all devices.

## Backups and previous browser libraries

Data & Backups exports portable v3 JSON backups of links, folder names, and pinned/favorite flags. Older backups without flags import with both flags off. Unlock every folder before exporting a complete library. Passwords, recovery credentials, and PIN hashes are never exported. Import **adds** to the current account in a transaction, remaps IDs, and numbers colliding folder names; it never replaces or deletes existing account data. Imported folders start **without PIN protection**. Protect them again after import. Files are validated and limited to 10 MB.

Use **Import previous browser library** in Data & Backups to explicitly copy the old local library from the same browser/domain. Previous v1/v2 JSON backup files are also accepted. Every old Master/profile/folder PIN is verified locally before importing that content. Original browser entries remain untouched; no credentials are copied into the new cloud account. The dashboard never uses localStorage for cloud data, sessions, or saving. Compatibility code in `utils/legacy.mjs` is read-only.

## Instagram and mobile

Custom titles appear above each video. The dark card banner retains the title, pin/star toggles, and an action menu for Edit Title, Move Folder, Delete, plus an always-available Replay button beneath the player. Actions remain accessible by keyboard and on touchscreens. Folder counts include accessible reels; locked folders show a lock instead of exposing a count.

Reel cards lazily render direct `https://www.instagram.com/reel/{shortcode}/embed/` iframes; they do not load the blockquote `embed.js` scanner. The iframe sandbox permits scripts, the embedded origin, and presentation, while withholding popup and top-navigation permissions even on clicks. Play/pause remain native iframe controls; there is no click overlay. **Replay** replaces the iframe in place with `?autoplay=1&muted=0` to request immediate playback without opening Instagram. Repeated clicks reload the same canonical URL without accumulating query parameters. **Open original** is an explicit external link in the banner.

The player viewport fills the card width with no inner side gutters. A rounded overflow-hidden viewport is 450 px high on phones and 480 px from the 768 px breakpoint. The full-width iframe is shifted up 50 px and extended by 210 px, leaving 160 px below the viewport to hide footer chrome. Titles, pin/star controls, and Replay remain outside the crop. Instagram can change its internal layout; this fixed crop cannot inspect or remove its cross-origin content.

Instagram controls the cross-origin document, availability, login requirements, cookies, and replay implementation. The sandbox blocks new tabs and navigation of the Reelbag page; it cannot prevent navigation *within* the iframe or force Instagram to loop a video. The parent page cannot detect a reliable video-ended event from this cross-origin embed, so **Replay** is always available and reloads the iframe locally. Autoplay with sound is a request: Instagram or browser media policies can still require a native play click. If native replay becomes unavailable, use that button. Private or restricted reels may still require opening the original. Instagram layout changes may affect native sizing, and iframe load events cannot reliably detect every blocked or unavailable cross-origin player. The app does not scrape or download video files.

The grid uses one column on Android/mobile, two on tablets, and three/four on desktop. Shared links through `/?url=` or `?text=` prefill Add Reel after login; a user must still submit the form.

## Navigation and view context

The sticky header displays All Reels, Pinned Reels, Favorites, or the selected folder name and icon above search. Its badge counts all accessible reels in that view, independently of the search query. Owned and shared folders use the same header on desktop, collapsed navigation, and mobile. PIN-protected content remains excluded until unlocked.

The sidebar contains navigation and one scroll area for YOUR FOLDERS and SHARED WITH ME. Folder rows have no numeric badges; only All Reels, Pinned and Favorites keep sidebar counts. Owned-folder three-dot menus provide Rename Folder (including PIN settings), Share Folder, Delete Folder confirmation, and Lock Folder where applicable. Opening a menu or managing an inactive folder preserves the current view. Locked folders require PIN verification before management; the requested action resumes after unlocking. Shared-folder menus expose navigation and role information, while owner-only controls remain unavailable to recipients. Menus support keyboard navigation, Escape, outside clicks, touch, and collapsed sidebars; they render outside the scroll region so it cannot clip them. Mobile navigation tabs use the same menu for the active folder. The desktop duplicate folder-name/edit/share row is removed. It fills the remaining viewport space, so long owned-folder lists cannot push shared folders outside the scroll region. Smooth scrolling respects reduced-motion preferences. Profile, settings, backups, notifications, and sign-out remain available in the top-right header.

## Motion and accessibility

Controls share 300 ms ease-out color, background, border, opacity, shadow and transform transitions. Sidebar width and workspace offset use a coordinated 500 ms curve, with fading/scaling labels. Folder changes animate the existing content pane for 300 ms with the Web Animations API; the pane is not keyed/remounted, so a Reel common to both views keeps its iframe. Rapid switches cancel the previous entrance animation.

The active header avatar cycles through tilt, look, nod and rise every eight seconds using one reusable whole-artwork rig for all 30 DiceBear seeds. It does not modify face-specific SVG features or fetch animation frames. Intersection visibility, document visibility and reduced-motion preferences stop its timer/motion; unmount cleans up all observers/listeners/timers. Picker thumbnails stay static. The Add Reel sheen takes 12 seconds per sweep versus 2.8 seconds on Copy Secret Link. Card highlights use the active accent only on top/left borders, retaining dark right/bottom edges. Reduced motion disables all decorative loops, transitions and feed entrances, including changes to that preference during use.

## Sharing and notifications

Folder and reel links use independent cryptographic UUIDv4 tokens at `/share/folder/[token]` and `/share/reel/[token]`; names, usernames and record IDs are never used as link capabilities. Tokens are generated by Postgres for existing/new rows, but links are disabled until an owner explicitly creates one. Disabling a link invalidates the token; enabling again generates a new token. Only owners can issue/revoke links or invite/revoke members, and protected folders must be unlocked in that owner's session first.

Anonymous share pages reveal a generic invitation and a login/signup CTA. They expose no item title, sender, playable URL or token-validity result before authentication. Login returns only to validated internal share routes. After login, a link holder sees the item title and sender, then explicitly joins as a viewer. Pending or accepted owner-issued collaborator grants remain intact; a declined invitation joins as viewer. Share pages send no-referrer/no-index metadata and use no-store authenticated API responses.

Direct invitations use an exact case-insensitive username, a viewer/collaborator role for folders, and viewer-only access for individual reels. The bell polls every 30 seconds and on window focus. Opening notifications marks them read; Accept/Decline atomically changes the share status for that recipient. Accepted folders appear under **SHARED WITH ME**; owner folders show a shared badge. Individual shared reels appear in All Reels without granting access to their parent folder or siblings.

| Access | Watch | Add to shared folder | Edit, move, delete, pin/star, re-share |
| --- | --- | --- | --- |
| Owner | Yes, with their folder PIN grant | Yes | Yes |
| Viewer | Yes | No | No |
| Collaborator | Yes | Yes | No |

Sharing is an explicit access grant independent of the recipient's PIN session: the owner never sends a PIN or hash. Contributions belong to the folder owner; collaborators cannot mutate even their own submissions. SQL rechecks accepted collaborator membership inside INSERT, so revoked grants cannot insert through stale UI. All ordinary mutations continue to require ownership on the server. Shared data is excluded from the recipient's personal JSON export; the owner's backup includes contributions. Revocation takes effect on the next API request; open clients refresh within 30 seconds or on focus, but cannot undo already viewed/copied media. Disable the link as well as removing a member to prevent that member rejoining with a still-active link.

Additive migrations create `folder_shares`, `reel_shares`, and `notifications`, add UUID tokens/enable flags, and preserve the existing composite reel-folder ownership constraint. Notifications cascade with shares and deleted entities. Existing libraries, credentials and sessions are retained. Schema initialization runs on the first database request; `npm run db:migrate` applies the same idempotent migrations. No new secrets or environment variables are required beyond `DATABASE_URL`.

API entry points are `/api/sharing/{folder|reel}/{id}` (owner settings), `/invite`, `/link` (POST/DELETE), `/members/{recipientId}` (DELETE); `/api/share/{folder|reel}/{token}` (preview/content) and `/join` (POST); `/api/notifications`, `/read` (POST), and `/{id}/respond` (POST). Mutations use the existing same-origin CSRF guard, session cookies, parameterized queries and persisted rate limits. No third-party messages or email are sent.

## Logo and browser icons

`utils/logo.mjs` owns the shared vector geometry: a dark squircle with a 2-unit accent outline, an accent bookmark, and a dark play triangle. `components/Logo.jsx` renders that geometry inline with `currentColor`, so sidebar/header logos follow the CSS accent variables. `app/icon.svg` defines the static bookmark artwork with a #0f172a background, a 2-unit #b5f36d frame and bookmark outline, and a dark play triangle edged in green for visibility. All PNG/ICO assets are rasterized from this SVG. During use, a single temporary SVG favicon and the browser theme-color tag track the current account/preview accent, reverting on sign-out.

Next.js metadata serves the default SVG, 32 px PNG (`app/icon1.png`), six-size ICO at `public/favicon.ico` (16–256 px), and opaque 180 px Apple icon (`app/apple-icon.png`). `public/apple-touch-icon.png` supplies the conventional Apple path as well. The manifest provides 192/512 px home-screen icons and a separate 512 px maskable icon with safe-zone padding. Regenerate the checked-in PNG/ICO assets from `app/icon.svg` if the static artwork changes. Installed/bookmarked icons use the static default artwork. These assets and standalone metadata support home-screen shortcuts; cloud data and Instagram playback require a network connection.

## Signed Android releases and Digital Asset Links

The Android release workflow generates its signing identity on the first run and restores it from a repository-scoped GitHub Actions cache on later runs. The private keystore and random password never enter the repository, logs, release assets, or Vercel settings. No manual Actions or Vercel secrets are required.

The workflow extracts the public certificate fingerprint, commits only that value to `android/signing-certificate.json`, and waits for Vercel to serve the matching `/.well-known/assetlinks.json` response before signing or publishing. A mismatch stops the release, preventing an APK whose TWA would fall back to a Chrome Custom Tab.

GitHub Actions caches are not permanent signing-key custody: GitHub may evict a cache after inactivity or under repository cache limits. Back up `.android-signing/release.keystore` and its password from a controlled workflow before distributing the APK if update continuity matters. If the cache is lost, the workflow creates a new identity and updates Digital Asset Links automatically, but Android will require existing users to uninstall the old certificate's app before installing the newly signed APK.

## Validation

```sh
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit --omit=dev
```

Set `CHROMIUM_PATH` to an existing Chromium binary if desired. Tests do not use a real user's Neon database or modify deployment data. Server integration tests run the actual API handlers, schema, and parameterized SQL against PGlite, an embedded PostgreSQL engine. They check automatic migrations, accounts, bcrypt hashes, cookie attributes, session expiry, multiple devices, ownership/FK isolation, server-enforced folder PINs, CSRF, validation, imports, persistent rate limits, optional recovery and session revocation, fuzzy-answer boundaries, pinned/favorite persistence, and upgrades from the previous schema.

Browser tests run the production frontend on port 3100 and route API requests to the same SQL-backed test handlers; only the Neon transport and Instagram iframe response are substituted. They exercise signup/login, device/account separation, folder and reel CRUD, backups, previous local imports, responsive layouts, failed-save drafts, sidebar collapse/counts, persisted folder moves, password visibility, optional recovery/reset/settings, pinned/favorite filters across desktop and mobile, full-width crop geometry, autoplay replay requests, play/pause/replay, sandboxed popup/top-navigation attempts, the 30-avatar picker and persisted profile/hints, live accent preview/cancel across logos/sidebar/controls/favicon, repeated unmuted replay requests, keyboard profile-menu navigation, display names, cloud appearance/grid settings, password changes/account switching, branded FAB, and in-place replay against a deterministic cross-origin interactive iframe fixture. The fixture is not a live Instagram player. A passing suite does not verify a live Neon connection or a specific Instagram reel. A real Neon connection was not available during initial cloud integration because `DATABASE_URL` was unset; perform the live checks above once it is configured.

## Structure

```text
app/page.js                    Minimal dashboard and cloud account flow
app/api/[...path]/route.js      Dynamic Node.js API route adapter
components/                    Auth, folders, reels, dialogs, settings, legacy import
lib/server/api.mjs             Authenticated, ownership-checked API operations
lib/server/database.mjs        Neon adapter and idempotent initialization
lib/server/schema.mjs          Additive database DDL
lib/server/runtime.mjs         Server-only application composition
utils/api.mjs                  Browser fetch/error handling
utils/backup.mjs               Credential-free portable backups
utils/legacy.mjs               Read-only old browser data compatibility
scripts/migrate.mjs            Explicit schema initialization command
tests/                         SQL integration, compatibility, and browser tests
```
