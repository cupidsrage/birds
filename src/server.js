import express from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import sharp from "sharp";
import http from "http";
import { WebSocketServer } from "ws";
import webpush from "web-push";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync } from "fs";
import { readFile, unlink } from "fs/promises";
import crypto from "crypto";
import db from "./db.js";
import { DECK } from "./content.js";
import { generateMenu, generateWishes, generateCard } from "./generate.js";
import { planDate } from "./dateplanner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Photo storage lives alongside the DB, in the persistent volume.
const dataDir = process.env.DATA_DIR || join(__dirname, "..", "data");
const photosDir = join(dataDir, "photos");
mkdirSync(photosDir, { recursive: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ---- Config via env ----
const NAME_A = process.env.NAME_A || "You";
const NAME_B = process.env.NAME_B || "Me";
const PASS_A = process.env.PASS_A || "changeme-a";
const PASS_B = process.env.PASS_B || "changeme-b";
const COUNTDOWN_TARGET = process.env.COUNTDOWN_TARGET || defaultSaturday();

// ---- Web Push (VAPID) ----
// These defaults let push work out of the box; for real privacy, regenerate your
// own with `npx web-push generate-vapid-keys` and set them as env vars.
const VAPID_PUBLIC = process.env.VAPID_PUBLIC || "BPqoSE_OHx2SrZVFcQ9A99lGUt8IP17NH2Pp9jGBX286kHQ1qPJjj0w-lo1SNs_aMWgHS9ez_1pQs2DQOKAhVMA";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || "XvgWMvBKFoiuAK4KNxt1N2MysPsHfc6GpYX9c-_53zc";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:weekend@example.com";
let pushReady = false;
try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  pushReady = true;
} catch (e) {
  console.error("Web Push disabled — invalid VAPID config:", e.message);
}

// Send a notification to everyone EXCEPT the actor (usually: notify the partner).
// `tag` collapses repeats into one notification; `actions` adds reply buttons
// (Android/desktop render these — iOS shows the notification without them).
async function notify(targetPerson, { title, body, url, tag, actions, data, vibrate }) {
  if (!pushReady) return;
  const subs = db.prepare(`SELECT id, sub FROM push_subs WHERE person = ?`).all(targetPerson);
  for (const row of subs) {
    try {
      await webpush.sendNotification(JSON.parse(row.sub), JSON.stringify({
        title, body, url: url || "/", tag, actions, data, vibrate,
      }));
    } catch (e) {
      // 404/410 mean the subscription is dead — clean it up.
      if (e.statusCode === 404 || e.statusCode === 410) {
        db.prepare(`DELETE FROM push_subs WHERE id = ?`).run(row.id);
      } else {
        console.error("push send failed:", e.statusCode || e.message);
      }
    }
  }
}

function defaultSaturday() {
  const d = new Date();
  const day = d.getDay();
  const daysUntilSat = (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilSat);
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
}

// ---------- Weekly refresh ----------
// A "week" is keyed by the date of the most recent Sunday 8pm boundary.
// After Sunday 8pm local server time, we roll to a new week and regenerate.
function currentWeekKey(now = new Date()) {
  const d = new Date(now);
  // Roll back to the most recent Sunday 20:00.
  // If it's Sunday but before 20:00, the boundary is last Sunday.
  const day = d.getDay(); // 0 = Sunday
  const boundary = new Date(d);
  boundary.setHours(20, 0, 0, 0);
  // days since Sunday
  let daysSinceSunday = day;
  if (day === 0 && d < boundary) daysSinceSunday = 7; // before tonight's boundary -> last Sunday
  boundary.setDate(boundary.getDate() - daysSinceSunday);
  boundary.setHours(20, 0, 0, 0);
  return boundary.toISOString().slice(0, 10); // YYYY-MM-DD of that Sunday
}

const getMeta = db.prepare("SELECT value FROM meta WHERE key = ?");
const setMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");

let weekRefresh = null; // in-flight refresh promise, shared across requests

async function ensureWeek() {
  const week = currentWeekKey();
  const stored = getMeta.get("current_week")?.value;

  // Normally: if this week is already generated, we're done. But guard against a
  // previously-saved empty week (e.g. from an earlier broken run) — if the menu
  // or wishlist somehow ended up empty, regenerate instead of trusting the flag.
  if (stored === week) {
    const menuCount = db.prepare("SELECT COUNT(*) AS c FROM menu_items").get().c;
    const wishCount = db.prepare("SELECT COUNT(*) AS c FROM wishes").get().c;
    if (menuCount > 0 && wishCount > 0) return week;
    console.log(`Week ${week} is stored but empty (menu=${menuCount}, wish=${wishCount}) — regenerating`);
  }

  if (weekRefresh) return weekRefresh;
  weekRefresh = doRefresh(week).finally(() => { weekRefresh = null; });
  return weekRefresh;
}

async function doRefresh(week) {
  console.log(`Refreshing content for week ${week}`);
  const [menu, wishes] = await Promise.all([generateMenu(8), generateWishes(6)]);

  // Never wipe the current content or mark the week done unless we actually have
  // fresh items to put in their place. This prevents an empty menu/wishlist.
  if (!menu.length || !wishes.length) {
    console.error(`Refresh produced empty content (menu=${menu.length}, wish=${wishes.length}) — keeping existing content`);
    return week;
  }

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM menu_answers").run();
    db.prepare("DELETE FROM menu_items").run();
    db.prepare("DELETE FROM wishes").run();
    const insM = db.prepare("INSERT INTO menu_items (week, body, done) VALUES (?, ?, 0)");
    const insW = db.prepare("INSERT INTO wishes (week, body, done) VALUES (?, ?, 0)");
    for (const m of menu) insM.run(week, m);
    for (const w of wishes) insW.run(week, w);
    setMeta.run("current_week", week);
  });
  tx();
  return week;
}

