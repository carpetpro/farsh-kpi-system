/**
 * شبکه فروش هوشمند فرش — بک‌اند Cloudflare Worker
 * مسیرها:
 *   POST /api/login              ورود مدیر با رمز مشترک
 *   POST /api/logout             خروج
 *   GET  /api/me                 بررسی نشست فعال
 *   GET  /api/kpis                خروجی همه شاخص‌ها (نیاز به نشست)
 *   POST /api/manual-kpi         ثبت مقدار دستی یک شاخص (نیاز به نشست)
 *   POST /api/kpi-target         ثبت هدف یک شاخص (نیاز به نشست)
 *   GET  /api/stores             لیست فروشگاه‌ها (نیاز به نشست)
 *   POST /api/stores             ایجاد فروشگاه جدید + کد ثبت‌نام (نیاز به نشست)
 *   POST /api/telegram-webhook/:secret   وبهوک ربات تلگرام (بدون نشست، با secret در مسیر)
 *   POST /api/tryon-event        وبهوک وب‌اپ پرو مجازی (بدون نشست، با X-API-Key)
 */

const SESSION_COOKIE = "farsh_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // ۱۴ روز

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path.startsWith("/api/")) {
        return await handleApi(request, env, path, url);
      }
      // هر چیز غیر از /api/* را asset استاتیک (داشبورد) سرو کن
      return env.ASSETS.fetch(request);
    } catch (err) {
      return json({ error: "internal_error", message: String(err && err.message || err) }, 500);
    }
  }
};

async function handleApi(request, env, path, url) {
  const method = request.method;

  // --- مسیرهای عمومی (بدون نیاز به نشست ادمین) ---
  if (path === "/api/login" && method === "POST") return handleLogin(request, env);
  if (path === "/api/logout" && method === "POST") return handleLogout();
  if (path.startsWith("/api/telegram-webhook/") && method === "POST")
    return handleTelegramWebhook(request, env, path);
  if (path === "/api/tryon-event" && method === "POST") return handleTryonEvent(request, env);

  // --- از اینجا به بعد نیاز به نشست معتبر مدیر ---
  const session = await getSession(request, env);
  if (path === "/api/me" && method === "GET") {
    return json({ authenticated: !!session });
  }
  if (!session) return json({ error: "unauthorized" }, 401);

  if (path === "/api/kpis" && method === "GET") return handleGetKpis(env);
  if (path === "/api/manual-kpi" && method === "POST") return handleSetManualKpi(request, env);
  if (path === "/api/kpi-target" && method === "POST") return handleSetTarget(request, env);
  if (path === "/api/stores" && method === "GET") return handleListStores(env);
  if (path === "/api/stores" && method === "POST") return handleCreateStore(request, env);

  return json({ error: "not_found" }, 404);
}

/* ---------------------------- احراز هویت ---------------------------- */

