export async function onRequestPost({ env, request }) {
  try {
    // Require authentication if ACCESS_KEY is set
    if (env.ACCESS_KEY) {
      const cookie = request.headers.get('Cookie') || '';
      const ok = /(?:^|; )SESSION=1(?:;|$)/.test(cookie);
      if (!ok) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json; charset=utf-8' } });
    }
    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'Server not configured: missing ANTHROPIC_API_KEY' }), {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }

    if ((request.headers.get('content-type') || '').includes('application/json') === false) {
      return new Response(JSON.stringify({ error: 'Expected application/json' }), {
        status: 415,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }

    const body = await request.json();
    const userText = (body && typeof body.text === 'string') ? body.text : '';
    const system = typeof body.system === 'string' ? body.system : undefined;
    const image = body && body.image && typeof body.image === 'object' ? body.image : undefined;
    const maxTokens = Number(body.max_tokens) || 512;
    const model = body.model || 'claude-3-5-sonnet-20240620';

    if (!userText.trim()) {
      return new Response(JSON.stringify({ error: 'Empty prompt' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }

    // Input validation
    if (userText.length > 4000) {
      return new Response(JSON.stringify({ error: 'Prompt too long (max 4000 chars)' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }
    const allowedModels = new Set([
      'claude-3-5-sonnet-20240620',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ]);
    if (!allowedModels.has(model)) {
      return new Response(JSON.stringify({ error: 'Model not allowed' }), { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } });
    }
    if (!Number.isFinite(maxTokens) || maxTokens < 1 || maxTokens > 1024) {
      return new Response(JSON.stringify({ error: 'max_tokens must be between 1 and 1024' }), { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } });
    }

    // Basic rate limit per IP (KV-based best-effort)
    try {
      const ip = request.headers.get('CF-Connecting-IP') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
      const now = new Date();
      const bucket = now.toISOString().slice(0,16); // YYYY-MM-DDTHH:MM
      const rlKey = `rl:${ip}:${bucket}`;
      const limit = 10; // requests per minute
      let count = 0;
      try {
        const v = await env.KV.get(rlKey);
        count = v ? Number(v) : 0;
      } catch {}
      if (count >= limit) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }), { status: 429, headers: { 'content-type': 'application/json; charset=utf-8' } });
      }
      // increment (best-effort)
      try {
        await env.KV.put(rlKey, String(count + 1), { expirationTtl: 120 });
      } catch {}
    } catch {}

    // Build content blocks
    const content = [];
    content.push({ type: 'text', text: userText });
    if (image && typeof image.media_type === 'string' && typeof image.data === 'string') {
      const okType = image.media_type.startsWith('image/');
      const approxBytes = Math.floor(image.data.length * 3 / 4);
      if (!okType) {
        return new Response(JSON.stringify({ error: 'Only image/* attachments allowed' }), { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } });
      }
      if (approxBytes > 5 * 1024 * 1024) { // ~5MB limit
        return new Response(JSON.stringify({ error: 'Image too large (max 5MB)' }), { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } });
      }
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: image.media_type, data: image.data }
      });
    }

    const payload = {
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'user', content }
      ]
    };
    if (system) {
      payload.system = system;
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: 'Upstream error', status: res.status, body: text }), {
        status: 502,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }

    const data = await res.json();
    // data.content is array; join text parts
    const parts = Array.isArray(data.content) ? data.content : [];
    const answer = parts.map(p => (typeof p.text === 'string' ? p.text : '')).join('\n').trim();

    return new Response(JSON.stringify({
      model: data.model,
      answer,
      raw: data
    }), {
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Unexpected error', message: String(e?.message || e) }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }
}
