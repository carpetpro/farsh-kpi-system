export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ۱. مسیر ورود کاربر (Login)
    if (path === '/api/login' && request.method === 'POST') {
      try {
        const { username, password } = await request.json();
        
        // ابتدا بررسی در دیتابیس D1
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

        // پشتیبانی از ورود پیش‌فرض اولیه
        if (username === 'admin' && password === '123456') {
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

    // ۲. تغییر رمز عبور واقعی (Change Password)
    if (path === '/api/change-password' && request.method === 'POST') {
      try {
        const { userId, currentPassword, newPassword } = await request.json();

        if (env.DB) {
          // بررسی صحت رمز فعلی در دیتابیس
          const user = await env.DB.prepare('SELECT * FROM users WHERE id = ? AND password = ?')
            .bind(userId || 1, currentPassword).first();

          if (!user && currentPassword !== '123456') {
            return Response.json({ success: false, message: 'رمز عبور فعلی نادرست است.' }, { status: 400 });
          }

          // ثبت رمز عبور جدید در دیتابیس D1
          await env.DB.prepare('UPDATE users SET password = ? WHERE id = ?')
            .bind(newPassword, userId || 1).run();

          return Response.json({ success: true, message: 'رمز عبور با موفقیت تغییر یافت.' });
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

    // سرو کردن فایل‌های فرانت‌اند
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not Found', { status: 404 });
  }
};
