export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ۱. ساخت خودکار جدول کاربران در صورت عدم وجود
    async function initDB() {
      if (env.DB) {
        await env.DB.prepare(
          'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, role TEXT)'
        ).run();
      }
    }

    // ۲. ورود کاربر (Login)
    if (path === '/api/login' && request.method === 'POST') {
      try {
        await initDB();
        const { username, password } = await request.json();
        const cleanUser = username.trim().toLowerCase();

        // الف) بررسی در دیتابیس D1
        if (env.DB) {
          const user = await env.DB.prepare(
            'SELECT * FROM users WHERE LOWER(username) = ? AND password = ?'
          ).bind(cleanUser, password).first();

          if (user) {
            return Response.json({
              success: true,
              token: `token-${user.id}-${Date.now()}`,
              user: { id: user.id, username: user.username, role: user.role }
            });
          }
        }

        // ب) ورود اضطراری برای ادمین اصلی (رمز جدید اضطراری: 8446Aba@dan)
        if (cleanUser === 'admin' && (password === '8446Aba@dan' || password === 'admin')) {
          return Response.json({
            success: true,
            token: 'token-admin-fallback',
            user: { id: 1, username: 'admin', role: 'admin' }
          });
        }

        return Response.json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' }, { status: 401 });
      } catch (e) {
        return Response.json({ success: false, message: 'خطا در احراز هویت دیتابیس.' }, { status: 500 });
      }
    }

    // ۳. ثبت/تعریف کاربر جدید (Register)
    if (path === '/api/register' && request.method === 'POST') {
      try {
        await initDB();
        const { username, password, role } = await request.json();
        const cleanUser = username.trim().toLowerCase();

        if (env.DB) {
          // بررسی تکراری نبودن
          const existing = await env.DB.prepare('SELECT * FROM users WHERE LOWER(username) = ?')
            .bind(cleanUser).first();

          if (existing) {
            return Response.json({ success: false, message: 'این نام کاربری قبلاً ساخته شده است.' }, { status: 400 });
          }

          // ذخیره در D1
          await env.DB.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
            .bind(cleanUser, password, role || 'user').run();

          return Response.json({ success: true, message: `کاربر "${cleanUser}" با موفقیت تعریف شد و آماده ورود است.` });
        } else {
          return Response.json({ success: false, message: 'پایگاه داده D1 متصل نیست.' }, { status: 500 });
        }
      } catch (e) {
        return Response.json({ success: false, message: 'خطا در ساخت کاربر جدید در دیتابیس.' }, { status: 500 });
      }
    }

    // ۴. تغییر رمز عبور
    if (path === '/api/change-password' && request.method === 'POST') {
      try {
        await initDB();
        const { userId, newPassword } = await request.json();

        if (env.DB) {
          await env.DB.prepare(
            'INSERT INTO users (id, username, password, role) VALUES (1, "admin", ?, "admin") ON CONFLICT(id) DO UPDATE SET password = ?'
          ).bind(newPassword, newPassword).run();

          return Response.json({ success: true, message: 'رمز عبور با موفقیت تغییر یافت.' });
        }
        return Response.json({ success: false, message: 'دیتابیس متصل نیست.' }, { status: 500 });
      } catch (e) {
        return Response.json({ success: false, message: 'خطا در تغییر رمز عبور.' }, { status: 500 });
      }
    }

    // ۵. دریافت و افزودن کسب‌وکارها
    if (path === '/api/businesses' && request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare('SELECT * FROM businesses').all();
        return Response.json(results || []);
      } catch (e) {
        return Response.json([{ id: 1, name: 'کسب‌وکار مرکزی' }]);
      }
    }

    if (path === '/api/businesses' && request.method === 'POST') {
      try {
        const { name } = await request.json();
        await env.DB.prepare('INSERT INTO businesses (name) VALUES (?)').bind(name).run();
        return Response.json({ success: true, message: 'کسب‌وکار جدید اضافه شد.' });
      } catch (e) {
        return Response.json({ success: false, message: 'خطا در ساخت کسب‌وکار' }, { status: 500 });
      }
    }

    // سرو کردن فایل‌های استاتیک فرانت‌اند
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not Found', { status: 404 });
  }
};
