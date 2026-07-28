import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// On Railway, mount a volume at /data for persistence. Falls back to local file.
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

  -- Wishlist / mood board items
  CREATE TABLE IF NOT EXISTS wishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  -- Desire menu: each row is one person's answer to one item
  CREATE TABLE IF NOT EXISTS desires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person TEXT NOT NULL,
    item TEXT NOT NULL,
    answer TEXT NOT NULL,            -- yes | maybe | no
    UNIQUE(person, item)
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
`);

export default db;
