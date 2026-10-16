<div align="center">

<img src="app/icon.svg" width="76" height="76" alt="Reelbag logo" />

# Reelbag 🎬

### *Your Personal Vault for Video Inspiration, Remakes & Saved Moments.*

Turn “I should save this” into a library you’ll actually use.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Neon Postgres](https://img.shields.io/badge/Neon_Postgres-00E599?style=for-the-badge&logo=neon&logoColor=black)](https://neon.tech/)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)
[![Lucide React](https://img.shields.io/badge/Lucide_React-F56565?style=for-the-badge&logo=lucide&logoColor=white)](https://lucide.dev/)

**[Explore the features](#-a-home-for-every-reel) · [Start locally](#-quick-start) · [Deploy on Vercel](#-make-it-yours-on-vercel)**

</div>

---

## 💬 Great Reels deserve better than a buried link

You find an amazing recipe, a crazy bike reel, a workout routine, or a hilarious clip on Instagram. You tap **Save** or drop the link into a private WhatsApp chat. A week later, it’s buried under hundreds of messages.

Now you’re opening old links one by one, trying to remember which video had that transition, that recipe, or that perfect travel spot. Inspiration shouldn’t take this much searching.

**Reelbag turns messy Instagram links into a sleek, visual video catalog.** Give each Reel a memorable title, preview and play it in a clean card, pin your next project, star your favorites, and organize the rest into custom folders—with zero clutter.

> [!TIP]
> **Save the link. Find the moment. Make something with it.**
> Paste a Reel URL, add a short title, and choose a folder—or leave it in your main stream. Your next idea is just a search away.

## ✨ A home for every Reel

| Feature | What it means for you |
| --- | --- |
| ☁️ **Your library, every device** | Neon Postgres stores your accounts, folders, and saved Reels in the cloud. Sign in from a phone or desktop browser to access the same library. |
| 🎥 **Video-first cards** | Full-width, cropped Instagram embeds keep the focus on the video. Preview, play, and use the in-app **Replay** button to request a fresh rewatch without opening a new tab. |
| 📌 **Pin what’s next** | Keep your next remake or go-to reference at the top of the grid. Jump into **Pinned** or **Favorites** whenever you need it. |
| 📂 **Folders that fit your life** | Create folders for any hobby or project. Keep folder-free Reels in the main stream and search saved titles to find them fast. |
| 🔐 **A little more privacy** | Protect individual folders with optional four-digit PINs. Passwords and folder PINs are hashed on the server, with account ownership enforced on every request. |
| 🤝 **Share securely** | Invite exact usernames, accept or decline in-app notifications, or send a revocable UUID link. Viewers watch; folder collaborators can add reels. Accepted folders live under **Shared with me**. |
| 🎨 **Make it feel like yours** | Choose from **30 pixel-art avatars**, set a display name, and preview custom accent colors across the logo, sidebar, buttons, and tab icon. Pick dark/light themes and in-app preset or hex colors, with an automatic responsive grid. |
| 📱 **Built for your screen** | A collapsible desktop sidebar, mobile filter tabs, and a bottom-right **+ Add Reel** button keep your library easy to navigate. |
| 💾 **Keep a portable copy** | Export JSON backups, import links from another device, or migrate a previous Reelbag browser library through **Data & Backups**. |

> [!NOTE]
> Reelbag catalogs links using Instagram’s native embeds; it doesn’t download or host videos. Availability, playback, and unmuted autoplay depend on Instagram and browser policies. Private, deleted, or restricted Reels may require opening the original.

## 🧑‍🎨 Built for whatever inspires you

- **Content Creators & Editors** — Collect trends, transitions, and remake ideas in a **To Recreate** folder. Pin the next clip you want to make your own.
- **Riders, Gamers & Hobbyists** — Give bike builds, stunt clips, and gaming highlights a dedicated home instead of another forgotten chat link.
- **Foodies & Home Cooks** — Catalog quick recipes and kitchen hacks so the right video is easy to find when it’s time to cook.
- **Everyday Saved Reels** — Keep funny memes, travel spots, and family clips organized, searchable, and ready to revisit or share through their original links.

## ⚡ From link to inspiration in three steps

1. **Create your account.** Pick a username, password, and pixel avatar.
2. **Save a Reel.** Tap **+ Add Reel**, paste the Instagram link, and give it a name you’ll remember.
3. **Make it your library.** Organize folders, pin your next idea, favorite the keepers, and sign in on another device to pick up where you left off.

## 🚀 Quick start

**You’ll need:** Node.js **22 LTS**, npm, and a [Neon Postgres database](https://console.neon.tech).

### 1. Clone and install

```sh
git clone https://github.com/chick-wasabi/Reelbag.git
cd Reelbag
npm install
cp .env.example .env.local
```

### 2. Connect your database

In Neon, open **Connect** and copy your Postgres connection string into `.env.local`:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Replace the example with your real Neon connection string. Keep `DATABASE_URL` server-side; never prefix it with `NEXT_PUBLIC_` or commit `.env.local`.

### 3. Initialize and launch

```sh
npm run db:migrate
npm run dev
```

Open **[localhost:3000](http://localhost:3000)**, create an account, and save your first Reel. 🎉

> [!IMPORTANT]
> A working `DATABASE_URL` is required for accounts and cloud storage. The database role needs schema creation and read/write permissions. Migrations are additive and repeatable; the first database-backed request also initializes the schema automatically.

## ▲ Make it yours on Vercel

1. Import this repository into [Vercel](https://vercel.com/new) using the **Next.js** preset and **Node.js 22**.
2. Add your Neon connection string as **`DATABASE_URL`** for the deployment environments you intend to use.
3. Deploy with the default **`npm run build`** command. Redeploy after changing environment variables.
4. Open the HTTPS site, save a Reel, and sign in on a second device to check your cloud library.

Use a separate Neon database or branch for previews when you need isolated data.

## 🛠️ Under the hood

**Next.js 16 App Router · React 19 · Tailwind CSS · Neon Serverless Postgres · Lucide React · Vercel-compatible deployment**

The application uses bcrypt password hashing, HTTP-only session cookies, server-enforced folder access, and database-backed rate limits. Optional recovery questions and password hints are available in **Account Security**; hints are visible to anyone who knows the username, so never include a password or recovery answer.

The project originally targeted Next.js 14 and was upgraded; the badge above reflects the version currently shipped in `package.json`.

For database behavior, backup/import rules, security details, icon assets, and deployment troubleshooting, see the **[Development & Operations Guide](docs/OPERATIONS.md)**.

### Development checks

```sh
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Integration tests use embedded Postgres, and browser tests substitute Instagram’s player response. Passing tests do not verify a live Neon connection or Instagram Reel.

---

**Your next recipe, ride, remake, or saved moment deserves a place you can find again. Build your Reelbag.** 🎬
