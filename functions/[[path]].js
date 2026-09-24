export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. مسیر ورود (Login)
  if (path === '/api/login' && request.method === 'POST') {
    try {
      const { username, password } = await request.json();
      
      if (username === 'admin' && password === '123456') {
        return Response.json({ 
          success: true, 
          token: 'token-secret-12345',
          user: { username: 'admin', role: 'مدیر سیستم' } 
        });
      } else {
        return Response.json(
          { success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' }, 
          { status: 401 }
        );
      }
    } catch(e) {
      return Response.json({ success: false, message: 'ورودی نامعتبر است' }, { status: 400 });
    }
  }

  // 2. دریافت لیست شاخص‌ها (GET)
  if (path === '/api/kpis' && request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        'SELECT * FROM kpi_records ORDER BY recorded_date DESC'
      ).all();
      return Response.json(results || []);
    } catch(e) {
      return Response.json([]);
    }
  }

  // 3. ثبت شاخص جدید (POST)
  if (path === '/api/kpis' && request.method === 'POST') {
    try {
      const data = await request.json();
      await env.DB.prepare(
        'INSERT INTO kpi_records (title, category, value, unit, recorded_date) VALUES (?, ?, ?, ?, ?)'
      ).bind(data.title, data.category, data.value, data.unit, data.recorded_date).run();
      
      return Response.json({ success: true, message: 'شاخص با موفقیت ثبت شد' });
    } catch(e) {
      return Response.json({ success: false, message: 'خطا در ثبت دیتابیس' }, { status: 500 });
    }
  }

  // 4. حذف شاخص (DELETE)
  if (path.startsWith('/api/kpis/') && request.method === 'DELETE') {
    try {
      const id = path.split('/')[3];
      await env.DB.prepare('DELETE FROM kpi_records WHERE id = ?').bind(id).run();
      return Response.json({ success: true, message: 'شاخص حذف شد' });
    } catch(e) {
      return Response.json({ success: false, message: 'خطا در حذف' }, { status: 500 });
    }
  }

  return env.ASSETS.fetch(request);
}
