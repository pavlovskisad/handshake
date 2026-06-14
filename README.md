# HANDSHAKE

Type text, hear it leave as a dial-up modem transmission. Live spectrogram, subtitled handshake play-by-play, share the audio to friends. One static HTML file, no build, no dependencies.

Norton Commander TUI skin. The whole app is `index.html` — open it in a browser and it runs.

## What it does

- **Connect** — first press of `1` runs the classic handshake (DTMF dial, ring, ANSam answer tone, V.8 chirps, double bong, line probe sweep, equalizer training noise), subtitled stage by stage, ending on `CONNECT 57600`. Carrier detect lights, session clock starts.
- **Transmit** — once online, `1` sends the message text as audio. Each character is encoded through a rotating palette of real modem modulations (Bell 103 FSK, V.21 high channel, V.23 buzz, V.22-style PSK), with DTMF beeps for digits, a bong on sentence ends, a static tick on commas, carrier blips on spaces. Deterministic: the same text always sounds the same.
- **Save / Share** — exports the message as a 44.1 kHz mono WAV; uses the native share sheet on mobile, download elsewhere.
- **Help** — transmits its own key reference through the modem (eats its own dog food).
- **Line** (menu) — redials the handshake on demand.

Everything runs through a `lineize()` post-process: 250–3400 Hz telephone bandpass, tanh saturation, hiss bed, 50 Hz hum, random crackle — the glue that makes synthesized tones sound like copper.

## Run

```
open index.html          # macOS
# or just drag it into a browser tab
```

No server needed. Audio requires a user gesture (the `1 Connect` press) — browsers block autoplay, which is also period-correct.

## Deploy

Static. Vercel picks it up with zero config:

```
vercel            # preview
vercel --prod     # production
```

`vercel.json` only sets cache headers and clean URLs.