async function handleLogin(request, env) {
  const body = await safeJson(request);
  const password = body && body.password;
  if (!password || password !== env.ADMIN_PASSWORD) {
    return json({ error: "invalid_password" }, 401);
  }
  const token = await signSession(env.SESSION_SECRET, SESSION_TTL_SECONDS);
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`
  );
  return new Response(JSON.stringify({ ok: true }), { headers });
}

function handleLogout() {
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return new Response(JSON.stringify({ ok: true }), { headers });
}

async function getSession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  return await verifySession(match[1], env.SESSION_SECRET);
}

async function signSession(secret, ttlSeconds) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = JSON.stringify({ exp });
  const payloadB64 = base64UrlEncode(payload);
  const sig = await hmac(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

async function verifySession(token, secret) {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = await hmac(secret, payloadB64);
  if (expected !== sig) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function hmac(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(sig)));
}

function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return atob(str);
}

/* ---------------------------- شاخص‌ها (KPI) ---------------------------- */

// شناسه شاخص‌هایی که به‌صورت خودکار از دیتابیس محاسبه می‌شوند در برابر
// شاخص‌هایی که مدیر باید دستی وارد کند (چون منبع داده‌شان بیرون از این سیستم است)
const AUTO_KPIS = [
  "acq_active", "acq_geo",
  "ad_ar", "ad_network", "ad_installment",
  "ef_saved", "ef_installment_share",
  "q_complaint"
];
const MANUAL_KPIS = [
  "acq_rate", "acq_retention",
  "ef_conv", "ef_aov",
  "fin_cost", "fin_incremental", "fin_roi", "fin_cac",
  "q_nps", "q_default"
];

async function handleGetKpis(env) {
  const since30 = isoDaysAgo(30);
  const sinceMonth = isoStartOfMonth();

  const [activeStores, geo, tryonVisits, tryonStarts, networkTransfers,
    totalOrders, installmentCount, transferFulfilled, transferRequested,
    installmentAmount, cashAmount, complaints] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(DISTINCT store_id) n FROM (
         SELECT store_id, created_at FROM reports WHERE created_at >= ?
         UNION ALL
         SELECT store_id, created_at FROM tryon_events WHERE created_at >= ?
       )`
    ).bind(since30, since30).first(),
    env.DB.prepare(
      `SELECT COUNT(DISTINCT city) n FROM stores WHERE status = 'active' AND city IS NOT NULL AND city != ''`
    ).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM tryon_events WHERE event_type='visit' AND created_at >= ?`).bind(sinceMonth).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM tryon_events WHERE event_type='tryon_start' AND created_at >= ?`).bind(sinceMonth).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM reports WHERE type='transfer_request' AND created_at >= ?`).bind(sinceMonth).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM reports WHERE type IN ('cash_sale_count','installment_sale_count') AND created_at >= ?`).bind(sinceMonth).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM reports WHERE type='installment_sale_count' AND created_at >= ?`).bind(sinceMonth).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM reports WHERE type='transfer_fulfilled' AND created_at >= ?`).bind(sinceMonth).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM reports WHERE type='transfer_request' AND created_at >= ?`).bind(sinceMonth).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(value),0) n FROM reports WHERE type='installment_sale_amount' AND created_at >= ?`).bind(sinceMonth).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(value),0) n FROM reports WHERE type='cash_sale_amount' AND created_at >= ?`).bind(sinceMonth).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM reports WHERE type='complaint_tryon' AND created_at >= ?`).bind(sinceMonth).first()
  ]);

  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

  const auto = {
    acq_active: activeStores.n,
    acq_geo: geo.n,
    ad_ar: pct(tryonStarts.n, tryonVisits.n),
    ad_network: pct(networkTransfers.n, totalOrders.n || 0),
    ad_installment: pct(installmentCount.n, totalOrders.n || 0),
    ef_saved: pct(transferFulfilled.n, transferRequested.n),
    ef_installment_share: pct(installmentAmount.n, (installmentAmount.n + cashAmount.n)),
    q_complaint: pct(complaints.n, tryonStarts.n)
  };

  const manualRows = await env.DB.prepare(`SELECT kpi_id, actual_value FROM manual_kpi_values`).all();
  const manual = {};
  for (const row of manualRows.results) manual[row.kpi_id] = row.actual_value;

  const targetRows = await env.DB.prepare(`SELECT kpi_id, target_value FROM kpi_targets`).all();
  const targets = {};
  for (const row of targetRows.results) targets[row.kpi_id] = row.target_value;

  return json({ auto, manual, targets, autoKpiIds: AUTO_KPIS, manualKpiIds: MANUAL_KPIS });
}

async function handleSetManualKpi(request, env) {
  const body = await safeJson(request);
  if (!body || !MANUAL_KPIS.includes(body.kpi_id)) return json({ error: "invalid_kpi" }, 400);
  await env.DB.prepare(
    `INSERT INTO manual_kpi_values (kpi_id, actual_value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(kpi_id) DO UPDATE SET actual_value = excluded.actual_value, updated_at = datetime('now')`
  ).bind(body.kpi_id, body.value === "" || body.value === null ? null : Number(body.value)).run();
  return json({ ok: true });
}

async function handleSetTarget(request, env) {
  const body = await safeJson(request);
  if (!body || !body.kpi_id) return json({ error: "invalid_kpi" }, 400);
  await env.DB.prepare(
    `INSERT INTO kpi_targets (kpi_id, target_value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(kpi_id) DO UPDATE SET target_value = excluded.target_value, updated_at = datetime('now')`
  ).bind(body.kpi_id, body.value === "" || body.value === null ? null : Number(body.value)).run();
  return json({ ok: true });
}

/* ---------------------------- مدیریت فروشگاه‌ها ---------------------------- */

async function handleListStores(env) {
  const rows = await env.DB.prepare(
    `SELECT id, name, city, registration_code, telegram_chat_id, status, created_at FROM stores ORDER BY created_at DESC`
  ).all();
  return json({ stores: rows.results });
}

async function handleCreateStore(request, env) {
  const body = await safeJson(request);
  if (!body || !body.name) return json({ error: "name_required" }, 400);
  const code = generateCode();
  await env.DB.prepare(
    `INSERT INTO stores (name, city, registration_code, status) VALUES (?, ?, ?, 'pending')`
  ).bind(body.name, body.city || null, code).run();
  return json({ ok: true, registration_code: code });
}

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/* ---------------------------- وبهوک وب‌اپ پرو مجازی ---------------------------- */

