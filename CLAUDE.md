# CLAUDE.md

Handoff for continuing work on HANDSHAKE. Read this first.

## What this is

A web toy: text → dial-up modem audio. `index.html` is the whole frontend — HTML, CSS, JS inline. No framework, no build step, no frontend dependencies. The modem half makes zero network calls and runs from a bare `file://` — keep it that way; the self-contained single file is the point (easy to share, archive, drop on any host).

The one deliberate exception is the **feed**: a shared, anonymous, persistent board of modem transmissions can't live in a static file, so it gets one zero-dependency serverless function (`api/messages.js`) talking to a Redis-compatible KV store. The frontend stays a single file and degrades to `BOARD OFFLINE` when the API isn't there, so the modem still works standalone. Don't add more network surface without a similarly strong reason.

## Working style (Pav)

- Terse. Decisions over options. Specifics over abstractions.
- Don't ask permission to edit the file — just do it and report what changed.
- No slop prose in code comments or UI copy. Plain and direct.
- Verify JS parses after edits (`node -e` Function-constructor check, see below) before claiming done.
- When the look needs to match a reference, match it precisely — colors, layout, chrome — not "in the spirit of."

## Architecture (all inside index.html)

**Synthesis (pure functions, return Float32Array @ 44100 Hz):**
- `tone(dur, freqs[], amp)` — additive sines, used for DTMF and pure tones
- `fsk(bits[], baud, fMark, fSpace, amp)` — frequency-shift keying (Bell 103 / V.21 / V.23)
- `psk(bits[], baud, f, amp)` — phase-reversal keying (the V.22 "wah")
- `ansam(dur)` — 2100 Hz answer tone with 15 Hz AM and phase reversals
- `sweep`, `noise`, `bong` — line probe, training garbage, the decaying sentence-end "bong"
- `env(arr, n)` — 3 ms edge fades, applied to nearly everything to kill clicks
- `byteBits(b)` — UTF-8 byte → 8N1 frame (start 0, 8 data LSB-first, stop 1)
- `richChar(ch, wordN, spd)` — the voice palette. Maps a char to a modulation by `codePointAt % 4`, with special cases for space / `.!?` / `,;:` / DTMF digits. **This is the function to touch for new "voices."**
- `lineize(x)` — in-place phone-line coloration on the final mixed buffer. Bandpass + saturation + hiss + 50 Hz hum + crackle. Single biggest contributor to "sounds like a real modem."

**Orchestration:**
- `synth(mode, text, spd, label)` — builds the full timeline. `mode='boot'` → handshake sequence; `mode='msg'` → per-char payload. Pushes subtitle `events` ({t, who, txt}) and `charTimes[]` as it goes. Returns `{f32, events, charTimes, dur, text, label}`. An empty `txt` on an event means "type the payload text out live."
- `play(o, kind)` — wires an AnalyserNode for the spectrogram, starts the buffer, kicks the rAF loop.
- `frame()` — per-frame: scrolls the spectrogram one column (drawImage shift + new column from `getByteFrequencyData`), updates the subtitle (typing effect when event txt is empty), drives the OH/CD/RD/SD flags. On boot completion sets `connected=true` and flips the button to Transmit.
- `toWav(f32)` — 16-bit PCM WAV blob for save/share.

**State:** `connected` gates boot-vs-message. `boot`/`msg`/`help` cache synthesized results (re-synth only when text or speed changes). `playText` holds the string the typing subtitle reveals.

**UI:** Norton Commander skin. Top menu (Line/Message/Transmit/Feed/Help — all tappable, work on mobile) is a gray Turbo-Vision menu bar (black text, red hotkeys, cyan selection), three double-framed panels (TERMINAL / MESSAGE / FEED), bottom = `C:\HANDSHAKE>` prompt + status flags + ONLINE clock + numbered F-key row. On phones a `≤480px` media query hides the top wall-clock and the prompt and tightens the status bar so the growing session clock can't overflow. Number keys 1–4 are bound on desktop (ignored while typing in the textarea, handle, or KEY field).

**Feed (`index.html` JS + `api/messages.js`):** the shared board is a feed of **encrypted** modem transmissions. The server only ever stores ciphertext.
- Crypto: AES-GCM 256 via WebCrypto. `aesKey(pass)` derives the key with PBKDF2 (120k iters, SHA-256) from a *deterministic* salt (`SHA-256('handshake.v1:'+pass)`) so two people sharing a passphrase derive the same key (symmetric); derived keys cached per passphrase in `keyCache`. `encMsg` prepends a random 12-byte IV (the "randomiser") to the ciphertext and base64s it; `decMsg` returns `null` on auth failure (wrong key). Plaintext never leaves the device. **It's real crypto but a toy** — metadata is public, weak passphrases are guessable, no forward secrecy. Don't oversell it in UI.
- Frontend: a `C:\FEED` panel — scrollback `#feed` of `.fi` buttons, a `KEY` field (`#key`, passphrase persisted in `localStorage` as `hs_key`), a handle field (`hs_handle`), and `► PLAY ALL`/`► LAST 10`/`■ STOP`. Each message object carries `{id,t,who,enc,spd}` + a derived `m.plain` (decrypted text or `null`) and `m.el`. `applyKey()` (re)tries decryption and `paintItem()` shows it as `► PLAY <text>` (unlocked) or `► LOCKED ████` (locked); changing the KEY runs `relockAll()`. Composing is in the MESSAGE panel; **`Transmit` (key 1) requires a KEY, plays the plaintext locally, `postFeed()`s the ciphertext, and auto-clears the textarea**. `playFeed()` synths `m.plain` when unlocked or a short ciphertext burst when locked (cached per `id#p`/`id#l` in `feedCache`). PLAY ALL/LAST 10 walk a `queue`, advanced from `frame()`'s completion branch; `stopPlayback()` halts via the stored `curSrc`. Polls `GET /api/messages?since=<lastId>` every 4 s. All rendered text goes through `escp()`. Fetch errors show `BOARD OFFLINE`.
- Backend: `api/messages.js`, a Vercel Node serverless function, **no npm deps** — speaks to Vercel KV / Upstash over the Redis REST API via global `fetch`. Creds resolved by env-var *suffix* (`*REST_API_URL`/`*REST_API_TOKEN` or `*REDIS_REST_URL`/`*REDIS_REST_TOKEN`) so any integration prefix works. `GET` returns the last 200 messages; `POST {who,enc,spd}` validates (strip control chars, cap enc 2000 / who 16, spd∈{0.5,1}), rate-limits 5 posts / 10 s per IP, monotonic `id` via `INCR chat:seq`, `RPUSH` onto `chat:general`. Append-only — **never trimmed**. (Legacy plaintext `txt` items from before encryption still render as readable.)