// ---- Auth ----
const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
function sign(name) {
  const mac = crypto.createHmac("sha256", SECRET).update(name).digest("hex");
  return `${name}.${mac}`;
}
function verify(token) {
  if (!token) return null;
  const [name, mac] = token.split(".");
  if (!name || !mac) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(name).digest("hex");
  const ok = mac.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
  return ok ? name : null;
}
function auth(req, res, next) {
  const name = verify(req.cookies.session);
  if (!name || (name !== NAME_A && name !== NAME_B)) {
    return res.status(401).json({ error: "Not signed in" });
  }
  req.person = name;
  req.partner = name === NAME_A ? NAME_B : NAME_A;
  next();
}

app.post("/api/login", (req, res) => {
  const { pass } = req.body || {};
  let name = null;
  if (pass && pass === PASS_A) name = NAME_A;
  else if (pass && pass === PASS_B) name = NAME_B;
  if (!name) return res.status(401).json({ error: "That passphrase didn't match." });
  res.cookie("session", sign(name), {
    httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 90,
  });
  res.json({ name });
});
app.post("/api/logout", (req, res) => { res.clearCookie("session"); res.json({ ok: true }); });
app.get("/api/me", (req, res) => {
  const name = verify(req.cookies.session);
  if (!name) return res.json({ name: null, names: [NAME_A, NAME_B] });
  res.json({ name, partner: name === NAME_A ? NAME_B : NAME_A, countdownTarget: COUNTDOWN_TARGET });
});

// ---------- Notes ----------
app.get("/api/notes", auth, (req, res) => {
  const now = Date.now();
  const rows = db.prepare(`SELECT id, author, body, unlock_at, created_at, (unlock_at <= ?) AS unlocked FROM notes ORDER BY created_at DESC`).all(now);
  res.json(rows.map((r) => {
    const mine = r.author === req.person;
    const open = mine || r.unlocked;
    return { id: r.id, author: r.author, mine, unlock_at: r.unlock_at, unlocked: !!r.unlocked, body: open ? r.body : null };
  }));
});
app.post("/api/notes", auth, (req, res) => {
  const { body, unlock_at } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: "Write something first." });
  const when = unlock_at ? new Date(unlock_at).getTime() : Date.now();
  db.prepare(`INSERT INTO notes (author, body, unlock_at, created_at) VALUES (?,?,?,?)`).run(req.person, body.trim(), when, Date.now());
  // Only ping now if the note is already unlocked; timed notes stay a surprise.
  if (when <= Date.now()) {
    notify(req.partner, { title: `${req.person} left you a note`, body: "", url: "/" });
  }
  res.json({ ok: true });
});

