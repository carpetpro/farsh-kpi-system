export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ۱. مدیریت پروژه‌های بهبود
      if (path === '/api/projects' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM biz_projects ORDER BY id DESC').all();
        return Response.json(results || [], { headers: corsHeaders });
      }

      if (path === '/api/projects' && request.method === 'POST') {
        const data = await request.json();
        await env.DB.prepare('INSERT INTO biz_projects (id, title, owner, progress, status) VALUES (?, ?, ?, ?, ?)')
          .bind(String(data.id), data.title, data.owner, data.progress, data.status).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path.startsWith('/api/projects/') && request.method === 'DELETE') {
        const id = path.split('/')[3];
        await env.DB.prepare('DELETE FROM biz_projects WHERE id = ?').bind(id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // ۲. مدیریت شاخص‌های کلیدی (KPIs)
      if (path === '/api/kpis' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM biz_kpis ORDER BY id DESC').all();
        return Response.json(results || [], { headers: corsHeaders });
      }

      if (path === '/api/kpis' && request.method === 'POST') {
        const data = await request.json();
        await env.DB.prepare('INSERT INTO biz_kpis (id, title, category, value, unit) VALUES (?, ?, ?, ?, ?)')
          .bind(String(data.id), data.title, data.category, data.value, data.unit).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path.startsWith('/api/kpis/') && request.method === 'DELETE') {
        const id = path.split('/')[3];
        await env.DB.prepare('DELETE FROM biz_kpis WHERE id = ?').bind(id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // ۳. مدیریت عارضه‌ها و فرصت‌ها
      if (path === '/api/issues' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM biz_issues ORDER BY id DESC').all();
        return Response.json(results || [], { headers: corsHeaders });
      }

      if (path === '/api/issues' && request.method === 'POST') {
        const data = await request.json();
        await env.DB.prepare('INSERT INTO biz_issues (id, title, priority) VALUES (?, ?, ?)')
          .bind(String(data.id), data.title, data.priority).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path.startsWith('/api/issues/') && request.method === 'DELETE') {
        const id = path.split('/')[3];
        await env.DB.prepare('DELETE FROM biz_issues WHERE id = ?').bind(id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // سرو کردن فایل‌های استاتیک (index.html)
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }

      return new Response('ارتباط با فایل‌ها برقرار نشد', { status: 404 });

    } catch (error) {
      return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
  }
};
