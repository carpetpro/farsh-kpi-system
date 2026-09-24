-- اسکیمای پایگاه‌داده شبکه فروش هوشمند فرش
-- اجرا: wrangler d1 execute farsh-kpi-db --file=./schema.sql --remote

CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  city TEXT,
  registration_code TEXT UNIQUE NOT NULL,
  telegram_chat_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | active | inactive
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- گزارش‌هایی که مغازه‌داران از طریق ربات تلگرام ثبت می‌کنند
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  type TEXT NOT NULL,          -- cash_sale_count | cash_sale_amount | installment_sale_count
                                -- installment_sale_amount | transfer_request | transfer_fulfilled | complaint_tryon
  value REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

-- رویدادهای وب‌اپ پرو مجازی (بازدید، شروع پرو، تکمیل پرو)
CREATE TABLE IF NOT EXISTS tryon_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER,
  session_id TEXT,
  event_type TEXT NOT NULL,    -- visit | tryon_start | tryon_complete
  product_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

-- وضعیت گفت‌وگوی جاری هر مغازه‌دار در ربات (برای مکالمه چندمرحله‌ای)
CREATE TABLE IF NOT EXISTS bot_state (
  chat_id TEXT PRIMARY KEY,
  store_id INTEGER,
  pending_action TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- شاخص‌هایی که به‌صورت دستی توسط مدیر وارد می‌شوند (مثل NPS، هزینه، ROI)
CREATE TABLE IF NOT EXISTS manual_kpi_values (
  kpi_id TEXT PRIMARY KEY,
  actual_value REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- مقدار هدف هر شاخص (قابل ویرایش از داشبورد)
CREATE TABLE IF NOT EXISTS kpi_targets (
  kpi_id TEXT PRIMARY KEY,
  target_value REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_store ON reports(store_id, type, created_at);
CREATE INDEX IF NOT EXISTS idx_tryon_store ON tryon_events(store_id, event_type, created_at);
