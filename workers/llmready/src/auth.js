export function validateToken(request, env) {
  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7) === env.ADMIN_TOKEN;
  }
  // Allow ?token= query for downloads (where Authorization header is inconvenient)
  const url = new URL(request.url);
  const tok = url.searchParams.get('token');
  return tok && tok === env.ADMIN_TOKEN;
}

export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || 'https://adaptedsolutionsco.com',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export function jsonResponse(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}
