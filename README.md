# HANDSHAKE

Send a short secret as a dial-up modem transmission. You type a message, it's encrypted in your browser and goes out over a synthesized modem; a strong **key** is generated for you to share. Anyone you give the key to can tune in, listen, and read it off the subtitles. No key, no message.

Norton Commander TUI skin, live spectrogram. The frontend is one `index.html`; one zero-dependency serverless function (`api/messages.js`) relays the encrypted transmissions.

## What it does

- **Connect** — first press of `1` runs the classic handshake (DTMF dial, ring, ANSam answer tone, V.8 chirps, double bong, line probe sweep, equalizer training noise), subtitled stage by stage, ending on `CONNECT 57600`.
- **Transmit** — type a secret and `1`. It's AES-GCM encrypted in the browser and sent; you hear your own plaintext play out as modem audio. If no key is set, a strong one is **generated** — `COPY` it and send it to a friend out of band. The textarea auto-clears; the plaintext is ephemeral.
- **Listen** — paste a key into `KEY` and `► PLAY ALL`. You tune into that key's thread and hear each transmission as real modem audio, reading it off the subtitles. Items are play-only — nothing is printed in full.
- **Help / Line** (menu) — Help transmits its own reference; Line redials the handshake.

Each character is encoded through a rotating palette of real modem modulations (Bell 103 FSK, V.21, V.23, V.22-style PSK) with a per-character pitch, then run through a `lineize()` post-process (250–3400 Hz bandpass, saturation, hiss, hum, crackle) so it sounds like copper. Deterministic: the same text always sounds the same.

**Crypto, honestly:** real WebCrypto AES-GCM 256, PBKDF2 key derivation, random IV per message. Without the key a transmission can't be read, and the server only ever stores ciphertext addressed by a hash of the key (it never sees the key). But it's a *toy*, not Signal: timestamps are public, weak keys are guessable, no forward secrecy. Share keys out of band; don't trust it with anything that matters.

## Run

```
open index.html          # macOS, or just drag it into a browser tab
```

The modem half runs offline. Audio needs a user gesture (the `1 Connect` press) — browsers block autoplay, which is also period-correct. Sending/listening needs the deployed `/api`; locally the thread shows `BOARD OFFLINE`.

## Deploy

Vercel, zero build config. `index.html` is static; `api/messages.js` is auto-detected as a serverless function.

```
vercel            # preview
vercel --prod     # production
```

**The relay needs a Redis-compatible KV store.** One-time setup in the Vercel dashboard:

1. Project → **Storage** → create a **KV / Upstash Redis** database and connect it to the project.
2. That injects the env vars the function reads (resolved by suffix, so any integration prefix works).
3. Redeploy. Until then the modem still runs and threads read `BOARD OFFLINE`.

`vercel.json` sets clean URLs and cache headers; the API function sends its own `Cache-Control: no-store`.

### How the secret channel works

- Each message is encrypted client-side with `AES-GCM(key)` and posted to a **channel** = `SHA-256(key)` (truncated, base64url). The server stores `{id, t, enc}` per channel and never sees the key or plaintext.
- To read, you compute the same channel hash from the key, pull that channel, and decrypt. Append-only, never trimmed; `GET` returns the most recent 200.
- No public browsing: with no key you see nothing. Moderation/abuse handling and read pagination are still open (the function caps length, strips control chars, and rate-limits 5 posts / 10s per IP).