async function handleTryonEvent(request, env) {
  const apiKey = request.headers.get("X-API-Key");
  if (!apiKey || apiKey !== env.TRYON_API_KEY) return json({ error: "unauthorized" }, 401);

  const body = await safeJson(request);
  if (!body || !body.event_type || !["visit", "tryon_start", "tryon_complete"].includes(body.event_type)) {
    return json({ error: "invalid_event_type" }, 400);
  }

  let storeId = null;
  if (body.store_code) {
    const store = await env.DB.prepare(`SELECT id FROM stores WHERE registration_code = ?`).bind(body.store_code).first();
    if (store) storeId = store.id;
  }

  await env.DB.prepare(
    `INSERT INTO tryon_events (store_id, session_id, event_type, product_id) VALUES (?, ?, ?, ?)`
  ).bind(storeId, body.session_id || null, body.event_type, body.product_id || null).run();

  return json({ ok: true });
}

/* ---------------------------- ربات تلگرام ---------------------------- */

const MAIN_MENU_KEYBOARD = {
  inline_keyboard: [
    [{ text: "📦 ثبت فروش نقدی امروز", callback_data: "cash" }],
    [{ text: "💳 ثبت فروش اقساطی امروز", callback_data: "installment" }],
    [{ text: "🔁 درخواست انتقال کالا از انبار دیگر", callback_data: "transfer_req" }],
    [{ text: "✅ اعلام تأمین‌شدن یک درخواست انتقال", callback_data: "transfer_ok" }],
    [{ text: "⚠️ ثبت شکایت مشتری از پرو مجازی", callback_data: "complaint" }]
  ]
};

const ACTION_PROMPTS = {
  cash_count: "چند فقره فروش نقدی امروز داشتید؟ فقط عدد را بفرستید.",
  cash_amount: "مجموع مبلغ فروش نقدی امروز چند تومان بود؟ فقط عدد را بفرستید.",
  installment_count: "چند فقره فروش اقساطی امروز داشتید؟ فقط عدد را بفرستید.",
  installment_amount: "مجموع مبلغ فروش اقساطی امروز چند تومان بود؟ فقط عدد را بفرستید.",
  transfer_req: "چند مورد امروز کالای موردنظر مشتری را نداشتید و از فروشگاه دیگر درخواست کردید؟ فقط عدد را بفرستید.",
  transfer_ok: "چند مورد از درخواست‌های انتقال کالا امروز با موفقیت تأمین شد؟ فقط عدد را بفرستید.",
  complaint: "چند مورد شکایت مشتری از عدم تطابق پرو مجازی با کالای واقعی داشتید؟ فقط عدد را بفرستید."
};

