// Shared chatroom backend for HANDSHAKE - one append-only general room.
// Zero dependencies: talks to a Redis-compatible REST store (Vercel KV or
// Upstash) over fetch. Provision a KV/Upstash integration on Vercel and the
// REST creds are injected automatically. The integration may prefix the var
// names (e.g. STORAGE_KV_REST_API_URL), so resolve them by suffix rather than
// hard-coding KV_*/UPSTASH_* exactly:
//   *REST_API_URL  / *REST_API_TOKEN   (Vercel KV family, with/without prefix)
//   *REDIS_REST_URL / *REDIS_REST_TOKEN (Upstash native)
//
// GET  /api/messages              -> { messages: [{id,t,who,enc,spd}, ...] }  (last READ)
// POST /api/messages {who,enc,spd} -> { ok:true, id }   (enc = base64 ciphertext)
// History is never trimmed (per spec); GET returns the most recent READ msgs.

function findEnv(...patterns){
  const keys = Object.keys(process.env);
  for(const re of patterns){
    const k = keys.find(k => re.test(k) && process.env[k]);
    if(k) return process.env[k];
  }
  return undefined;
}
// note: the read-only token ends in READ_ONLY_TOKEN, so /REST_API_TOKEN$/ skips it
const URL_ = findEnv(/REST_API_URL$/, /REDIS_REST_URL$/);
const TOKEN = findEnv(/REST_API_TOKEN$/, /REDIS_REST_TOKEN$/);
const ROOM = 'chat:general', SEQ = 'chat:seq';
// enc = base64 of (iv | AES-GCM ciphertext); the server only ever sees ciphertext
const READ = 200, MAX_ENC = 2000, MAX_WHO = 16;

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
      const raw = (await redis(['LRANGE', ROOM, '-' + READ, '-1'])) || [];
      const messages = raw.map(s => { try{ return JSON.parse(s); }catch(e){ return null; } }).filter(Boolean);
      res.status(200).json({ messages });
      return;
    }
    if(req.method === 'POST'){
      let body = req.body;
      if(typeof body === 'string'){ try{ body = JSON.parse(body); }catch(e){ body = {}; } }
      body = body || {};
      const encd = clean(body.enc, MAX_ENC);
      const who = clean(body.who, MAX_WHO) || 'GUEST';
      const spd = body.spd === 0.5 ? 0.5 : 1;   // transmission speed for replay
      if(!encd){ res.status(400).json({ error: 'empty' }); return; }
      // light rate limit: 5 posts / 10s per ip
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'anon';
      const n = await redis(['INCR', 'rl:' + ip]);
      if(n === 1) await redis(['EXPIRE', 'rl:' + ip, '10']);
      if(n > 5){ res.status(429).json({ error: 'slow down' }); return; }
      const id = await redis(['INCR', SEQ]);
      await redis(['RPUSH', ROOM, JSON.stringify({ id, t: Date.now(), who, enc: encd, spd })]);
      res.status(200).json({ ok: true, id });
      return;
    }
    res.status(405).json({ error: 'method' });
  }catch(e){
    res.status(500).json({ error: 'store unavailable' });
  }
};
