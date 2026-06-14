# Claude Code: do this

The repo is ready. Run these in order, no need to ask.

1. Verify the app's JS parses:
   node -e "const s=require('fs').readFileSync('index.html','utf8');const m=s.match(/<script>([\s\S]*)<\/script>/);new Function(m[1]);console.log('JS OK');"

2. Commit if not already:
   git add -A && git commit -m "handshake: text-to-dialup modem messenger" || true

3. Deploy to Vercel (static, zero config — vercel.json is present):
   vercel --prod

4. Report the production URL.

Then read CLAUDE.md and stand by for v2 work. The v2 backlog is at the bottom of CLAUDE.md, ranked. #1 is decoder mode (paste a friend's WAV, demodulate back to text) — that's the one that makes it a two-player toy.

Everything is one self-contained index.html. No build step, no dependencies. Keep it that way unless told otherwise.
