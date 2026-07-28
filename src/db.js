import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const dataDir = process.env.DATA_DIR || join(__dirname, "..", "data");
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, "weekend.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- Timed love notes / dead drop
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    unlock_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- Wishlist items for the current week (regenerated each Sunday night)
  CREATE TABLE IF NOT EXISTS wishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week TEXT NOT NULL,
    body TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
  );

  -- Desire menu items for the current week
  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week TEXT NOT NULL,
    body TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0   -- both-want match checked off & cleared
  );

  -- Each person's private answer to a menu item
  CREATE TABLE IF NOT EXISTS menu_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    person TEXT NOT NULL,
    answer TEXT NOT NULL,             -- yes | maybe | no
    UNIQUE(item_id, person)
  );

  -- Points / rewards
  CREATE TABLE IF NOT EXISTS points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- Question / dare deck answers
  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person TEXT NOT NULL,
    prompt TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- Inbox: photos + notes sent from one person to the other (private to recipient)
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT NOT NULL,
    recipient TEXT NOT NULL,
    body TEXT,                       -- optional caption / note
    photo TEXT,                      -- filename in the photos dir, or NULL
    prompt TEXT,                     -- set when this came from a deck dare
    seen INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
`);

// ---- Migrations ----
// Earlier versions of this app created `wishes` and `menu_items` with a
// different set of columns. `CREATE TABLE IF NOT EXISTS` above does nothing when
// the table already exists, so on a volume carried over from an older deploy the
// stale shape survives — and inserts using the new columns then fail every time,
// which shows up as a permanently empty menu/wishlist. Detect a missing expected
// column and rebuild the table (its rows are regenerated weekly anyway).
function columns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}
function ensureColumns(table, required, createSql) {
  const cols = columns(table);
  const missing = required.filter((c) => !cols.includes(c));
  if (missing.length) {
    console.log(`Migrating '${table}' — missing columns: ${missing.join(", ")}. Rebuilding.`);
    db.exec(`DROP TABLE IF EXISTS ${table};`);
    db.exec(createSql);
  }
}

ensureColumns("wishes", ["week", "body", "done"], `
  CREATE TABLE wishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week TEXT NOT NULL,
    body TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
  );
`);

ensureColumns("menu_items", ["week", "body", "done"], `
  CREATE TABLE menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week TEXT NOT NULL,
    body TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
  );
`);

// If we rebuilt an item table, force a regenerate by clearing the week flag so
// ensureWeek() repopulates on the next request.
const wishCols = columns("wishes");
const menuCols = columns("menu_items");
if (wishCols.includes("week") && menuCols.includes("week")) {
  const wc = db.prepare("SELECT COUNT(*) AS c FROM wishes").get().c;
  const mc = db.prepare("SELECT COUNT(*) AS c FROM menu_items").get().c;
  if (wc === 0 || mc === 0) {
    db.prepare("DELETE FROM meta WHERE key = 'current_week'").run();
  }
}

export default db;
