export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ۱. ورود کاربر (بررسی از جدول users)
    if (path === '/api/login' && request.method === 'POST') {
      const { username, password } = await request.json();
      
      const user = await env.DB.prepare(
        'SELECT u.*, b.name as business_name FROM users u LEFT JOIN businesses b ON u.business_id = b.id WHERE u.username = ? AND u.password = ?'
      ).bind(username, password).first();

      if (user) {
        return Response.json({
          success: true,
          token: `token-${user.id}-${Date.now()}`,
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            business_id: user.business_id,
            business_name: user.business_name || 'مدیریت کل'
          }
        });
      } else {
        return Response.json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' }, { status: 401 });
      }
    }

    // ۲. تغییر رمز عبور
    if (path === '/api/change-password' && request.method === 'POST') {
      const { userId, currentPassword, newPassword } = await request.json();

      // بررسی رمز فعلی
      const user = await env.DB.prepare('SELECT * FROM users WHERE id = ? AND password = ?')
        .bind(userId, currentPassword).first();

      if (!user) {
        return Response.json({ success: false, message: 'رمز عبور فعلی نادرست است.' }, { status: 400 });
      }

      // به‌روزرسانی رمز جدید
      await env.DB.prepare('UPDATE users SET password = ? WHERE id = ?')
        .bind(newPassword, userId).run();

      return Response.json({ success: true, message: 'رمز عبور با موفقیت تغییر یافت.' });
    }

    // ۳. دریافت لیست کسب‌وکارها (مخصوص مدیر کل)
    if (path === '/api/businesses' && request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM businesses').all();
      return Response.json(results);
    }

    // ۴. ساخت کسب‌وکار جدید (مخصوص مدیر کل)
    if (path === '/api/businesses' && request.method === 'POST') {
      const { name } = await request.json();
      await env.DB.prepare('INSERT INTO businesses (name) VALUES (?)').bind(name).run();
      return Response.json({ success: true, message: 'کسب‌وکار جدید ثبت شد.' });
    }

    // سرو کردن فایل‌های استاتیک
    return env.ASSETS.fetch(request);
  }
};
