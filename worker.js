// آدرس وب‌هوک اختصاصی گوگل شیت شما
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxa0byIikD6g1KwT9RGlRx0CD-3RmLZCDUqrMd6cafWTCwwR8lGZovUqKXgB5m8cdO3/exec';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    async function initDB() {
      if (env.DB) {
        await env.DB.prepare(
          'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, role TEXT, business_id INTEGER)'
        ).run();
      }
    }

    // ۱. ورود کاربر (Login) و دریافت اطلاعات کسب‌وکار اختصاصی
    if (path === '/api/login' && request.method === 'POST') {
      try {
        await initDB();
        const { username, password } = await request.json();
        const cleanUser = username.trim().toLowerCase();

        if (env.DB) {
          const user = await env.DB.prepare(
            'SELECT * FROM users WHERE LOWER(username) = ? AND password = ?'
          ).bind(cleanUser, password).first();

          if (user) {
            return Response.json({
              success: true,
              user: { 
                id: user.id, 
                username: user.username, 
                role: user.role, 
                business_id: user.business_id || null 
              }
            });
          }
        }

        // ورود اضطراری ادمین اصلی با دسترسی کامل به همه کسب‌وکارها (business_id: null)
        if (cleanUser === 'admin' && (password === '8446Aba@dan' || password === 'admin')) {
          return Response.json({
            success: true,
            user: { id: 1, username: 'admin', role: 'admin', business_id: null }
          });
        }

        return Response.json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' }, { status: 401 });
      } catch (e) {
        return Response.json({ success: false, message: 'خطا در دیتابیس.' }, { status: 500 });
      }
    }

    // ۲. خواندن مستقیم داده‌ها از گوگل شیت بدون کلید پولی
    if (path === '/api/sheet-data' && request.method === 'GET') {
      try {
        const response = await fetch(APPS_SCRIPT_URL);
        const data = await response.json();
        return Response.json(data);
      } catch (e) {
        return Response.json({ success: false, message: 'خطا در دریافت اطلاعات از گوگل شیت.' }, { status: 500 });
      }
    }

    // ۳. دریافت لیست کاربران
    if (path === '/api/users' && request.method === 'GET') {
      try {
        await initDB();
        if (env.DB) {
          const { results } = await env.DB.prepare('SELECT id, username, role, business_id FROM users').all();
          return Response.json(results || []);
        }
        return Response.json([]);
      } catch (e) {
        return Response.json([]);
      }
    }

    // ۴. ثبت کاربر جدید همراه با انتساب به کسب‌وکار مشخص
    if (path === '/api/register' && request.method === 'POST') {
      try {
        await initDB();
        const { username, password, role, business_id } = await request.json();
        const cleanUser = username.trim().toLowerCase();

        if (env.DB) {
          await env.DB.prepare('INSERT INTO users (username, password, role, business_id) VALUES (?, ?, ?, ?)')
            .bind(cleanUser, password, role || 'user', business_id || null).run();

          return Response.json({ success: true, message: `کاربر "${cleanUser}" ساخته شد.` });
        }
        return Response.json({ success: false, message: 'خطا در دیتابیس D1.' }, { status: 500 });
      } catch (e) {
        return Response.json({ success: false, message: 'نام کاربری تکراری است یا خطایی رخ داده.' }, { status: 500 });
      }
    }

    // ۵. حذف کاربر
    if (path.startsWith('/api/users/') && request.method === 'DELETE') {
      try {
        const userId = path.split('/')[3];
        if (env.DB && userId) {
          await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
          return Response.json({ success: true, message: 'کاربر حذف شد.' });
        }
      } catch (e) {
        return Response.json({ success: false, message: 'خطا در حذف کاربر.' });
      }
    }

    // ۶. دریافت و افزودن کسب‌وکارها
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
