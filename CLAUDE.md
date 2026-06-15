# CLAUDE.md

Handoff for continuing work on HANDSHAKE. Read this first.

## What this is

A web tool: send a **short secret as a dial-up modem transmission**. You type a message, it's encrypted in the browser and relayed; a strong **key** is generated to share out of band. Whoever has the key tunes into that key's thread, hears the transmission and reads it off the subtitles. No key, no message. The frontend is `index.html` (HTML/CSS/JS inline) + one bundled CP437 webfont (`Web437_IBM_VGA_8x16.woff`, ~10 KB, VileR's Web437 IBM VGA, CC BY-SA 4.0 — the one deliberate asset, for the authentic DOS look). No framework, no build step, no npm deps. The modem half runs from a bare `file://` (sending/listening needs the API).

The networked half is one zero-dependency serverless function (`api/messages.js`) talking to a Redis-compatible KV store. It only ever sees ciphertext, addressed by a hash of the key. The frontend stays a single file and degrades to `BOARD OFFLINE` when the API isn't there, so the modem still works standalone. Don't add more network surface without a strong reason.

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
- `frame()` — per-frame: scrolls the spectrogram one column (drawImage shift + new column from `getByteFrequencyData`), updates the subtitle (typing effect when event txt is empty), drives the OH/CD/RD/SD flags. On boot completion sets `connected=true` and flips the button to Transmit. On completion also calls `playFromQueue()` to advance a PLAY ALL run.

**State:** `connected` gates boot-vs-transmit. `boot`/`help` cache their synthesized results; per-message playback caches in `feedCache` by id. `playText` holds the string the typing subtitle reveals. **Speed is fixed 1x** (the old ½x/SPDS control was removed).

**UI:** Norton Commander skin. Top menu (Line/Transmit/Listen/Help), two double-framed panels (TERMINAL / SECRET), bottom = `C:\HANDSHAKE>` prompt + status flags + ONLINE clock + F-key row (1 Connect/Transmit, 2 Listen, 3 Copy key, 10 Quit → back to the menu via `doNew`). A `≤480px` media query hides the top wall-clock and the prompt. Number keys 1–3 are bound (ignored while typing in any `<input>`).

The `C:\SECRET` panel is a **3-level wizard** — `setLevel()` shows exactly one `.lvl` based on `connected` + `activeKey`:
1. `#lvlConnect` — a `► CONNECT` button (offline). On boot completion `frame()` flips to level 2.
2. `#lvlMenu` — `#msgIn` "type your msg" + `► TRANSMIT` (`doTransmitNew`); `► OPEN HANDSHAKE` (`#openClip` → hidden `#clipIn` file picker → `openKeyClip`); and a fallback `#keyIn` "...or paste a handshake code" + `LISTEN` (`doListen`).
3. `#lvlThread` — `► SAVE HANDSHAKE` (`makeKeyClip`), `COPY CODE` (`doCopy`, the recovery hatch), `NEW` (`doNew` → level 2), a `#replyIn` + `► TRANSMIT` (`doReply`, same key), `► PLAY ALL`/`■ STOP`, and the play-only `#feed` thread. **The raw key is never shown** — only shared as a handshake clip; `COPY CODE` is the text backup.

The bottom F-keys / number keys are level-aware: `actTransmit()` = connect → reply → transmit-new; `actListen()` = play-all (in a thread) → open a handshake clip. `fCopy` ("Copy code") is disabled outside a thread.

**Handshake clip (the key as sound):** the key is shared as a short **handshake** — a clip you save/send and open to unlock, not text.
- Encode: `keyToneBuf(key)` renders the key as **clean DTMF tones** (16-symbol frame: `KHDR` + 20 payload nibbles + CRC-8; `tone()` per symbol, no `lineize` — keep it decodable). `makeKeyClip(key)` records the spectrogram canvas + those tones to an **MP4** (`pickMime()` prefers `video/mp4`; H.264/AAC so messengers accept it, it saves to camera roll, and the AAC decodes back) via MediaRecorder, then `shareBlob()` (navigator.share → iOS Save Video / send).
- Decode: `openKeyClip(file)` → `decodeAudioData` (offline, reliable) → `decodeKey()` (Goertzel per DTMF freq, collapse runs into symbols, CRC-checked frame → key) → `loadThread(key)` then replays the clip as the "handshake accepted - you're in" ritual. DTMF chosen because it survives codec re-compression — **validated through a WhatsApp video round-trip**. CRC means a mangled clip fails cleanly (`NO CARRIER`) rather than tuning into garbage.

**Secret thread (`index.html` JS + `api/messages.js`):** the board is per-**key** threads of encrypted transmissions — no public browsing. With no key you see nothing.
- Crypto: AES-GCM 256 via WebCrypto. `aesKey(pass)` derives the key with PBKDF2 (120k iters, SHA-256) from a *deterministic* salt (`SHA-256('handshake.v1:'+pass)`) so two people sharing a key derive the same key (symmetric); cached in `keyCache`. `encMsg` prepends a random 12-byte IV (the "randomiser") to the ciphertext, base64; `decMsg` returns `null` on auth failure. `channelId(pass)` = `b64url(SHA-256('handshake.ch:'+pass)).slice(0,24)` — the public address the key posts/reads on; the server never sees the key. `genKey()` makes an ~80-bit base32 key (`XXXX-XXXX-...`); shared as a handshake clip. **Real crypto but a toy** — timestamps public, weak keys guessable, no forward secrecy. The handshake clip is *friction/ritual*, not extra crypto: anyone with the clip can decode it.

- Flow: `sendUnder(key,text)` plays your plaintext locally + POSTs `{channel, enc}`. `loadThread(key)` sets `activeKey`/`activeChannel`, shows level 3, `pollThread()`s. `addItem()` decrypts each with `activeKey` and skips anything that doesn't decrypt (play-only `.fi` items — text lives in the subtitles). PLAY ALL walks a `queue` advanced from `frame()`. Polls the active channel every 4 s.
- Backend: `api/messages.js`, a Vercel Node serverless function, **no npm deps** — Redis REST via global `fetch`, creds resolved by env-var *suffix*. `GET ?channel=<c>&since=<id>` returns that channel's `{id,t,enc}` after `since` (validates channel against `/^[A-Za-z0-9_-]{8,64}$/`; bad/absent → empty). `POST {channel,enc}` validates, rate-limits 5/10 s per IP, monotonic `id` via `INCR chat:seq`, `RPUSH ch:<channel>`. Append-only — **never trimmed**.

## Conventions / gotchas

- **Sample rate is 44100 everywhere.** AudioContext is constructed with `{sampleRate: SR}`. Don't mix rates.
- **Audio needs a user gesture.** First sound must come from a click/tap (currently `1 Connect`). Don't try to autoplay on load.
- **Textarea + KEY input are 16px on purpose** — anything smaller makes iOS Safari zoom on focus. Rest of the TUI is 14px. Keep inputs at 16.
- **CP437 typography only in UI copy.** DOS can't render `—`, `…`, or curly quotes — use `-`, `...`, straight `'`. `→`, `½`, `≈`, `│`, `►`, `■`, `█` *are* CP437, fine to use. (Straight `'` inside a single-quoted JS string must be escaped: `let\'s`.)
- **Handshake clip = MP4 + DTMF.** Generate with MediaRecorder preferring `video/mp4` (only Safari makes mp4 in-browser; Chrome/Firefox give webm, which iOS/messengers reject — that's a real limit, not a JS bug). Decode by reading the file with `decodeAudioData` (offline — do NOT decode by *playing* it; realtime capture returns 0 samples on iOS). Keep the key tones **clean DTMF (no `lineize`)** so they stay decodable; only the pretty TX gets coloration.
- **The relay needs the deployed `/api` + a KV store.** Threads read `BOARD OFFLINE` from `file://` or before the KV integration is connected — expected, not a bug. Provision KV in the Vercel dashboard (Storage → KV/Upstash) so the env vars get injected.
- **`env()` everything** that starts/stops abruptly or you get clicks. `bong` intentionally skips the tail fade (it decays naturally).
- **Authentic look:** the UI font is the bundled `'IBM VGA'` CP437 webfont (8x16, narrow half-width glyphs — base size is 16px so it renders crisp). `input,textarea,button{appearance:none; border-radius:0}` kills iOS's native rounded/shadowed control chrome (the main "modern" tell). No `border-radius`, shadows, or gradients anywhere except the spectrogram heat ramp.
- **Idle line:** at the menu (level 2) the TERMINAL is "alive" — `startIdle()` runs a synthetic carrier + line-noise waterfall (`idleFrame`) and a looping low ambient buffer (`makeIdleBuffer`). Purely decorative: no channel is polled, nothing leaks, no old messages. `play()` calls `stopIdle()`; `setLevel()` restarts it only at level 2.
- **Speed is fixed 1x.** `richChar`/`synth` still take a `spd` arg (always 1) so the per-char timing math stays intact; don't reintroduce a speed control without a reason.
- **WebCrypto needs a secure context** (https, which Vercel is). On bare `file://` the crypto/relay won't work — only the modem half does.
- **Determinism matters.** `richChar` (per-char pitch from a pentatonic `NOTES` table) is fixed so a given word always "sings" the same. The handshake uses a seeded PRNG (`rbit`). Keep new voices deterministic.

## Verify after editing

```
node -e "const s=require('fs').readFileSync('index.html','utf8');const m=s.match(/<script>([\s\S]*)<\/script>/);new Function(m[1]);console.log('JS OK');"
```

Then open in a browser and actually listen — the audio is the product, lint can't catch a bad-sounding tone.

## Deploy

Vercel, zero build config — `index.html` static, `api/messages.js` auto-detected as a function. `vercel --prod`. **One-time:** add a KV/Upstash database in the project's Storage tab and redeploy, or threads stay `BOARD OFFLINE`. `vercel.json` sets clean URLs + cache headers; the function overrides with `Cache-Control: no-store`.

## v2 backlog (not started, rough priority)

0. **Thread scale/abuse.** Append-only, never-trimmed; `GET` caps at 200 per channel; no expiry. Add read pagination + maybe per-thread TTL/burn-after-read before it gets used in anger. (No global moderation surface now since nothing is public without a key.)
1. **Decoder mode (messages).** The *key* decoder shipped (DTMF tones in a handshake clip → bytes, via file upload + `decodeAudioData`); the next step is decoding whole *transmissions* — ideally another phone *listening via mic* (no upload). Hardest part is demod that tolerates the lineize coloration + speaker→mic noise; reuse the Goertzel/DTMF machinery but for the payload, and likely a cleaner decodable TX. Spike: `spike/keytone.html`. Robustness next steps: add FEC (repetition/Reed-Solomon) to the key frame so a degraded clip *corrects* instead of just failing CRC.
2. **Auto-foreground / mic catch (native).** Web can't bring itself to foreground or background-listen reliably (iOS). A native shell would let "play a handshake in WhatsApp → app catches it → jumps to the thread" actually work.
3. **QAM "data" voice** as an optional fifth modulation — authentic 56k hiss, but melodically dead, so opt-in only.

## History

Built iteratively in a chat session: started as amber-oscilloscope text-to-Bell-103, went through "sounds like uniform noise" fixes (handshake pacing, inter-char rhythm), added the polyphonic voice palette, the lineize line coloration, speed control, then skinned amber → green CRT → flat tty → DOS comm program → Norton Commander. Then: connect-on-first-press flow (handshake as warm-up, not splash), removed toggles, 16px input, Help-as-transmission. Then: tightened the Norton skin, added a shared chat board, made it an encrypted feed. Latest: **pivoted from a public feed to a secret-transmission tool** — per-key threads addressed by `SHA-256(key)`, transmit generates+shares a strong key, listen pastes a key to tune in, play-only (read off the subtitles). Dropped speed control (fixed 1x), the handle, and WAV save/share to keep it fast and minimal. Then: a 3-level UX (connect → transmit/listen → thread). Then: bundled the true CP437 IBM VGA webfont + killed iOS's rounded control chrome, a clean Quit-to-menu, and an idle "alive" line on the menu. Latest: **the key is now a "handshake" — a shareable clip of sound.** Validated (incl. a WhatsApp video round-trip) that a key encoded as DTMF tones survives transcode; transmit mints a handshake (MP4 via MediaRecorder), listen opens one (`decodeAudioData` + Goertzel) and replays it as the unlock ritual. Raw key hidden behind `COPY CODE` as a backup. Spike harness at `spike/keytone.html`.
