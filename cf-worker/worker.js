export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = [
      'https://mackwallace.github.io',
      'http://localhost',
      'http://127.0.0.1',
    ];
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ── POST / ────────────────────────────────────────────────────────────────
    // Frontend sends form payload here. We generate a sessionId, store a
    // 'pending' record in KV, inject the sessionId into the payload, and
    // fire the Cassidy webhook (non-blocking). Returns {sessionId} immediately
    // so the frontend can start polling.
    if (request.method === 'POST' && url.pathname === '/') {
      const sessionId = crypto.randomUUID();
      let payload;
      try {
        payload = await request.json();
      } catch {
        return new Response('Bad Request', { status: 400, headers: corsHeaders });
      }

      payload['session-id'] = sessionId;

      await env.RESULTS_KV.put(
        sessionId,
        JSON.stringify({ status: 'pending' }),
        { expirationTtl: 7200 }
      );

      // Fire Cassidy in the background — don't await
      ctx.waitUntil(
        fetch(env.CASSIDY_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {})
      );

      return new Response(JSON.stringify({ sessionId }), {
        status: 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── POST /receive ─────────────────────────────────────────────────────────
    // Cassidy Stage 4 calls this endpoint when the workflow completes.
    // Requires the RECEIVE_API_KEY secret in the Authorization header.
    if (request.method === 'POST' && url.pathname === '/receive') {
      const auth = request.headers.get('Authorization') || '';
      if (auth !== `Bearer ${env.RECEIVE_API_KEY}`) {
        return new Response('Unauthorized', { status: 401 });
      }

      let data;
      try {
        data = await request.json();
      } catch {
        return new Response('Bad Request', { status: 400 });
      }

      const sessionId = data['session-id'] || data['session_id'] || data.sessionId;
      if (!sessionId) {
        return new Response('Missing session-id', { status: 400 });
      }

      await env.RESULTS_KV.put(
        sessionId,
        JSON.stringify({ status: 'ready', data }),
        { expirationTtl: 7200 }
      );

      return new Response('OK', { status: 200 });
    }

    // ── GET /results/:sessionId ───────────────────────────────────────────────
    // Frontend polls this until status === 'ready'.
    if (request.method === 'GET' && url.pathname.startsWith('/results/')) {
      const sessionId = url.pathname.replace('/results/', '').split('?')[0];
      if (!sessionId) {
        return new Response('Bad Request', { status: 400, headers: corsHeaders });
      }

      const stored = await env.RESULTS_KV.get(sessionId);
      if (!stored) {
        return new Response(JSON.stringify({ status: 'not_found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(stored, {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