// ---------- Wishlist (weekly) ----------
app.get("/api/wishes", auth, async (req, res) => {
  try { await ensureWeek(); } catch (e) { console.error("ensureWeek (wishes):", e.message); }
  res.json(db.prepare(`SELECT id, body, done FROM wishes ORDER BY done, id`).all());
});
app.post("/api/wishes/:id/toggle", auth, (req, res) => {
  db.prepare(`UPDATE wishes SET done = 1 - done WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ---------- Desire menu (weekly, both-want -> done clears from matches) ----------
app.get("/api/desires", auth, async (req, res) => {
  try { await ensureWeek(); } catch (e) { console.error("ensureWeek (desires):", e.message); }
  // All of this week's items stay answerable. `done` only affects whether a
  // mutual match shows in the "You both want" section, not the answer list.
  const items = db.prepare(`SELECT id, body, done FROM menu_items ORDER BY id`).all();
  const rank = { yes: 2, maybe: 1, no: 0 };
  const out = [];
  const matches = [];
  let partnerAnswered = 0;
  for (const it of items) {
    const mine = db.prepare(`SELECT answer FROM menu_answers WHERE item_id = ? AND person = ?`).get(it.id, req.person);
    const theirs = db.prepare(`SELECT answer FROM menu_answers WHERE item_id = ? AND person = ?`).get(it.id, req.partner);
    if (theirs) partnerAnswered++;
    out.push({ id: it.id, item: it.body, myAnswer: mine ? mine.answer : null, done: !!it.done });
    // A mutual match shows in "You both want" only until it's checked off (done).
    if (!it.done && mine && theirs && mine.answer !== "no" && theirs.answer !== "no") {
      const level = rank[mine.answer] <= rank[theirs.answer] ? mine.answer : theirs.answer;
      matches.push({ id: it.id, item: it.body, level });
    }
  }
  const doneCount = db.prepare(`SELECT COUNT(*) AS c FROM menu_items WHERE done = 1`).get().c;
  res.json({ items: out, partnerAnswered, matches, doneCount });
});

app.post("/api/desires", auth, (req, res) => {
  const { id, answer } = req.body || {};
  if (!["yes", "maybe", "no"].includes(answer)) return res.status(400).json({ error: "Invalid answer." });
  const item = db.prepare(`SELECT id FROM menu_items WHERE id = ?`).get(id);
  if (!item) return res.status(404).json({ error: "Item not found." });
  db.prepare(`INSERT INTO menu_answers (item_id, person, answer) VALUES (?,?,?) ON CONFLICT(item_id, person) DO UPDATE SET answer = excluded.answer`).run(id, req.person, answer);
  res.json({ ok: true });
});

// Check a mutual match off (or back on) — clears it from "You both want".
app.post("/api/desires/:id/done", auth, (req, res) => {
  db.prepare(`UPDATE menu_items SET done = 1 - done WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ---------- Points ----------
app.get("/api/points", auth, (req, res) => {
  const totals = db.prepare(`SELECT person, COALESCE(SUM(delta),0) AS total FROM points GROUP BY person`).all();
  const map = Object.fromEntries(totals.map((t) => [t.person, t.total]));
  const log = db.prepare(`SELECT * FROM points ORDER BY created_at DESC LIMIT 30`).all().map((p) => ({
    ...p,
    // Who gave it, for display. Older rows may not have a giver recorded.
    fromMe: p.giver ? p.giver === req.person : null,
  }));
  res.json({
    me: { name: req.person, total: map[req.person] || 0 },
    partner: { name: req.partner, total: map[req.partner] || 0 },
    log,
  });
});
app.post("/api/points", auth, (req, res) => {
  const { delta, reason } = req.body || {};
  const n = parseInt(delta, 10);
  if (!Number.isFinite(n) || !reason || !reason.trim()) return res.status(400).json({ error: "Need a reason and an amount." });
  // Points are a gift: they go to your partner, credited from you.
  db.prepare(`INSERT INTO points (person, giver, delta, reason, created_at) VALUES (?,?,?,?,?)`)
    .run(req.partner, req.person, n, reason.trim(), Date.now());
  notify(req.partner, { title: `${req.person} gave you ${n} point${Math.abs(n) === 1 ? "" : "s"}`, body: reason.trim(), url: "/" });
  res.json({ ok: true });
});

// ---------- Push notifications ----------
app.get("/api/push/key", (req, res) => res.json({ key: VAPID_PUBLIC }));

app.post("/api/push/subscribe", auth, (req, res) => {
  const sub = req.body?.subscription;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: "Bad subscription." });
  db.prepare(`INSERT INTO push_subs (person, endpoint, sub, created_at) VALUES (?,?,?,?)
              ON CONFLICT(endpoint) DO UPDATE SET person = excluded.person, sub = excluded.sub`)
    .run(req.person, sub.endpoint, JSON.stringify(sub), Date.now());
  res.json({ ok: true });
});

app.post("/api/push/unsubscribe", auth, (req, res) => {
  const endpoint = req.body?.endpoint;
  if (endpoint) db.prepare(`DELETE FROM push_subs WHERE endpoint = ?`).run(endpoint);
  res.json({ ok: true });
});

// Is the current person set up to receive push on any device?
app.get("/api/push/status", auth, (req, res) => {
  const c = db.prepare(`SELECT COUNT(*) AS c FROM push_subs WHERE person = ?`).get(req.person).c;
  res.json({ subscribed: c > 0 });
});

// ---------- Attention ("need you") ----------
// One button, three intensities — how long you hold it decides which one goes.
const ATTENTION_LEVELS = {
  1: { title: (n) => `${n} says hi 👋`, body: "" },
  2: { title: (n) => `${n} is thinking of you 💭`, body: "" },
  3: { title: (n) => `${n} needs you 💗`, body: "Answer when you can?" },
};
// The three canned replies, sent straight from the notification.
const ACK_REPLIES = {
  coming: "On my way 💗",
  soon: "Give me 5 💛",
  heart: "❤️",
};
// An unanswered "need you" gets exactly one more gentle buzz, then stops asking.
const RENUDGE_AFTER_MS = 15 * 60 * 1000;
// Repeat taps still burst hearts on their screen every time; only the push is
// throttled, so a playful flurry doesn't machine-gun their phone.
const PUSH_THROTTLE_MS = 60 * 1000;

function ackActions() {
  return [
    { action: "ack:coming", title: "On my way" },
    { action: "ack:soon", title: "Give me 5" },
    { action: "ack:heart", title: "❤️" },
  ];
}

app.post("/api/attention", auth, async (req, res) => {
  const level = Math.max(1, Math.min(3, parseInt(req.body?.level, 10) || 2));
  const now = Date.now();
  const info = db.prepare(`INSERT INTO attention (sender, recipient, level, created_at) VALUES (?,?,?,?)`)
    .run(req.person, req.partner, level, now);
  const id = info.lastInsertRowid;

  // Live on their screen if the app is open right now.
  sendEvent(req.partner, { t: "attention", id, from: req.person, level });

  const lastPush = db.prepare(`SELECT MAX(created_at) AS t FROM attention WHERE sender = ? AND pushed = 1`)
    .get(req.person).t;
  const throttled = !!lastPush && now - lastPush < PUSH_THROTTLE_MS;
  if (!throttled) {
    db.prepare(`UPDATE attention SET pushed = 1 WHERE id = ?`).run(id);
    const cfg = ATTENTION_LEVELS[level];
    await notify(req.partner, {
      title: cfg.title(req.person),
      body: cfg.body,
      url: "/",
      tag: "attention",
      vibrate: level === 3 ? [80, 40, 80, 40, 160] : [80, 40, 80],
      data: { attentionId: id },
      actions: ackActions(),
    });
  }
  res.json({ ok: true, id, level, throttled });
});

// Answer a ping. Called from the app, or straight from the notification buttons.
app.post("/api/attention/:id/ack", auth, async (req, res) => {
  const row = db.prepare(`SELECT id, sender, recipient, ack_at FROM attention WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found." });
  if (row.recipient !== req.person) return res.status(403).json({ error: "Not yours to answer." });
  const text = ACK_REPLIES[req.body?.reply] || ACK_REPLIES.heart;
  // Last answer wins. A mis-tap sends the wrong thing to a real person, so
  // "Change" has to actually correct the record, not just send a second message.
  db.prepare(`UPDATE attention SET ack_at = ?, ack_text = ? WHERE id = ?`).run(Date.now(), text, row.id);
  sendEvent(row.sender, { t: "attention-ack", id: row.id, from: req.person, text });
  await notify(row.sender, { title: `${req.person}: ${text}`, body: "", url: "/", tag: "attention-ack" });
  res.json({ ok: true, text });
});

// What the button should say: am I waiting on an answer, did one just land,
// is my partner heads-down, and how often have we reached for each other lately.
app.get("/api/attention", auth, (req, res) => {
  // A casual "hi" isn't something you sit waiting on an answer for — only a
  // deliberate hold (level 2+) puts the button into its waiting state.
  const waiting = db.prepare(
    `SELECT id, level, created_at FROM attention
      WHERE sender = ? AND level >= 2 AND ack_at IS NULL AND created_at > ?
      ORDER BY created_at DESC LIMIT 1`
  ).get(req.person, Date.now() - 12 * 3600000);
  const lastAck = db.prepare(
    `SELECT id, ack_text, ack_at FROM attention
      WHERE sender = ? AND ack_at IS NOT NULL ORDER BY ack_at DESC LIMIT 1`
  ).get(req.person);
  const week = db.prepare(`SELECT COUNT(*) AS c FROM attention WHERE created_at > ?`)
    .get(Date.now() - 7 * 86400000).c;
  res.json({
    waiting: waiting || null,
    lastAck: lastAck || null,
    week,
    partnerStatus: readStatus(req.partner),
    myStatus: readStatus(req.person),
  });
});

// ---------- Availability status ----------
function readStatus(person) {
  const row = db.prepare(`SELECT text, until FROM status WHERE person = ?`).get(person);
  if (!row || !row.text) return { text: null, until: null };
  if (row.until && row.until < Date.now()) return { text: null, until: null }; // lapsed
  return { text: row.text, until: row.until };
}

app.post("/api/status", auth, (req, res) => {
  const text = String(req.body?.text || "").trim().slice(0, 60);
  const hours = parseFloat(req.body?.hours);
  const until = text && Number.isFinite(hours) && hours > 0 ? Date.now() + hours * 3600000 : null;
  db.prepare(`INSERT INTO status (person, text, until, updated_at) VALUES (?,?,?,?)
              ON CONFLICT(person) DO UPDATE SET text = excluded.text, until = excluded.until, updated_at = excluded.updated_at`)
    .run(req.person, text || null, until, Date.now());
  const now = readStatus(req.person);
  sendEvent(req.partner, { t: "status", from: req.person, ...now });
  res.json({ ok: true, ...now });
});

// A "need you" nobody answered gets one more buzz after a while, then rests.
// The lower bound keeps a restart from re-nudging pings from days ago.
async function renudge() {
  const cutoff = Date.now() - RENUDGE_AFTER_MS;
  const rows = db.prepare(
    `SELECT id, sender, recipient FROM attention
      WHERE level = 3 AND ack_at IS NULL AND nudged = 0
        AND created_at < ? AND created_at > ?`
  ).all(cutoff, cutoff - 6 * 3600000);
  for (const r of rows) {
    db.prepare(`UPDATE attention SET nudged = 1 WHERE id = ?`).run(r.id);
    await notify(r.recipient, {
      title: `${r.sender} is still waiting 💗`,
      body: "", url: "/", tag: "attention",
      data: { attentionId: r.id },
      actions: ackActions(),
    });
  }
}
setInterval(() => renudge().catch((e) => console.error("renudge failed:", e.message)), 60 * 1000);

// Kept for older cached clients — the old buzz is now a level-2 ping.
app.post("/api/buzz", auth, async (req, res) => {
  const now = Date.now();
  const info = db.prepare(`INSERT INTO attention (sender, recipient, level, created_at, pushed) VALUES (?,?,2,?,1)`)
    .run(req.person, req.partner, now);
  sendEvent(req.partner, { t: "attention", id: info.lastInsertRowid, from: req.person, level: 2 });
  await notify(req.partner, {
    title: `${req.person} is thinking of you 💭`, body: "", url: "/", tag: "attention",
    data: { attentionId: info.lastInsertRowid }, actions: ackActions(),
  });
  res.json({ ok: true });
});

// ---------- Date planner ----------
app.post("/api/date/plan", auth, async (req, res) => {
  const { city, date, time, duration, vibe, budget } = req.body || {};
  if (!city || !city.trim()) return res.status(400).json({ error: "Where should the date be?" });
  const durationHours = Math.max(1, Math.min(12, parseFloat(duration) || 4));
  try {
    const plan = await planDate({
      city: city.trim(),
      date: date || "this weekend",
      time: time || "6:00 PM",
      durationHours,
      vibe: vibe || "romantic",
      budget: budget || null,
    });
    if (plan.error) return res.status(502).json({ error: plan.error });
    res.json(plan);
  } catch (e) {
    console.error("date plan failed:", e.message);
    res.status(502).json({ error: "Couldn't plan the date. Try again in a moment." });
  }
});

app.get("/api/date/plans", auth, (req, res) => {
  const rows = db.prepare(`SELECT id, author, city, date, time, duration, vibe, plan, created_at FROM date_plans ORDER BY created_at DESC LIMIT 30`).all();
  res.json(rows.map((r) => ({ ...r, plan: JSON.parse(r.plan) })));
});

app.post("/api/date/plans", auth, (req, res) => {
  const { city, date, time, duration, vibe, plan } = req.body || {};
  if (!plan || !city) return res.status(400).json({ error: "Nothing to save." });
  db.prepare(`INSERT INTO date_plans (author, city, date, time, duration, vibe, plan, created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run(req.person, city, date || null, time || null, parseFloat(duration) || null, vibe || null, JSON.stringify(plan), Date.now());
  notify(req.partner, { title: `${req.person} saved a date idea 💕`, body: `${plan.title || city}`, url: "/" });
  res.json({ ok: true });
});

app.delete("/api/date/plans/:id", auth, (req, res) => {
  db.prepare(`DELETE FROM date_plans WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ---------- Deck ----------
app.get("/api/deck/draw", auth, async (req, res) => {
  const heat = parseInt(req.query.heat, 10) || 2;
  const card = await generateCard(heat, { me: req.person, partner: req.partner });
  res.json(card);
});
app.get("/api/deck/answers", auth, (req, res) => res.json(db.prepare(`SELECT * FROM answers ORDER BY created_at DESC LIMIT 50`).all()));

// Answer a card. May include a photo (multipart) which is delivered to the
// partner's inbox. Text answers are also logged to the shared answers feed.
app.post("/api/deck/answers", auth, upload.single("photo"), async (req, res) => {
  const prompt = req.body?.prompt;
  const body = (req.body?.body || "").trim();
  if (!prompt) return res.status(400).json({ error: "Missing prompt." });
  if (!body && !req.file) return res.status(400).json({ error: "Add an answer or a photo." });

  let filename = null;
  if (req.file) {
    filename = await savePhoto(req.file.buffer);
  }

  // Text answer goes to the shared feed (as before).
  if (body) {
    db.prepare(`INSERT INTO answers (person, prompt, body, created_at) VALUES (?,?,?,?)`)
      .run(req.person, prompt, body, Date.now());
  }
  // Photo (and optional caption) is delivered privately to the partner.
  if (filename) {
    db.prepare(`INSERT INTO messages (sender, recipient, body, photo, prompt, seen, created_at) VALUES (?,?,?,?,?,0,?)`)
      .run(req.person, req.partner, body || null, filename, prompt, Date.now());
    notify(req.partner, { title: `${req.person} sent you a photo 📷`, body: "answering a dare", url: "/" });
  }
  res.json({ ok: true, sentPhoto: !!filename });
});

// ---------- Inbox ----------
async function savePhoto(buffer) {
  const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.jpg`;
  // Resize down to a sane max and re-encode as JPEG to cap size and strip EXIF.
  await sharp(buffer)
    .rotate() // respect orientation before stripping metadata
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toFile(join(photosDir, name));
  return name;
}

// Send a photo and/or note anytime (general inbox).
app.post("/api/inbox", auth, upload.single("photo"), async (req, res) => {
  const body = (req.body?.body || "").trim();
  if (!body && !req.file) return res.status(400).json({ error: "Add a note or a photo." });
  let filename = null;
  if (req.file) filename = await savePhoto(req.file.buffer);
  db.prepare(`INSERT INTO messages (sender, recipient, body, photo, prompt, seen, created_at) VALUES (?,?,?,?,?,0,?)`)
    .run(req.person, req.partner, body || null, filename, null, Date.now());
  notify(req.partner, { title: filename ? `${req.person} sent you a photo 📷` : `${req.person} sent you a message`, body: filename ? "" : (body || "").slice(0, 60), url: "/" });
  res.json({ ok: true });
});

// The two tabs of the inbox: received (to me) and sent (from me).
app.get("/api/inbox", auth, (req, res) => {
  const received = db.prepare(`SELECT id, sender, recipient, body, photo, prompt, seen, created_at FROM messages WHERE recipient = ? ORDER BY created_at DESC`).all(req.person);
  const sent = db.prepare(`SELECT id, sender, recipient, body, photo, prompt, seen, created_at FROM messages WHERE sender = ? ORDER BY created_at DESC`).all(req.person);
  // Mark received as seen.
  db.prepare(`UPDATE messages SET seen = 1 WHERE recipient = ? AND seen = 0`).run(req.person);
  res.json({ received, sent });
});

// Unseen count for the inbox badge.
app.get("/api/inbox/unseen", auth, (req, res) => {
  const c = db.prepare(`SELECT COUNT(*) AS c FROM messages WHERE recipient = ? AND seen = 0`).get(req.person).c;
  res.json({ unseen: c });
});

// Serve a photo. Inbox photos are private to sender/recipient; drawing snapshots
// are shared, so either partner may view them.
app.get("/api/photo/:name", auth, async (req, res) => {
  const name = req.params.name;
  const msg = db.prepare(`SELECT sender, recipient FROM messages WHERE photo = ?`).get(name);
  const drawing = db.prepare(`SELECT id FROM drawings WHERE photo = ?`).get(name);
  const allowed = drawing || (msg && (msg.sender === req.person || msg.recipient === req.person));
  if (!allowed) return res.status(404).end();
  try {
    const buf = await readFile(join(photosDir, name));
    res.type("image/jpeg").send(buf);
  } catch {
    res.status(404).end();
  }
});

// Delete a message you sent or received (also removes the photo file).
app.delete("/api/inbox/:id", auth, async (req, res) => {
  const msg = db.prepare(`SELECT id, sender, recipient, photo FROM messages WHERE id = ?`).get(req.params.id);
  if (!msg || (msg.sender !== req.person && msg.recipient !== req.person)) {
    return res.status(404).json({ error: "Not found." });
  }
  db.prepare(`DELETE FROM messages WHERE id = ?`).run(msg.id);
  if (msg.photo) { try { await unlink(join(photosDir, msg.photo)); } catch {} }
  res.json({ ok: true });
});

// ---------- Drawings gallery ----------
app.get("/api/drawings", auth, (req, res) => {
  res.json(db.prepare(`SELECT id, author, photo, created_at FROM drawings ORDER BY created_at DESC`).all());
});

// Save the current canvas as a shared drawing. Body is a data URL (PNG).
app.post("/api/drawings", auth, express.json({ limit: "8mb" }), async (req, res) => {
  const dataUrl = req.body?.image || "";
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!m) return res.status(400).json({ error: "No drawing to save." });
  const buffer = Buffer.from(m[1], "base64");
  const name = `draw-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.jpg`;
  // Flatten onto the app background and store as JPEG to keep it small.
  await sharp(buffer)
    .flatten({ background: "#1a1220" })
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(join(photosDir, name));
  db.prepare(`INSERT INTO drawings (author, photo, created_at) VALUES (?,?,?)`).run(req.person, name, Date.now());
  notify(req.partner, { title: `${req.person} saved a drawing 🎨`, body: "", url: "/" });
  res.json({ ok: true });
});

app.delete("/api/drawings/:id", auth, async (req, res) => {
  const d = db.prepare(`SELECT id, photo FROM drawings WHERE id = ?`).get(req.params.id);
  if (!d) return res.status(404).json({ error: "Not found." });
  db.prepare(`DELETE FROM drawings WHERE id = ?`).run(d.id);
  try { await unlink(join(photosDir, d.photo)); } catch {}
  res.json({ ok: true });
});

// ---- Static ----
app.use(express.static(join(__dirname, "..", "public")));

const PORT = process.env.PORT || 3000;

// ---- Live WebSockets ----
// Two sockets share one HTTP server:
//   /ws/canvas — live shared drawing (open only on the Draw tab)
//   /ws/events — always-on app events (e.g. buzz bursts) while the app is open
const httpServer = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });        // canvas
const eventsWss = new WebSocketServer({ noServer: true });  // app events

httpServer.on("upgrade", (req, socket, head) => {
  const { url } = req;
  if (url === "/ws/canvas") {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } else if (url === "/ws/events") {
    eventsWss.handleUpgrade(req, socket, head, (ws) => eventsWss.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

let strokeHistory = [];            // array of stroke messages
const MAX_HISTORY = 5000;          // cap so memory can't grow unbounded
const clients = new Set();
const eventClients = new Set();    // always-on event listeners

function cookieValue(header, key) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === key) return decodeURIComponent(v.join("="));
  }
  return null;
}

wss.on("connection", (ws, req) => {
  // Authenticate the socket using the same signed session cookie as the API.
  const name = verify(cookieValue(req.headers.cookie, "session"));
  if (!name || (name !== NAME_A && name !== NAME_B)) {
    ws.close(4001, "unauthorized");
    return;
  }
  ws.person = name;
  clients.add(ws);

  // Send current canvas state to the newcomer so they see what's there.
  ws.send(JSON.stringify({ t: "init", strokes: strokeHistory }));
  broadcast({ t: "presence", online: clients.size }, null);

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === "stroke") {
      const stroke = { t: "stroke", person: name, ...sanitizeStroke(msg) };
      strokeHistory.push(stroke);
      if (strokeHistory.length > MAX_HISTORY) strokeHistory = strokeHistory.slice(-MAX_HISTORY);
      broadcast(stroke, ws); // send to the other client(s)
    } else if (msg.t === "clear") {
      strokeHistory = [];
      broadcast({ t: "clear", person: name }, null); // include sender so both clear
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    broadcast({ t: "presence", online: clients.size }, null);
  });
  ws.on("error", () => { clients.delete(ws); });
});

function sanitizeStroke(m) {
  // Only pass through the fields we expect, coerced to safe types.
  const num = (x) => (typeof x === "number" && isFinite(x) ? x : 0);
  return {
    x0: num(m.x0), y0: num(m.y0), x1: num(m.x1), y1: num(m.y1),
    color: typeof m.color === "string" ? m.color.slice(0, 24) : "#e08a9e",
    size: Math.max(1, Math.min(80, num(m.size) || 4)),
    erase: !!m.erase,
  };
}

function broadcast(obj, except) {
  const data = JSON.stringify(obj);
  for (const c of clients) {
    if (c !== except && c.readyState === 1) {
      try { c.send(data); } catch {}
    }
  }
}

// ---- Always-on app events socket ----
eventsWss.on("connection", (ws, req) => {
  const name = verify(cookieValue(req.headers.cookie, "session"));
  if (!name || (name !== NAME_A && name !== NAME_B)) {
    ws.close(4001, "unauthorized");
    return;
  }
  ws.person = name;
  eventClients.add(ws);
  ws.on("close", () => eventClients.delete(ws));
  ws.on("error", () => eventClients.delete(ws));
});

// Send a live event to a specific person's open app windows (if any).
function sendEvent(person, obj) {
  const data = JSON.stringify(obj);
  for (const c of eventClients) {
    if (c.person === person && c.readyState === 1) {
      try { c.send(data); } catch {}
    }
  }
}

// Make sure this week's content exists before we start serving, then check hourly.
ensureWeek()
  .catch((e) => console.error("initial ensureWeek failed:", e.message))
  .finally(() => {
    httpServer.listen(PORT, () => console.log(`weekend app on :${PORT}`));
    setInterval(() => ensureWeek().catch((e) => console.error("scheduled ensureWeek failed:", e.message)), 60 * 60 * 1000);
  });
