# Dynamic Hosts, Formats & Themes — design vision

> **Status: PARTIALLY LATENT.** The capability exists at the config layer but is
> NOT wired into the production `/podcast/generate` path. This doc records the
> target and the exact seams to unlock it. Scaffold the UI now (Coming soon where
> not wired); wire the server when the existing dynamic-host code is located.

## Target

Podcasts should support a **fully dynamic** cast and style, not the current
hardcoded 2-host English/Farsi format:

- **Host count**: 1 (monologue) → 2 (the current default) → N (round-table, news
  panels with 7+ voices) → effectively unlimited.
- **Formats**: interview, debate, panel/round-table, monologue, narrated.
- **Themes**: e.g. "fair & balanced news" ↔ its deliberate opposite ("unfair &
  unbalanced"), a **debate assistant** (two sides argue a motion), etc.
- **Crossover to live**: the dynamic cast is what makes the
  [Live Interactive Podcast](./LIVE_INTERACTIVE_PODCAST.md) compelling — a live,
  adapting round-table.

## Current reality (verified 2026-06-08)

- `packages/matrx-ai/matrx_ai/agent_runners/podcast_generator.py` hardcodes
  `_FIXED_SPEAKER_COUNT = 2` with a "Do not parameterize" comment. Script agents
  are type-specific (`_EducationalScriptAgent`, `_NewsScriptAgent`,
  `_PersianScriptAgent`) and all produce 2-speaker dialogue.
- **The plumbing exists but is dormant**:
  - `config/tts_config.py` `TTSVoiceConfig` supports `speakers: list[TTSSpeaker]`,
    multi-speaker Google (`to_google()`), ElevenLabs dialogue turns, and
    `align_speaker_labels()` / `validate_speaker_names()`.
  - The graph node (`graph_nodes/podcast_action.py`) accepts
    `number_of_speakers: int = Field(default=2, ge=1, le=8)` and a `podcast_type`
    comment referencing `round_table | monologue | …` — but these are **ignored**
    downstream.
- **Open question for the owner**: there is reportedly existing dynamic-host /
  themes / debate code (7+ hosts). It is **not** in the production path of this
  repo — locate it (a branch / matrx-local / a script) so we wire it rather than
  rebuild.

## Seams to unlock (server)

1. **Script generation**: an N-speaker, format-aware, theme-aware script agent (or
   a parameterized prompt) that emits speaker-labeled dialogue for an arbitrary
   cast. Output stays the `<podcast_dialogue>Speaker: line</podcast_dialogue>`
   shape (already parsed by `_extract_dialogue`).
2. **Voice mapping**: build a `TTSVoiceConfig` with one `TTSSpeaker` per host and
   pass it to the audio agent (the multi-speaker config already exists; the
   podcast path just doesn't use it). Note Google's current `MAX_SPEAKERS = 2` —
   N>2 needs a provider that supports it (ElevenLabs dialogue) or per-line synthesis
   stitched together.
3. **Request surface**: honor `number_of_speakers`, add `format` + `theme` +
   per-speaker voice/name to `PodcastRequest`, thread through to the script + audio
   stages (today they're dropped).
4. **Speaker metadata on the episode**: persist the cast (names + voices) so the
   player/transcript can show speaker avatars (see roadmap "multi-voice").

## Near-term: what we scaffold now (frontend)
- **Host count picker** (1 / 2 / 3 / 4+) and **format/theme picker** in the
  generator form — sending the fields when the server supports them, **Coming
  soon** otherwise.
- Speaker-aware transcript rendering (names/avatars) is a follow-on once the
  episode carries cast metadata.
