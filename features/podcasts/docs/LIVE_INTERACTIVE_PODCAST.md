# Live Interactive Podcast — design vision

> **Status: VISION / not yet built.** This document captures the concept in
> enough detail to build it later (and to scaffold "coming soon" UI for it now).
> It is the flagship of the podcast roadmap. Nothing here is wired yet.

## The one-sentence idea

You listen to a generated podcast that is **streamed in chunks while it is still
being written** — your microphone is hot, and whenever you say something relevant,
the *unplayed remainder* of the script silently re-writes itself to fold your
input in. To you it feels like the podcast is responding to you. Technically, the
podcast never "talks to you" — it **changes course** based on what you say.

## Why it's powerful (and deceptively simple)

The trick: today we generate the **full** script, convert the **whole** thing to
audio, then play it. The live version just changes *when* we convert to audio:

- Generate the script (as today, with a top-tier model — e.g. Opus).
- Convert it to audio **in chunks** (e.g. ~1-minute segments) and start
  **streaming the first chunk** immediately.
- The UI **tracks playback position** (which chunk/sentence the listener is on).
- The listener's **mic is hot**; we continuously transcribe.
- When we have enough user speech, a **background task** (changes nothing
  currently playing) sends the transcript to a **small/cheap model** asking a
  binary question: *"Is what the user said relevant to this topic? yes/no."*
- If **yes**: hand the **original high-end model** (the one that wrote the script)
  (a) the full script, (b) where we currently are in playback, and (c) what the
  user said — and ask it to **rewrite the script from the next not-yet-generated
  chunk onward**. Audio for the already-played/in-flight chunks is untouched; only
  the **future** (un-rendered) portion changes.

Example: a 10-minute podcast in 1-minute chunks. The user comments during minute 2.
Minutes 2→3 and 3→4 are already rendered, but minute 4 onward is not — so the
model rewrites from minute 4 on, weaving in whatever the user asked/clarified/
reacted to. To the listener, the podcast "addressed" their comment.

## It's still a real episode

The coolest part: when the live session ends, **it's still a real podcast
episode** — not a throwaway. Two follow-on modes fall out of this:

1. **Creator steer-while-recording**: a creator drives their own episode live,
   nudging it one way or another as they notice gaps/issues, then keeps the result
   as the published episode (or re-orders/regenerates from the captured arc).
2. **Re-stream a finished episode**: the same loop applies to an already-complete
   episode — stream existing chunks, hot mic, and splice in fresh ~1-min chunks on
   relevant input.

## Architecture sketch (for the future build)

Pipeline (all per-session, server-orchestrated, streamed to the client):

```
script (Opus)  ──► chunker (≈1 min segments, sentence-aligned)
      │
      ▼
  chunk[i] ──► TTS (chunk) ──► stream audio[i] ──► client player (tracks position)
      ▲                                                    │
      │                                            hot mic ─┘
      │                                                    ▼
      │                                    STT (streaming transcription)
      │                                                    ▼
      │                              relevance gate (small model: yes/no)
      │                                                    │ yes
      └──────── rewrite tail (Opus): script[i_next:] given user input + position
```

Key invariants:
- **Only the un-rendered tail is ever rewritten** — never re-render played audio.
- The relevance gate is cheap + fast (it runs constantly); the rewrite is
  expensive + rare (only on relevant input).
- The session persists as a normal `pc_episodes` row at the end (+ optionally the
  full final script for a clean regeneration).

### Latency is the hard part (the known unknown)
- Chunked TTS must keep the playback buffer ahead of the listener.
- STT + relevance gate must run within a chunk's playtime so a rewrite can land
  before the listener reaches the splice point.
- Mitigations to explore: larger lead buffer, speculative pre-render of the most
  likely tail, "we're folding that in…" micro-acknowledgement beats.

### Existing primitives to build on
- **Streaming TTS**: `app/api/voice-assistant/route.ts` (Cartesia realtime, PCM
  F32LE @ 24kHz) and `app/api/cartesia/route.ts` (browser token). Groq batch TTS
  at `app/api/audio/text-to-speech/route.ts`.
- **STT**: Groq Whisper path already used in `app/api/voice-assistant/route.ts`.
- **Script + agents**: the podcast script agents + the `.md → build_agents.py`
  agent-creation system (a `podcast_relevance_checker` agent is one `.md` away).
- **Dynamic hosts** make this richer (a live multi-host round-table that adapts) —
  see `DYNAMIC_HOSTS_AND_THEMES.md`.

## Near-term: what we scaffold now
- A "Live (interactive)" entry in the studio marked **Coming soon**.
- This doc, linked from `FEATURE.md`.
- Keep the script chunkable in mind when we add transcript/chapter structure.
