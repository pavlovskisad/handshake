# HANDSHAKE

Type text, hear it leave as a dial-up modem transmission. Live spectrogram, subtitled handshake play-by-play, share the audio to friends, and drop a line on the shared BBS board. The modem is a static HTML file with no build and no dependencies; the chat board adds one zero-dependency serverless function.

Norton Commander TUI skin. The frontend is `index.html` — open it in a browser and the modem runs. The chat board lights up once deployed (it talks to `/api/messages`).

## What it does

- **Connect** — first press of `1` runs the classic handshake (DTMF dial, ring, ANSam answer tone, V.8 chirps, double bong, line probe sweep, equalizer training noise), subtitled stage by stage, ending on `CONNECT 57600`. Carrier detect lights, session clock starts.
- **Transmit** — once online, `1` sends the message text as audio. Each character is encoded through a rotating palette of real modem modulations (Bell 103 FSK, V.21 high channel, V.23 buzz, V.22-style PSK), with DTMF beeps for digits, a bong on sentence ends, a static tick on commas, carrier blips on spaces. Deterministic: the same text always sounds the same.
- **Save / Share** — exports the message as a 44.1 kHz mono WAV; uses the native share sheet on mobile, download elsewhere.
- **Help** — transmits its own key reference through the modem (eats its own dog food).
- **Line** (menu) — redials the handshake on demand.
- **Feed** — a shared, anonymous, never-deleted board of modem transmissions. `Transmit` broadcasts your message to the feed; tap any line to replay it as real modem audio + spectrogram in the TERMINAL panel. Pick a handle for attribution. Backed by `api/messages.js` + a Redis-compatible KV store. Falls back to `BOARD OFFLINE` when opened locally or before the store is provisioned, so the modem still works standalone.

Everything runs through a `lineize()` post-process: 250–3400 Hz telephone bandpass, tanh saturation, hiss bed, 50 Hz hum, random crackle — the glue that makes synthesized tones sound like copper.

## Run

```
open index.html          # macOS
# or just drag it into a browser tab
```

No server needed for the modem. Audio requires a user gesture (the `1 Connect` press) — browsers block autoplay, which is also period-correct. The chat board needs the deployed `/api` function; locally it shows `BOARD OFFLINE`.

## Deploy

Vercel, zero build config. The modem (`index.html`) is static; `api/messages.js` is auto-detected as a serverless function.

```
vercel            # preview
vercel --prod     # production
```

**The chat board needs a Redis-compatible KV store.** One-time setup in the Vercel dashboard:

1. Project → **Storage** → create a **KV / Upstash Redis** database and connect it to the project.
2. That injects the env vars the function reads (`KV_REST_API_URL` + `KV_REST_API_TOKEN`, or the `UPSTASH_REDIS_REST_*` pair).
3. Redeploy. The board goes live; until then the modem works and the board shows `BOARD OFFLINE`.

`vercel.json` sets clean URLs and cache headers; the API function sends its own `Cache-Control: no-store`.

### Notes / follow-ups

- History is **append-only and never trimmed**; `GET /api/messages` returns the most recent 200. Add pagination if the room gets big.
- Anonymous + public means no moderation yet. The function caps message length, strips control chars, and rate-limits to 5 posts / 10s per IP. A delete/ban path is a sensible next step.
