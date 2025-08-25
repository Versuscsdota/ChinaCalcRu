export async function onRequestGet({ env, request }) {
  const authed = isAuthed(request, env);
  return json({ authenticated: authed });
}

export async function onRequestPost({ env, request }) {
  if (!env.ACCESS_KEY) {
    // If no key configured, treat as open access
    return json({ authenticated: true });
  }
  if ((request.headers.get('content-type') || '').includes('application/json') === false) {
    return json({ error: 'Expected application/json' }, 415);
  }
  const body = await request.json().catch(() => ({}));
  const key = String(body.key || '');
  if (!key || key !== env.ACCESS_KEY) {
    return json({ authenticated: false, error: 'Invalid key' }, 401);
  }
  // Set session cookie
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  const cookie = buildCookie('SESSION', '1', { path: '/', httpOnly: false, sameSite: 'Lax', maxAge: 60 * 60 * 24 * 30 });
  headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify({ authenticated: true }), { headers });
}

function isAuthed(request, env){
  if (!env.ACCESS_KEY) return true;
  const cookie = request.headers.get('Cookie') || '';
  return /(?:^|; )SESSION=1(?:;|$)/.test(cookie);
}

function json(obj, status = 200){
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function buildCookie(name, value, opts){
  const parts = [`${name}=${value}`];
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join('; ');
}
