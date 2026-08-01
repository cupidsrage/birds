# Weekend

A private app for two — for couples who only get the weekends together. Node/Express + better-sqlite3, PWA front end, deployable to Railway.

## What's inside

- **Countdown** to your next weekend together (auto-set to the upcoming Saturday, or pin your own).
- **The attention button** — hold it, don't tap it. A quick press says hi; hold for a second it's "thinking of you"; hold it down and it's "I need you." Whoever's on the other end can answer straight from the notification (*On my way* / *Give me 5* / ❤️), and the answer lands back on your screen so you know it got through. Either of you can set a status ("heads-down til 3") that shows on the button *before* it's pressed.
- **Love notes (timed dead drop)** — leave a note now or set it to unlock later in the week. Your partner can't read it until it unlocks; you always see your own.
- **Question & dare deck** — draw a card (AI-generated fresh on every draw, or from a built-in deck without a key). Answer with words, a photo, or both. Photos you send land privately in your partner's inbox.
- **Inbox** — send each other photos and notes anytime. Private to the recipient: you see what you've sent and received; your partner only sees what was sent to them. Photos are resized and stripped of location metadata on upload, and served only to the two people on the message.
- **The menu** — a private yes / maybe / no checklist. The app only reveals items you *both* said yes or maybe to (at the cooler of the two answers). Check a mutual match off as **done** and it clears from the list. A fresh set is generated every **Sunday night**.
- **Wishlist** — a fresh set of date ideas every Sunday night; tap one off when you've done it.

### Weekly refresh & AI

Every Sunday at 8pm (server local time) the menu and wishlist swap in a brand-new random set. If you set `ANTHROPIC_API_KEY`, those items are generated fresh for you by Claude each week; without a key, the app draws from a built-in pool so it still works. The refresh runs in-process (checked on startup and hourly) — no external cron needed.
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
3. Add a **Volume** and set its mount path to `/data` (this keeps the database **and uploaded photos** across deploys).
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
   | `ANTHROPIC_API_KEY` | *(optional)* enables AI-generated weekly items. Get one at console.anthropic.com. Without it, a built-in pool is used. |
   | `ANTHROPIC_MODEL` | *(optional)* defaults to `claude-sonnet-4-6` |
   | `TZ` | *(recommended)* your timezone so "Sunday 8pm" is local, not UTC — e.g. `America/Chicago` |
   | `VAPID_PUBLIC` / `VAPID_PRIVATE` | *(recommended)* your own push keys. Generate with `npx web-push generate-vapid-keys`. Defaults are baked in so push works immediately, but set your own for privacy. |
   | `VAPID_SUBJECT` | *(optional)* a `mailto:` address for the push service, e.g. `mailto:you@example.com` |
   | `GOOGLE_PLACES_KEY` | *(optional)* enables the date planner to pull real venues with live ratings & hours. Get one at console.cloud.google.com (enable the Places API — free tier covers thousands of lookups/month). Without it, the planner still works using the AI's own suggestions. |
   | `NODE_ENV` | `production` |

### Notifications

The app can send push notifications — the attention button, and a ping whenever one of you sends a note, photo, drawing, or points. Each person taps "Turn on" once to allow notifications on their device.

- **iPhone:** push only works *after* you Add the app to your Home Screen (install it as a PWA). It won't work in a Safari tab — that's an Apple limitation, not a bug. iOS also doesn't render the reply buttons on a notification, so answering there means tapping the notification to open the app and replying from the toast — one extra tap.
- **Android:** works in Chrome directly, though installing to the home screen is still recommended. Reply buttons show up right on the notification.

Some deliberate restraint built into the attention button, so it stays sweet rather than becoming a demand:

- Repeat presses always burst hearts on their screen, but the *push* is throttled to one a minute — a playful flurry won't machine-gun their phone.
- An unanswered "I need you" sends one more gentle buzz after 15 minutes, then stops asking.
- A status ("in a meeting til 3") is visible on the button before it's pressed, so a ping is never sent into a void.

5. Railway sets `PORT` automatically. Deploy — you'll get a public URL.
6. Open the URL on your phones and **Add to Home Screen** to install it as an app.

## Node version

This project pins Node 22 (via `.nvmrc` and the `engines` field) because `better-sqlite3` ships prebuilt binaries for LTS versions. If the build environment uses a non-LTS Node (e.g. 24), it falls back to compiling from source and fails without a C toolchain. Railway's Nixpacks builder reads `.nvmrc`, so leave it in place.

## Making it yours

- Edit the desire menu and the question/dare deck in `src/content.js` — just change the arrays.
- Colors and type live in `public/styles.css`.

## A note on privacy

This uses simple passphrase auth over HTTPS — fine for a two-person app you keep the URL to yourselves. It's not built to withstand a determined attacker. Keep the URL and passphrases private, and don't reuse a password you use elsewhere.
