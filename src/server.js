import express from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync } from "fs";
import { readFile, unlink } from "fs/promises";
import crypto from "crypto";
import db from "./db.js";
import { DECK } from "./content.js";
import { generateMenu, generateWishes, generateCard } from "./generate.js";

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

async function ensureWeek() {
  const week = currentWeekKey();
  const stored = getMeta.get("current_week")?.value;
  if (stored === week) return week;

  console.log(`Refreshing content for week ${week} (was ${stored || "none"})`);
  const [menu, wishes] = await Promise.all([generateMenu(8), generateWishes(6)]);

  const tx = db.transaction(() => {
    // Fresh sets replace the old ones. Old weeks' rows are removed so the
    // menu/wishlist show only this week. (Answers cascade away with items.)
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
  res.json({ ok: true });
});

// ---------- Wishlist (weekly) ----------
app.get("/api/wishes", auth, async (req, res) => {
  await ensureWeek();
  res.json(db.prepare(`SELECT id, body, done FROM wishes ORDER BY done, id`).all());
});
app.post("/api/wishes/:id/toggle", auth, (req, res) => {
  db.prepare(`UPDATE wishes SET done = 1 - done WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ---------- Desire menu (weekly, both-want -> done -> cleared) ----------
app.get("/api/desires", auth, async (req, res) => {
  await ensureWeek();
  const items = db.prepare(`SELECT id, body, done FROM menu_items WHERE done = 0 ORDER BY id`).all();
  const rank = { yes: 2, maybe: 1, no: 0 };
  const out = [];
  const matches = [];
  let partnerAnswered = 0;
  for (const it of items) {
    const mine = db.prepare(`SELECT answer FROM menu_answers WHERE item_id = ? AND person = ?`).get(it.id, req.person);
    const theirs = db.prepare(`SELECT answer FROM menu_answers WHERE item_id = ? AND person = ?`).get(it.id, req.partner);
    if (theirs) partnerAnswered++;
    out.push({ id: it.id, item: it.body, myAnswer: mine ? mine.answer : null });
    if (mine && theirs && mine.answer !== "no" && theirs.answer !== "no") {
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
  const item = db.prepare(`SELECT id FROM menu_items WHERE id = ? AND done = 0`).get(id);
  if (!item) return res.status(404).json({ error: "Item not found." });
  db.prepare(`INSERT INTO menu_answers (item_id, person, answer) VALUES (?,?,?) ON CONFLICT(item_id, person) DO UPDATE SET answer = excluded.answer`).run(id, req.person, answer);
  res.json({ ok: true });
});

// Check off a mutual match as done -> it's removed from the list.
app.post("/api/desires/:id/done", auth, (req, res) => {
  db.prepare(`UPDATE menu_items SET done = 1 WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ---------- Points ----------
app.get("/api/points", auth, (req, res) => {
  const totals = db.prepare(`SELECT person, COALESCE(SUM(delta),0) AS total FROM points GROUP BY person`).all();
  const map = Object.fromEntries(totals.map((t) => [t.person, t.total]));
  res.json({
    me: { name: req.person, total: map[req.person] || 0 },
    partner: { name: req.partner, total: map[req.partner] || 0 },
    log: db.prepare(`SELECT * FROM points ORDER BY created_at DESC LIMIT 30`).all(),
  });
});
app.post("/api/points", auth, (req, res) => {
  const { delta, reason } = req.body || {};
  const n = parseInt(delta, 10);
  if (!Number.isFinite(n) || !reason || !reason.trim()) return res.status(400).json({ error: "Need a reason and an amount." });
  db.prepare(`INSERT INTO points (person, delta, reason, created_at) VALUES (?,?,?,?)`).run(req.person, n, reason.trim(), Date.now());
  res.json({ ok: true });
});

// ---------- Deck ----------
app.get("/api/deck/draw", auth, async (req, res) => {
  const card = await generateCard();
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

// Serve a photo, but only to its sender or recipient.
app.get("/api/photo/:name", auth, async (req, res) => {
  const name = req.params.name;
  const msg = db.prepare(`SELECT sender, recipient FROM messages WHERE photo = ?`).get(name);
  if (!msg || (msg.sender !== req.person && msg.recipient !== req.person)) {
    return res.status(404).end();
  }
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

// ---- Static ----
app.use(express.static(join(__dirname, "..", "public")));

const PORT = process.env.PORT || 3000;

// Make sure this week's content exists before we start serving, then check hourly.
ensureWeek()
  .catch((e) => console.error("initial ensureWeek failed:", e.message))
  .finally(() => {
    app.listen(PORT, () => console.log(`weekend app on :${PORT}`));
    setInterval(() => ensureWeek().catch((e) => console.error("scheduled ensureWeek failed:", e.message)), 60 * 60 * 1000);
  });
