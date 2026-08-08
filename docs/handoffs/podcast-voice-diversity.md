---
status: active
updated: 2026-08-08
repos: [matrx-frontend, aidream]
vision: []
---

# Podcast voice & cast diversity — selection UX + verification

## Vision — Arman's words

2026-08-08, verbatim: "We have a major problem with all of our podcasts having
the same names for hosts and the same voices. Now, yes, I've confirmed a couple
of good Google voices that I personally like, but we also have to be careful
that we don't make it where it's all the same all the time. And we also need
some better UI for users to be able to quickly listen to voices and choose the
ones that they want, and we should nudge them towards selecting voices as
opposed to always just going with the default. But these are things that if
we're not careful, can create massive breaking changes."

Also: "having you document a big task for an agent to test the heck out of a
lot of these voice-related things … to run on my computer so I can listen."

## What already exists (verify before building — do not re-implement)

- **Server rotation is built** (`podcast_generator.py`): `_default_cast`
  (seeded gender-alternating name draw from a 20-name pool),
  `_assign_dialogue_voices` (gender-matched, per-episode-seeded voice rotation
  for BOTH bands — Google pool for 1–2 hosts, ElevenLabs for 3–10),
  `refresh_voice_pools()` loading `ai.voices` (synced by
  `scripts/sync_voices.py`) as the source of truth.
- **Fresh cast per preview**: `get_podcast_cast_preview` seeds with
  `uuid4()` per call (a show_id seed once collapsed every episode onto one
  cast — that regression must never return).
- **Name mode-collapse on API-path runs closed 2026-08-08**: a request naming
  no speakers now hands the script agent a fresh rotated default cast
  (`_speaker_names_json`).
- **FE cast editing exists**: `SpeakerCastEditor` (collapsed section in
  `GeneratorForm`), `usePodcastCastPreview`, `useVoices`, voice catalog +
  `useVoiceSamplePlayer` (sample playback machinery already exists).

## Remaining work

1. **Voice-selection nudge in the generator form.** The cast editor hides in a
   collapsed "Host names, genders & voices — optional" section, so nearly every
   run ships the default draw. Make the drawn cast VISIBLE on the collapsed
   trigger (names + voice display names), add a one-click "Shuffle cast"
   (re-fetch `/podcast/cast-preview`), and an inline listen (▶) per speaker via
   the existing `useVoiceSamplePlayer`. Trap: the form only sends `speakers[]`
   when `castPreview.preview` resolved — keep that contract; never send a cast
   the preview didn't produce (`buildCast` throws on count mismatch by design).
2. **Arman's preferred voices as weighted defaults, not fixed defaults.** He has
   confirmed Google voices he likes — represent that as a per-show (or org)
   *preferred voice pool* that the rotation draws from FIRST but still rotates
   within, never a hardcoded pair. Likely shape: `pc_shows.metadata.voice_prefs`
   (show-level) consumed by `_effective_speakers`' pool build; must degrade to
   the full pool when prefs are empty. Ask Arman WHICH voices he confirmed
   before building (Decisions below).
3. **Per-show cast continuity option.** Rotation fixed "always the same", but
   some shows WANT recurring hosts. Add an explicit per-show toggle: "recurring
   cast" (pin names+voices on the show, reused every episode) vs "fresh cast
   per episode" (today's behavior). This is the careful part — defaulting to
   recurring would silently re-create the monotony bug; default stays fresh.
4. **Local listening test-run for Arman** — a work order an agent runs on his
   machine so he can HEAR the results: generate a matrix of short truncated
   episodes — 2-host Google (×3 runs, confirm different voice pairs), 3-host +
   6-host + 10-host ElevenLabs (confirm distinct voices within an episode and
   across runs), 1-host solo — then produce a single page/list with the audio
   URLs labeled by cast + voices so he can click through and listen. Use
   `scripts/podcast_e2e_matrix.py` (aidream, `PODCAST_E2E_FULL` off) or the
   `/podcast/generate` endpoint; episodes land on the default Matrx Mix show.
   Also sample-play each pool voice (`ai.voices`) so he can mark keepers → feed
   item 2's preferred pool.

## Decisions needed

- **Situation:** The default-voice rotation currently draws uniformly from the
  full gender-matched pools (`ai.voices`). Arman has personally confirmed some
  good Google voices, but which ones isn't recorded anywhere.
  **Decide:** name the confirmed Google (and any ElevenLabs) voices, and
  whether they should be *weighted first* in rotation or the *only* defaults
  (recommendation: weighted first, full pool stays reachable — avoids
  re-creating the "always the same" problem).

## Done

- 2026-08-08 — Rotation + fresh-preview + suggested-names fixes landed (see
  "What already exists"); 10-voice ElevenLabs cap enforced (chunked-audio work
  tracked in `docs/handoffs/podcast-system.md`).
