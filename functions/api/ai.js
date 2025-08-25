export async function onRequestPost({ env, request }) {
  try {
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
    const maxTokens = Number(body.max_tokens) || 512;
    const model = body.model || 'claude-3-5-sonnet-20240620';

    if (!userText.trim()) {
      return new Response(JSON.stringify({ error: 'Empty prompt' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }

    const payload = {
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'user', content: userText }
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
