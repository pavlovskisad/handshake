# HANDSHAKE

Type text, hear it leave as a dial-up modem transmission. Live spectrogram, subtitled handshake play-by-play, share the audio to friends, and drop a line on the shared BBS board. The modem is a static HTML file with no build and no dependencies; the chat board adds one zero-dependency serverless function.

Norton Commander TUI skin. The frontend is `index.html` — open it in a browser and the modem runs. The chat board lights up once deployed (it talks to `/api/messages`).

## What it does

- **Connect** — first press of `1` runs the classic handshake (DTMF dial, ring, ANSam answer tone, V.8 chirps, double bong, line probe sweep, equalizer training noise), subtitled stage by stage, ending on `CONNECT 57600`. Carrier detect lights, session clock starts.
- **Transmit** — once online, set a `KEY` and `1` encrypts your message and broadcasts it. The plaintext you hold is also played locally as audio: each character is encoded through a rotating palette of real modem modulations (Bell 103 FSK, V.21 high channel, V.23 buzz, V.22-style PSK) with a per-character pitch, DTMF beeps for digits, a bong on sentence ends. Deterministic: the same text always sounds the same. The textarea auto-clears after sending — the plaintext is ephemeral.
- **Save / Share** — exports your message as a 44.1 kHz mono WAV; uses the native share sheet on mobile, download elsewhere.
- **Help** — transmits its own key reference through the modem (eats its own dog food).
- **Line** (menu) — redials the handshake on demand.
- **Feed** — a shared, anonymous, never-deleted board of **encrypted** transmissions. Everything posted is AES-GCM encrypted in the browser with a key derived from your passphrase; the server only ever sees ciphertext. Locked items show as `► LOCKED ████`; enter the matching `KEY` and the ones it fits unlock — revealing the text and playing as real modem audio + spectrogram. `► PLAY ALL` / `► LAST 10` play the whole exchange. Backed by `api/messages.js` + a Redis-compatible KV store; falls back to `BOARD OFFLINE` when opened locally or before the store is provisioned.

**Crypto, honestly:** the encryption is real (WebCrypto AES-GCM 256, PBKDF2 key derivation, random IV per message) — without the passphrase a message can't be read. But this is a toy, not Signal: handles and timestamps are public, weak passphrases are guessable, and there's no forward secrecy or identity. Share keys out-of-band and don't trust it with anything that actually matters.

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
