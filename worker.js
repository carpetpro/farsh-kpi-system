export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ایجاد خودکار جدول کاربران در صورت عدم وجود
    async function initDB() {
      if (env.DB) {
        await env.DB.prepare(
          'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT, role TEXT)'
        ).run();
      }
    }

    // ۱. مسیر ورود (Login)
    if (path === '/api/login' && request.method === 'POST') {
      try {
        await initDB();
        const { username, password } = await request.json();

        // الف) بررسی در دیتابیس D1
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

        // ب) رمز عبور اضطراری/پشتیبان (جهت جلوگیری از قفل شدن دسترسی)
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

    // ۲. مسیر تغییر رمز عبور (Change Password)
    if (path === '/api/change-password' && request.method === 'POST') {
      try {
        await initDB();
        const { userId, currentPassword, newPassword } = await request.json();

        if (env.DB) {
          // ثبت یا به‌روزرسانی کاربر admin در دیتابیس D1
          await env.DB.prepare(
            'INSERT INTO users (id, username, password, role) VALUES (1, "admin", ?, "admin") ON CONFLICT(id) DO UPDATE SET password = ?'
          ).bind(newPassword, newPassword).run();

          return Response.json({ success: true, message: 'رمز عبور جدید با موفقیت در دیتابیس ذخیره شد.' });
        } else {
          return Response.json({ success: false, message: 'دیتابیس D1 متصل نیست.' }, { status: 500 });
        }
      } catch (e) {
        return Response.json({ success: false, message: 'خطا در ویرایش رمز عبور در دیتابیس.' }, { status: 500 });
      }
    }

    // ۳. دریافت لیست کسب‌وکارها
    if (path === '/api/businesses' && request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare('SELECT * FROM businesses').all();
        return Response.json(results || []);
      } catch (e) {
        return Response.json([{ id: 1, name: 'کسب‌وکار مرکزی' }]);
      }
    }

    // ۴. ساخت کسب‌وکار جدید
    if (path === '/api/businesses' && request.method === 'POST') {
      try {
        const { name } = await request.json();
        await env.DB.prepare('INSERT INTO businesses (name) VALUES (?)').bind(name).run();
        return Response.json({ success: true, message: 'کسب‌وکار جدید اضافه شد.' });
      } catch (e) {
        return Response.json({ success: false, message: 'خطا در ساخت کسب‌وکار' }, { status: 500 });
      }
    }

    // سرو کردن فایل‌های فرانت‌اند
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not Found', { status: 404 });
  }
};
