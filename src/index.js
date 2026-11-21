// Rekordo Studio : fichiers statiques + clé de validation Pi lue dans D1 (jamais dans le dépôt).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/validation-key.txt') {
      const row = await env.DB.prepare("SELECT v FROM settings WHERE k = 'pi_validation_key'").first();
      if (!row) return new Response('Not found', { status: 404 });
      return new Response(row.v, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    return env.ASSETS.fetch(request);
  },
};