async function handleTelegramWebhook(request, env, path) {
  const secretInPath = path.split("/api/telegram-webhook/")[1];
  if (!secretInPath || secretInPath !== env.TELEGRAM_WEBHOOK_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  const update = await safeJson(request);
  if (!update) return json({ ok: true });

  const token = env.TELEGRAM_BOT_TOKEN;

  if (update.callback_query) {
    const chatId = String(update.callback_query.message.chat.id);
    const action = update.callback_query.data;
    await answerCallbackQuery(token, update.callback_query.id);
    await handleMenuSelection(env, token, chatId, action);
    return json({ ok: true });
  }

  if (update.message && update.message.text) {
    const chatId = String(update.message.chat.id);
    const text = update.message.text.trim();

    if (text === "/start") {
      const store = await env.DB.prepare(`SELECT id FROM stores WHERE telegram_chat_id = ?`).bind(chatId).first();
      if (store) {
        await sendMessage(token, chatId, "خوش آمدید. یکی از گزینه‌ها را انتخاب کنید:", MAIN_MENU_KEYBOARD);
      } else {
        await sendMessage(token, chatId, "سلام 👋\nبرای شروع، کد ثبت‌نام فروشگاه خود را که از مدیریت شبکه دریافت کرده‌اید ارسال کنید.");
      }
      return json({ ok: true });
    }

    const state = await env.DB.prepare(`SELECT * FROM bot_state WHERE chat_id = ?`).bind(chatId).first();

    // مرحله ثبت کد فروشگاه
    if (!state || !state.store_id) {
      const store = await env.DB.prepare(`SELECT id FROM stores WHERE registration_code = ? AND telegram_chat_id IS NULL`).bind(text.toUpperCase()).first();
      if (store) {
        await env.DB.prepare(`UPDATE stores SET telegram_chat_id = ?, status = 'active' WHERE id = ?`).bind(chatId, store.id).run();
        await env.DB.prepare(
          `INSERT INTO bot_state (chat_id, store_id, pending_action, updated_at) VALUES (?, ?, NULL, datetime('now'))
           ON CONFLICT(chat_id) DO UPDATE SET store_id = excluded.store_id, pending_action = NULL, updated_at = datetime('now')`
        ).bind(chatId, store.id).run();
        await sendMessage(token, chatId, "فروشگاه شما با موفقیت به شبکه متصل شد ✅\nاز این پس هر روز از همین‌جا گزارش فروش ثبت کنید:", MAIN_MENU_KEYBOARD);
      } else {
        await sendMessage(token, chatId, "کد وارد‌شده معتبر نیست. لطفاً کد ثبت‌نامی که از مدیریت دریافت کرده‌اید را دوباره بفرستید.");
      }
      return json({ ok: true });
    }

    // مرحله پاسخ به یک اقدام در انتظار (پرسیدن عدد)
    if (state.pending_action) {
      const num = Number(text.replace(/[,٬]/g, ""));
      if (isNaN(num)) {
        await sendMessage(token, chatId, "لطفاً فقط یک عدد ارسال کنید.");
        return json({ ok: true });
      }
      const next = await recordPendingAction(env, state.store_id, state.pending_action, num);
      if (next) {
        // مرحله دوم همین گزارش (مثلاً بعد از تعداد، پرسیدن مبلغ)
        await sendMessage(token, chatId, ACTION_PROMPTS[next]);
      } else {
        await env.DB.prepare(`UPDATE bot_state SET pending_action = NULL, updated_at = datetime('now') WHERE chat_id = ?`).bind(chatId).run();
        await sendMessage(token, chatId, "ثبت شد ✅ متشکریم.\nگزینه بعدی:", MAIN_MENU_KEYBOARD);
      }
      return json({ ok: true });
    }

    await sendMessage(token, chatId, "برای ثبت گزارش، از دکمه‌های زیر استفاده کنید:", MAIN_MENU_KEYBOARD);
  }

  return json({ ok: true });
}

// انتخاب از منو ممکن است به دو پرسش نیاز داشته باشد (مثلاً فروش نقدی: تعداد + مبلغ)
// این تابع اولین پرسش را تنظیم می‌کند؛ پرسش دوم در recordPendingAction زنجیره می‌شود
async function handleMenuSelection(env, token, chatId, action) {
  const chain = {
    cash: "cash_count",
    installment: "installment_count",
    transfer_req: "transfer_req",
    transfer_ok: "transfer_ok",
    complaint: "complaint"
  };
  const firstStep = chain[action];
  if (!firstStep) return;
  await env.DB.prepare(
    `UPDATE bot_state SET pending_action = ?, updated_at = datetime('now') WHERE chat_id = ?`
  ).bind(firstStep, chatId).run();
  await sendMessage(token, chatId, ACTION_PROMPTS[firstStep]);
}

const REPORT_TYPE_MAP = {
  cash_count: "cash_sale_count",
  cash_amount: "cash_sale_amount",
  installment_count: "installment_sale_count",
  installment_amount: "installment_sale_amount",
  transfer_req: "transfer_request",
  transfer_ok: "transfer_fulfilled",
  complaint: "complaint_tryon"
};

// بعضی مراحل دو قدمی هستند (تعداد سپس مبلغ)
const NEXT_STEP = {
  cash_count: "cash_amount",
  installment_count: "installment_amount"
};

async function recordPendingAction(env, storeId, pendingAction, value) {
  const reportType = REPORT_TYPE_MAP[pendingAction];
  await env.DB.prepare(`INSERT INTO reports (store_id, type, value) VALUES (?, ?, ?)`)
    .bind(storeId, reportType, value).run();

  const next = NEXT_STEP[pendingAction];
  if (next) {
    await env.DB.prepare(
      `UPDATE bot_state SET pending_action = ?, updated_at = datetime('now') WHERE store_id = ?`
    ).bind(next, storeId).run();
    // پیام پرسش بعدی توسط تماس‌گیرنده (handleTelegramWebhook) پس از این تابع فرستاده نمی‌شود؛
    // بنابراین این حالت را جدا مدیریت می‌کنیم:
    return next;
  }
  return null;
}

async function sendMessage(token, chatId, text, replyMarkup) {
  const payload = { chat_id: chatId, text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function answerCallbackQuery(token, callbackQueryId) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  });
}

/* ---------------------------- ابزارهای کمکی ---------------------------- */

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function safeJson(request) {
  try { return await request.json(); } catch { return null; }
}

function isoDaysAgo(days) {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function isoStartOfMonth() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return d.toISOString().slice(0, 19).replace("T", " ");
}
