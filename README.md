# Weekend

A private app for two — for couples who only get the weekends together. Node/Express + better-sqlite3, PWA front end, deployable to Railway.

## What's inside

- **Countdown** to your next weekend together (auto-set to the upcoming Saturday, or pin your own).
- **Love notes (timed dead drop)** — leave a note now or set it to unlock later in the week. Your partner can't read it until it unlocks; you always see your own.
- **Question & dare deck** — draw a flirty card, answer it, and your partner sees the answer.
- **The menu** — a private yes / maybe / no checklist. The app only reveals the items you *both* said yes or maybe to (revealed at the cooler of the two answers).
- **Wishlist** — a shared list of things to do together.
- **Points** — log little things during the week, tally them up, cash them in.

## Run locally

```bash
npm install
NAME_A=Blake NAME_B=Robin PASS_A=secret1 PASS_B=secret2 SESSION_SECRET=anything npm start
# open http://localhost:3000
```

## Deploy to Railway

1. Push this folder to a GitHub repo.
2. In Railway: **New Project → Deploy from GitHub repo**, pick the repo.
3. Add a **Volume** and set its mount path to `/data` (this keeps the database across deploys).
4. Under **Variables**, set:

   | Variable | What it is |
   |---|---|
   | `NAME_A` | First person's name (e.g. `Blake`) |
   | `NAME_B` | Second person's name |
   | `PASS_A` | First person's passphrase |
   | `PASS_B` | Second person's passphrase |
   | `SESSION_SECRET` | Any long random string |
   | `DATA_DIR` | `/data` (matches your volume mount) |
   | `COUNTDOWN_TARGET` | *(optional)* ISO datetime of your next weekend, e.g. `2026-08-01T18:00:00Z` |
   | `NODE_ENV` | `production` |

5. Railway sets `PORT` automatically. Deploy — you'll get a public URL.
6. Open the URL on your phones and **Add to Home Screen** to install it as an app.

## Node version

This project pins Node 22 (via `.nvmrc` and the `engines` field) because `better-sqlite3` ships prebuilt binaries for LTS versions. If the build environment uses a non-LTS Node (e.g. 24), it falls back to compiling from source and fails without a C toolchain. Railway's Nixpacks builder reads `.nvmrc`, so leave it in place.

## Making it yours

- Edit the desire menu and the question/dare deck in `src/content.js` — just change the arrays.
- Colors and type live in `public/styles.css`.

## A note on privacy

This uses simple passphrase auth over HTTPS — fine for a two-person app you keep the URL to yourselves. It's not built to withstand a determined attacker. Keep the URL and passphrases private, and don't reuse a password you use elsewhere.
