-- Cloudflare D1 schema for finance-overview, the live finance dashboard.
-- Run once: wrangler d1 execute finance-overview --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  item_id TEXT,                -- the plaid_items row this account came from
  source TEXT NOT NULL,        -- institution name, or 'openfinance'
  name TEXT NOT NULL,
  type TEXT,
  currency TEXT NOT NULL,
  balance REAL NOT NULL,
  available REAL,
  credit_limit REAL,           -- credit cards: the issuer's reported limit
  manual_limit REAL,           -- credit limit you entered yourself, survives syncs
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,        -- negative = money out, positive = money in
  currency TEXT NOT NULL,
  category TEXT,
  pending INTEGER DEFAULT 0,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(account_id, date DESC);

CREATE TABLE IF NOT EXISTS alerts_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule TEXT NOT NULL,          -- dedupe key, e.g. large_tx:<txid>
  message TEXT NOT NULL,
  sent_at TEXT NOT NULL
);

-- Plaid connections, one row per linked institution. Written by /api/link/exchange
-- when a bank is linked through Plaid Link at /link.
CREATE TABLE IF NOT EXISTS plaid_items (
  item_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  institution TEXT,
  added_at TEXT NOT NULL
);

-- Investment holdings, one row per account+security. Replaced wholesale each
-- sync so a sold position disappears rather than lingering.
CREATE TABLE IF NOT EXISTS holdings (
  id TEXT PRIMARY KEY,         -- account_id:security_id
  account_id TEXT NOT NULL,
  ticker TEXT,
  name TEXT NOT NULL,
  type TEXT,                   -- equity, etf, mutual fund, cash, crypto
  sector TEXT,
  quantity REAL,
  cost_basis REAL,
  value REAL NOT NULL,
  currency TEXT,
  updated_at TEXT NOT NULL
);

-- Your category corrections, keyed on the merchant name. Applied when the
-- dashboard is built, so a change recategorises history without a re-sync.
CREATE TABLE IF NOT EXISTS category_overrides (
  merchant TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
