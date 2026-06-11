# Live voice — intermittent "captured=0" capture failure

**Status:** mostly working; one known browser-specific failure mode parked for later.
**Owner doc:** linked from [`../FEATURE.md`](../FEATURE.md).
**Last updated:** `2026-06-11`

---

## Symptom

The Live tab connects cleanly — `ws open`, `streaming`, `mic active`, `token`, `mic: granted`,
`audio ctx: running` are all green and the WebSocket handshake (`session.created` →
`session.updated`) completes — but the session sits in `listening` forever and the agent
never responds. The debug panel's decisive line is:

```
mic flow: captured=0 · sent=0 · rms=0.000
```

i.e. the AudioWorklet (`public/pcm-processor-worklet.js`) never produces a single PCM frame,
so xAI receives pure silence.

**It is browser/environment-specific.** The same code path works in production and on
localhost in regular Chrome. It reproduces only in the Cursor-embedded browser (and
regressed there after working previously). That strongly suggests an embedded-Chromium
Web Audio quirk around mic capture rather than a universal bug in our graph.

---

## What we changed (and why)

All of these are shipped and remain in place — they're correct hardening regardless of the
remaining issue.

1. **Muted keepalive tap to the destination** (`audio/audioCapture.ts`).
   The `pcm-processor` worklet is capture-only (`numberOfOutputs: 0`) and was wired as just
   `source → workletNode`, leaving the capture graph with **no path to `ctx.destination`**.
   Chrome does not pull a source chain that reaches nothing, so the worklet's `process()` can
   run with empty inputs indefinitely. We now also route `source → gain(0) → ctx.destination`
   (silent, no feedback) to keep the source actively rendered.

2. **`await ctx.resume()` if suspended** (`audio/audioCapture.ts`).
   The warm shared mic stream returns instantly, so the synchronous warmup `resume()` no
   longer has a `getUserMedia` round-trip to settle behind. We await the resume in `start()`
   so the context is `running` before we depend on frames. (Confirmed effective — the panel
   now reports `audio ctx: running`.)

3. **Diagnostics added to the debug panel** (`VoiceDebugPanel` + `voiceDebugBus`):
   - `audio ctx: <state>` — red when capture is active but the context isn't `running`.
   - `worklet: process calls=N · hasInput=B` — a worklet heartbeat (`type: "diag"` posted
     every 64 `process()` calls) that distinguishes the two remaining failure branches:
     - `process calls=0` → the worklet is **never scheduled** (graph/keepalive problem).
     - `process calls` climbing but `hasInput=false` → `process()` runs but **no channel
       data reaches it** — almost certainly the shared warm stream being consumed across two
       AudioContexts (the Scribe recorder's still-connected source node "claiming" the track),
       where embedded Chromium delivers silence to the second consumer.
     - `hasInput=true` but `rms=0.000` → the track is live but **silent** (stale/muted OS grant).
   - A **copy button** in the panel header to grab the full snapshot + event log as text.

4. **Debug panel gating** — moved from `selectIsAdmin` to `selectIsDebugMode`
   (`lib/redux/preferences/adminDebugSlice.ts`), so it only shows when app-wide debug mode
   is on rather than for every admin.

---

## Where we stand / next steps

The keepalive + resume fixes did **not** resolve the embedded-browser case (`audio ctx: running`
but still `captured=0`). The `worklet: process calls / hasInput` line was added specifically to
split the remaining diagnosis and was not yet captured before this was parked.

When revisiting, read the `worklet:` line in the affected browser and apply the matching fix:

- **`process calls=0`** → give the worklet a real (silent) output and route `workletNode →
  gain(0) → destination` instead of relying on the source-only keepalive, guaranteeing the
  node is scheduled.
- **`hasInput=false`** → stop sharing the warm stream across AudioContexts for voice; clone the
  track (`track.clone()`) into a fresh `MediaStream` for the voice source so it's an independent
  consumer, or have the voice path acquire its own (non-shared) `getUserMedia` grant.
- **`rms=0.000` with `hasInput=true`** → force a fresh `getUserMedia` (skip the warm reuse) so a
  stale/muted grant can't persist.

Considered "mostly working" for now since production + standard Chrome are fine.
