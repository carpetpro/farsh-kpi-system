-- جدول کسب‌وکارها (Tenants)
CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- جدول کاربران و مدیران
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER,                   -- کد کسب‌وکاری که کاربر به آن دسترسی دارد
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,          -- رمز عبور (هش‌شده یا مستقیم)
  role TEXT NOT NULL DEFAULT 'manager', -- admin (مدیر کل) | manager (مدیر کسب‌وکار)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id)
);
