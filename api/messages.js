// Secret-transmission backend for HANDSHAKE.
// Messages are addressed by CHANNEL = a public hash of the secret key (computed
// client-side; the server never sees the key) and stored as AES-GCM ciphertext.
// You can only read a channel if you hold the key that hashes to it.
//
// Zero dependencies: talks to a Redis-compatible REST store (Vercel KV or
// Upstash) over fetch. The integration may prefix the injected env vars, so
// resolve them by suffix:
//   *REST_API_URL  / *REST_API_TOKEN    (Vercel KV family)
//   *REDIS_REST_URL / *REDIS_REST_TOKEN (Upstash native)
//
// GET  /api/messages?channel=<c>&since=<id> -> { messages: [{id,t,enc}, ...] }
// POST /api/messages {channel, enc}         -> { ok:true, id }
// Append-only; never trimmed.

function findEnv(...patterns){
  const keys = Object.keys(process.env);
  for(const re of patterns){
    const k = keys.find(k => re.test(k) && process.env[k]);
    if(k) return process.env[k];
  }
  return undefined;
}
const URL_ = findEnv(/REST_API_URL$/, /REDIS_REST_URL$/);
const TOKEN = findEnv(/REST_API_TOKEN$/, /REDIS_REST_TOKEN$/);
const SEQ = 'chat:seq';
const READ = 200, MAX_ENC = 2000;
const CHAN = /^[A-Za-z0-9_-]{8,64}$/;   // base64url channel id

async function redis(cmd){
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  if(!r.ok) throw new Error('store ' + r.status);
  return (await r.json()).result;
}
// strip control chars, trim, cap length
const clean = (s, n) => { let r = ""; for(const ch of String(s == null ? "" : s)){ const o = ch.codePointAt(0); if(o >= 32 && o !== 127) r += ch; } return r.trim().slice(0, n); };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if(!URL_ || !TOKEN){ res.status(503).json({ error: 'no store configured' }); return; }
  try{
    if(req.method === 'GET'){
      const q = (req.query && req.query.channel != null)
        ? req.query
        : Object.fromEntries(new URL(req.url, 'http://x').searchParams);
      const channel = String(q.channel || '');
      const since = parseInt(q.since || '0', 10) || 0;
      if(!CHAN.test(channel)){ res.status(200).json({ messages: [] }); return; }
      const raw = (await redis(['LRANGE', 'ch:' + channel, '-' + READ, '-1'])) || [];
      const messages = raw.map(s => { try{ return JSON.parse(s); }catch(e){ return null; } })
                          .filter(m => m && m.id > since);
      res.status(200).json({ messages });
      return;
    }
    if(req.method === 'POST'){
      let body = req.body;
      if(typeof body === 'string'){ try{ body = JSON.parse(body); }catch(e){ body = {}; } }
      body = body || {};
      const channel = String(body.channel || '');
      const encd = clean(body.enc, MAX_ENC);
      if(!CHAN.test(channel)){ res.status(400).json({ error: 'bad channel' }); return; }
      if(!encd){ res.status(400).json({ error: 'empty' }); return; }
      // light rate limit: 5 posts / 10s per ip
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'anon';
      const n = await redis(['INCR', 'rl:' + ip]);
      if(n === 1) await redis(['EXPIRE', 'rl:' + ip, '10']);
      if(n > 5){ res.status(429).json({ error: 'slow down' }); return; }
      const id = await redis(['INCR', SEQ]);
      await redis(['RPUSH', 'ch:' + channel, JSON.stringify({ id, t: Date.now(), enc: encd })]);
      res.status(200).json({ ok: true, id });
      return;
    }
    res.status(405).json({ error: 'method' });
  }catch(e){
    res.status(500).json({ error: 'store unavailable' });
  }
};