## Conventions / gotchas

- **Sample rate is 44100 everywhere.** AudioContext is constructed with `{sampleRate: SR}`. Don't mix rates.
- **Audio needs a user gesture.** First sound must come from a click/tap (currently `1 Connect`). Don't try to autoplay on load.
- **Textarea + chat inputs are 16px on purpose** — anything smaller makes iOS Safari zoom on focus. Rest of the TUI is 14px. Keep inputs at 16.
- **CP437 typography only in UI copy.** DOS can't render `—`, `…`, or curly quotes — use `-`, `...`, straight `'`. `→`, `½`, `≈`, `│` *are* CP437, fine to use. (Straight `'` inside a single-quoted JS string must be escaped: `let\'s`.)
- **The chat board needs the deployed `/api` + a KV store.** It will read `BOARD OFFLINE` from `file://` or before the KV integration is connected — that's expected, not a bug. Provision KV in the Vercel dashboard (Storage → KV/Upstash) so the env vars get injected.
- **`env()` everything** that starts/stops abruptly or you get clicks. `bong` intentionally skips the tail fade (it decays naturally).
- **Rich mode is the only payload mode now.** The old handshake/pure-Bell-103 toggles and the explainer note were removed by request. If you re-add a "pure decodable" path, it's `fsk(bits, 300*spd, 1270, 1070)` over the whole message — that's what `minimodem --rx 300 -f file.wav` decodes.
- **Speeds are ½x and 1x only** (`SPDS = [0.5, 1]`). Slower = each char is a distinct gesture, which Pav preferred over faster chatter.
- **Determinism matters.** `richChar` mapping is fixed so a given word always "sings" the same — nice for shareable signatures. The handshake uses a seeded PRNG (`rbit`) so even the "random" chirps are reproducible. Keep new voices deterministic.

## Verify after editing

```
node -e "const s=require('fs').readFileSync('index.html','utf8');const m=s.match(/<script>([\s\S]*)<\/script>/);new Function(m[1]);console.log('JS OK');"
```

Then open in a browser and actually listen — the audio is the product, lint can't catch a bad-sounding tone.

## Deploy

Vercel, zero build config — `index.html` static, `api/messages.js` auto-detected as a function. `vercel --prod`. **One-time:** add a KV/Upstash database in the project's Storage tab and redeploy, or the chat board stays `BOARD OFFLINE`. `vercel.json` sets clean URLs + cache headers; the function overrides with `Cache-Control: no-store`.

## v2 backlog (not started, rough priority)

0. **Chat moderation/scale.** The board is live but raw: no moderation, append-only/never-trimmed storage, `GET` caps at 200. Add a delete/ban path and read pagination before it gets popular or abused.
1. **Decoder mode.** Demodulate modem audio back to bytes — ideally another phone *listening via mic*. Combined with the encrypted feed this is the endgame: encode → transmit → listen → decode → decrypt (airgapped secret transfer over sound). Hardest part is FSK/PSK demod that tolerates the lineize coloration + speaker→mic noise — needs a cleaner, error-corrected "decodable" TX mode separate from the pretty rich TX. The current locked-item audio is just a ciphertext *burst* for vibe, not a real decodable channel.
2. **WebM/video export.** Capture the spectrogram canvas + audio to a shareable clip (MediaRecorder + canvas.captureStream + a WebAudio MediaStreamDestination), so the *animation* shares, not just the WAV.
3. **CP437 bitmap font** (Perfect DOS VGA 437 or similar) instead of system mono, for true DOS authenticity. Needs a bundled webfont — breaks the zero-asset single-file purity, so decide if that tradeoff is worth it.
4. **Shareable message links.** Encode message+speed in the URL hash so a link auto-loads (and maybe auto-plays after a tap). Pairs well with deploy.
5. **QAM "data" voice** as an optional fifth modulation — authentic 56k hiss, but melodically dead, so opt-in only.

## History

Built iteratively in a chat session: started as amber-oscilloscope text-to-Bell-103, went through "sounds like uniform noise" fixes (handshake pacing, inter-char rhythm), added the polyphonic voice palette, the lineize line coloration, speed control, then skinned amber → green CRT → flat tty → DOS comm program → Norton Commander. Then: connect-on-first-press flow (handshake as warm-up, not splash), removed toggles, 16px input, Help-as-transmission. Latest: tightened the Norton skin (gray Turbo-Vision menu bar that was previously invisible black-on-blue, no textarea resize handle, tighter line-height, CP437 typography), and added the shared anonymous chat board (`api/messages.js` + KV) — the first networked feature.
