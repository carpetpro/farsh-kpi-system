export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ۱. ورود به سیستم (Login) با تفکیک نقش و کسب‌وکار
    if (path === '/api/login' && request.method === 'POST') {
      try {
        const { username, password } = await request.json();
        
        // ادمین اصلی کل سیستم
        if (username === 'admin' && password === '123456') {
          return Response.json({ 
            success: true, 
            token: 'token-admin-secret',
            user: { username: 'admin', role: 'admin', business_id: 'ALL', name: 'مدیر کل سیستم' } 
          });
        } 
        // مدیر اختصاصی الون شوز
        else if (username === 'alone_shoes' && password === '123456') {
          return Response.json({ 
            success: true, 
            token: 'token-alone-secret',
            user: { username: 'alone_shoes', role: 'manager', business_id: 'BUS-001', name: 'مدیر الون شوز' } 
          });
        } else {
          return Response.json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' }, { status: 401 });
        }
      } catch(e) {
        return Response.json({ success: false, message: 'درخواست نامعتبر' }, { status: 400 });
      }
    }

    // ۲. دریافت لیست پروژه‌ها (با پشتیبانی از تفکیک کسب‌وکار)
    if (path === '/api/projects' && request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare('SELECT * FROM biz_projects').all();
        return Response.json(results || []);
      } catch(e) {
        return Response.json([]);
      }
    }

    // ۳. دریافت لیست شاخص‌ها (KPIs)
    if (path === '/api/kpis' && request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare('SELECT * FROM biz_kpis').all();
        return Response.json(results || []);
      } catch(e) {
        return Response.json([]);
      }
    }

    // ۴. دریافت لیست عارضه‌ها (Issues)
    if (path === '/api/issues' && request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare('SELECT * FROM biz_issues').all();
        return Response.json(results || []);
      } catch(e) {
        return Response.json([]);
      }
    }

    // سرو کردن فایل‌های استاتیک
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not Found', { status: 404 });
  }
};
