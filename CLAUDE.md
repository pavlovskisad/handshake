# CLAUDE.md

Handoff for continuing work on HANDSHAKE. Read this first.

## What this is

A single-file web toy: text → dial-up modem audio. `index.html` is the entire app — HTML, CSS, JS inline. No framework, no build step, no dependencies, no network calls. It must stay that way unless there's a strong reason; the self-contained single file is the point (easy to share, archive, drop on any host).

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

**UI:** Norton Commander skin. Top menu (Line/Message/Transmit/Help — all tappable, work on mobile), two double-framed panels, bottom = `C:\HANDSHAKE>` prompt + status flags + ONLINE clock + numbered F-key row. Number keys 1–4 are bound on desktop (ignored while typing in the textarea).

## Conventions / gotchas

- **Sample rate is 44100 everywhere.** AudioContext is constructed with `{sampleRate: SR}`. Don't mix rates.
- **Audio needs a user gesture.** First sound must come from a click/tap (currently `1 Connect`). Don't try to autoplay on load.
- **Textarea font is 16px on purpose** — anything smaller makes iOS Safari zoom on focus. Rest of the TUI is 14px. Keep it 16.
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

Static, Vercel. `vercel --prod`. Vercel connector is available in this workspace.

## v2 backlog (not started, rough priority)

1. **Decoder mode.** Paste/drop a friend's WAV, demodulate it back to text. Closes the loop, makes it a two-player toy. Hardest part is FSK/PSK demod that tolerates the lineize coloration — may want a cleaner "decodable" TX variant for round-tripping vs the pretty rich TX.
2. **WebM/video export.** Capture the spectrogram canvas + audio to a shareable clip (MediaRecorder + canvas.captureStream + a WebAudio MediaStreamDestination), so the *animation* shares, not just the WAV.
3. **CP437 bitmap font** (Perfect DOS VGA 437 or similar) instead of system mono, for true DOS authenticity. Needs a bundled webfont — breaks the zero-asset single-file purity, so decide if that tradeoff is worth it.
4. **Shareable message links.** Encode message+speed in the URL hash so a link auto-loads (and maybe auto-plays after a tap). Pairs well with deploy.
5. **QAM "data" voice** as an optional fifth modulation — authentic 56k hiss, but melodically dead, so opt-in only.

## History

Built iteratively in a chat session: started as amber-oscilloscope text-to-Bell-103, went through "sounds like uniform noise" fixes (handshake pacing, inter-char rhythm), added the polyphonic voice palette, the lineize line coloration, speed control, then skinned amber → green CRT → flat tty → DOS comm program → Norton Commander. Last changes: connect-on-first-press flow (handshake as warm-up, not splash), removed toggles, 16px input, Help-as-transmission.
