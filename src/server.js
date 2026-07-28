import express from "express";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import crypto from "crypto";
import db from "./db.js";
import { DESIRE_ITEMS, DECK } from "./content.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// ---- Config via env ----
// Two people, two names, one shared passphrase each. Set these in Railway.
const NAME_A = process.env.NAME_A || "You";
const NAME_B = process.env.NAME_B || "Me";
const PASS_A = process.env.PASS_A || "changeme-a";
const PASS_B = process.env.PASS_B || "changeme-b";
// Next weekend target (ISO). Defaults to upcoming Saturday 6pm if unset.
const COUNTDOWN_TARGET = process.env.COUNTDOWN_TARGET || defaultSaturday();

function defaultSaturday() {
  const d = new Date();
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const daysUntilSat = (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilSat);
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
}

// ---- Auth: a signed cookie holding the person's name ----
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
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 90,
  });
  res.json({ name });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("session");
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const name = verify(req.cookies.session);
  if (!name) return res.json({ name: null, names: [NAME_A, NAME_B] });
  res.json({
    name,
    partner: name === NAME_A ? NAME_B : NAME_A,
    countdownTarget: COUNTDOWN_TARGET,
  });
});

// ---------- Notes (timed dead drop) ----------
app.get("/api/notes", auth, (req, res) => {
  const now = Date.now();
  // You always see your own; you see partner's only once unlocked.
  const rows = db.prepare(`
    SELECT id, author, body, unlock_at, created_at,
           (unlock_at <= ?) AS unlocked
    FROM notes ORDER BY created_at DESC
  `).all(now);
  const visible = rows.map((r) => {
    const mine = r.author === req.person;
    const open = mine || r.unlocked;
    return {
      id: r.id,
      author: r.author,
      mine,
      unlock_at: r.unlock_at,
      unlocked: !!r.unlocked,
      body: open ? r.body : null,
    };
  });
  res.json(visible);
});

app.post("/api/notes", auth, (req, res) => {
  const { body, unlock_at } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: "Write something first." });
  const when = unlock_at ? new Date(unlock_at).getTime() : Date.now();
  db.prepare(`INSERT INTO notes (author, body, unlock_at, created_at) VALUES (?,?,?,?)`)
    .run(req.person, body.trim(), when, Date.now());
  res.json({ ok: true });
});

// ---------- Wishlist / mood board ----------
app.get("/api/wishes", auth, (req, res) => {
  res.json(db.prepare(`SELECT * FROM wishes ORDER BY done, created_at DESC`).all());
});
app.post("/api/wishes", auth, (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: "Add an idea first." });
  db.prepare(`INSERT INTO wishes (author, body, done, created_at) VALUES (?,?,0,?)`)
    .run(req.person, body.trim(), Date.now());
  res.json({ ok: true });
});
app.post("/api/wishes/:id/toggle", auth, (req, res) => {
  db.prepare(`UPDATE wishes SET done = 1 - done WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});
app.delete("/api/wishes/:id", auth, (req, res) => {
  db.prepare(`DELETE FROM wishes WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ---------- Desire menu ----------
app.get("/api/desires", auth, (req, res) => {
  const mine = db.prepare(`SELECT item, answer FROM desires WHERE person = ?`).all(req.person);
  const partner = db.prepare(`SELECT item, answer FROM desires WHERE person = ?`).all(req.partner);
  const mineMap = Object.fromEntries(mine.map((r) => [r.item, r.answer]));
  const partnerMap = Object.fromEntries(partner.map((r) => [r.item, r.answer]));

  const rank = { yes: 2, maybe: 1, no: 0 };
  const matches = [];
  for (const item of DESIRE_ITEMS) {
    const a = mineMap[item];
    const b = partnerMap[item];
    if (a && b && a !== "no" && b !== "no") {
      // Overlap level = the cooler of the two answers
      const level = rank[a] <= rank[b] ? a : b;
      matches.push({ item, level });
    }
  }
  res.json({
    items: DESIRE_ITEMS.map((item) => ({ item, myAnswer: mineMap[item] || null })),
    partnerAnswered: partner.length,
    matches, // only revealed where both said yes/maybe
  });
});

app.post("/api/desires", auth, (req, res) => {
  const { item, answer } = req.body || {};
  if (!DESIRE_ITEMS.includes(item) || !["yes", "maybe", "no"].includes(answer)) {
    return res.status(400).json({ error: "Invalid selection." });
  }
  db.prepare(`
    INSERT INTO desires (person, item, answer) VALUES (?,?,?)
    ON CONFLICT(person, item) DO UPDATE SET answer = excluded.answer
  `).run(req.person, item, answer);
  res.json({ ok: true });
});

// ---------- Points / rewards ----------
app.get("/api/points", auth, (req, res) => {
  const totals = db.prepare(`SELECT person, COALESCE(SUM(delta),0) AS total FROM points GROUP BY person`).all();
  const map = Object.fromEntries(totals.map((t) => [t.person, t.total]));
  const log = db.prepare(`SELECT * FROM points ORDER BY created_at DESC LIMIT 30`).all();
  res.json({
    me: { name: req.person, total: map[req.person] || 0 },
    partner: { name: req.partner, total: map[req.partner] || 0 },
    log,
  });
});
app.post("/api/points", auth, (req, res) => {
  const { delta, reason } = req.body || {};
  const n = parseInt(delta, 10);
  if (!Number.isFinite(n) || !reason || !reason.trim()) {
    return res.status(400).json({ error: "Need a reason and an amount." });
  }
  db.prepare(`INSERT INTO points (person, delta, reason, created_at) VALUES (?,?,?,?)`)
    .run(req.person, n, reason.trim(), Date.now());
  res.json({ ok: true });
});

// ---------- Question / dare deck ----------
app.get("/api/deck/draw", auth, (req, res) => {
  const card = DECK[Math.floor(Math.random() * DECK.length)];
  res.json(card);
});
app.get("/api/deck/answers", auth, (req, res) => {
  res.json(db.prepare(`SELECT * FROM answers ORDER BY created_at DESC LIMIT 50`).all());
});
app.post("/api/deck/answers", auth, (req, res) => {
  const { prompt, body } = req.body || {};
  if (!prompt || !body || !body.trim()) return res.status(400).json({ error: "Answer first." });
  db.prepare(`INSERT INTO answers (person, prompt, body, created_at) VALUES (?,?,?,?)`)
    .run(req.person, prompt, body.trim(), Date.now());
  res.json({ ok: true });
});

// ---- Static ----
app.use(express.static(join(__dirname, "..", "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`weekend app on :${PORT}`));
