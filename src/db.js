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

export default db;
