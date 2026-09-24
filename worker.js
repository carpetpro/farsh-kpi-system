export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. مسیر ورود (Login)
    if (path === '/api/login' && request.method === 'POST') {
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
    }

    // 2. دریافت لیست شاخص‌ها (GET)
    if (path === '/api/kpis' && request.method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM kpi_records ORDER BY recorded_date DESC'
      ).all();
      return Response.json(results);
    }

    // 3. ثبت شاخص جدید (POST)
    if (path === '/api/kpis' && request.method === 'POST') {
      const data = await request.json();
      await env.DB.prepare(
        'INSERT INTO kpi_records (title, category, value, unit, recorded_date) VALUES (?, ?, ?, ?, ?)'
      ).bind(data.title, data.category, data.value, data.unit, data.recorded_date).run();
      
      return Response.json({ success: true, message: 'شاخص با موفقیت ثبت شد' });
    }

    // 4. حذف شاخص (DELETE)
    if (path.startsWith('/api/kpis/') && request.method === 'DELETE') {
      const id = path.split('/')[3];
      await env.DB.prepare('DELETE FROM kpi_records WHERE id = ?').bind(id).run();
      return Response.json({ success: true, message: 'شاخص حذف شد' });
    }

    // سرو کردن فایل‌های استاتیک
    return env.ASSETS.fetch(request);
  }
};
