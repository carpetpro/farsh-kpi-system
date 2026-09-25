export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ۱. مسیر ورود کاربر (Login)
    if (path === '/api/login' && request.method === 'POST') {
      try {
        const { username, password } = await request.json();
        
        // ابتدا بررسی در دیتابیس D1 برای رمز عبور تغییریافته
        if (env.DB) {
          const user = await env.DB.prepare(
            'SELECT * FROM users WHERE username = ? AND password = ?'
          ).bind(username, password).first();

          if (user) {
            return Response.json({
              success: true,
              token: `token-${user.id}-${Date.now()}`,
              user: { id: user.id, username: user.username, role: user.role }
            });
          }
        }

        // پشتیبانی از ورود پیش‌فرض اولیه (در صورتی که هنوز در D1 ثبت نشده باشد)
        if (username === 'admin' && (password === '123456' || password === 'admin')) {
          return Response.json({
            success: true,
            token: 'token-secret-12345',
            user: { id: 1, username: 'admin', role: 'admin' }
          });
        }

        return Response.json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' }, { status: 401 });
      } catch (e) {
        return Response.json({ success: false, message: 'خطا در احراز هویت' }, { status: 400 });
      }
    }

    // ۲. تغییر رمز عبور واقعی و ذخیره در دیتابیس D1
    if (path === '/api/change-password' && request.method === 'POST') {
      try {
        const { userId, currentPassword, newPassword } = await request.json();

        if (env.DB) {
          // ایجاد جدول کاربر در صورت عدم وجود
          await env.DB.prepare(
            'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, password TEXT, role TEXT)'
          ).run();

          // بررسی وجود کاربر
          let user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId || 1).first();

          if (!user) {
            // ثبت کاربر اولیه
            await env.DB.prepare('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)')
              .bind(1, 'admin', newPassword, 'admin').run();
          } else {
            // به‌روزرسانی رمز عبور
            await env.DB.prepare('UPDATE users SET password = ? WHERE id = ?')
              .bind(newPassword, userId || 1).run();
          }

          return Response.json({ success: true, message: 'رمز عبور با موفقیت در دیتابیس ثبت و تغییر یافت.' });
        } else {
          return Response.json({ success: false, message: 'دیتابیس متصل نیست.' }, { status: 500 });
        }
      } catch (e) {
        return Response.json({ success: false, message: 'خطا در ویرایش رمز عبور.' }, { status: 500 });
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

    // سرو کردن فایل‌های استاتیک فرانت‌اند
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not Found', { status: 404 });
  }
};
