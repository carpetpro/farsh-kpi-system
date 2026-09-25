export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ساخت خودکار جدول کاربران
    async function initDB() {
      if (env.DB) {
        await env.DB.prepare(
          'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, role TEXT)'
        ).run();
      }
    }

    // ۱. ورود کاربر (Login)
    if (path === '/api/login' && request.method === 'POST') {
      try {
        await initDB();
        const { username, password } = await request.json();

        if (env.DB) {
          const user = await env.DB.prepare('SELECT * FROM users WHERE username = ? AND password = ?')
            .bind(username, password).first();

          if (user) {
            return Response.json({
              success: true,
              token: `token-${user.id}-${Date.now()}`,
              user: { id: user.id, username: user.username, role: user.role }
            });
          }
        }

        // ورود اضطراری اولیه
        if (username === 'admin' && (password === '123456' || password === 'admin')) {
          return Response.json({
            success: true,
            token: 'token-secret-fallback',
            user: { id: 1, username: 'admin', role: 'admin' }
          });
        }

        return Response.json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' }, { status: 401 });
      } catch (e) {
        return Response.json({ success: false, message: 'خطا در ارتباط با دیتابیس' }, { status: 500 });
      }
    }

    // ۲. تعریف کاربر جدید (Create User)
    if (path === '/api/register' && request.method === 'POST') {
      try {
        await initDB();
        const { username, password, role } = await request.json();

        if (env.DB) {
          // بررسی تکراری نبودن نام کاربری
          const existing = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
          if (existing) {
            return Response.json({ success: false, message: 'این نام کاربری قبلاً ثبت شده است.' }, { status: 400 });
          }

          // ذخیره کاربر جدید در D1
          await env.DB.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
            .bind(username, password, role || 'user').run();

          return Response.json({ success: true, message: `کاربر "${username}" با موفقیت تعریف شد.` });
        } else {
          return Response.json({ success: false, message: 'دیتابیس D1 متصل نیست.' }, { status: 500 });
        }
      } catch (e) {
        return Response.json({ success: false, message: 'خطا در ایجاد کاربر جدید.' }, { status: 500 });
      }
    }

    // ۳. تغییر رمز عبور
    if (path === '/api/change-password' && request.method === 'POST') {
      try {
        await initDB();
        const { userId, newPassword } = await request.json();

        if (env.DB) {
          await env.DB.prepare(
            'INSERT INTO users (id, username, password, role) VALUES (1, "admin", ?, "admin") ON CONFLICT(id) DO UPDATE SET password = ?'
          ).bind(newPassword, newPassword).run();

          return Response.json({ success: true, message: 'رمز عبور با موفقیت به‌روزرسانی شد.' });
        }
        return Response.json({ success: false, message: 'دیتابیس متصل نیست.' }, { status: 500 });
      } catch (e) {
        return Response.json({ success: false, message: 'خطا در تغییر رمز عبور.' }, { status: 500 });
      }
    }

    // ۴. دریافت و ساخت کسب‌وکارها
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

    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not Found', { status: 404 });
  }
};
