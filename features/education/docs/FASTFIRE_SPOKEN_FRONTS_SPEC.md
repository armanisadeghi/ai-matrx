# Fast Fire — Spoken Card Fronts (optional, cached TTS)

> Owner design 2026-07-01. **Status: foundation built (variations); generation +
> playback pending one integration question.** This is a follow-up, NOT part of the
> core that's already shipped.

## Goal
Optionally **speak each card's question aloud** in Fast Fire, in a high-energy,
fast-paced host voice. It must feel *real and varied* (never a robotic template),
and playback must be **instant** — the audio is pre-generated and cached, never
generated on the turn (any per-turn delay would ruin the drill's pace).

**It is an OPTION, never forced.** Default off; a "Hear the questions" toggle.

## The voice: use the owner's agent (Google Gemini TTS)
Agent **"Generate custom speech"** — `id 04f69dff-a258-4791-a44e-b7b87f346b9d`
(frozen v12: `is_version=true`, `id e38d3aa9-015e-421f-892a-bc6a9786f452`).
Model `gemini-3.1-flash-tts-preview`. `settings`: `audio_format: wav`,
`tts_voice: kore`, `stream: true`, `multi_speaker: false`.
Variables (all plain strings — they do NOT have to match the agent's preset
options): `content`, `sample_context`, `speaker_profile`, `directors_notes`,
`scene`.

## The variation system — BUILT
`features/flashcards/fast-fire/spoken-front/variations.ts`. Per the owner:
- **`content` = three parts + the question:** a bracketed ENERGY cue +
  a rotating LEAD-IN phrase + a bracketed ANTICIPATION cue, then the dynamic
  question text. Example: `[high energy/active] Here's the next one. [anticipation/fast] {question}`.
- The **LEAD-IN bank is the biggest (28 phrases)** — it's the text that repeats
  every card, so it needs the most variety ("Here's the next one." / "Next up." /
  "Boom, next." …).
- 5-6 variations each of `sample_context`, `speaker_profile`, `directors_notes`,
  `scene` (all fast/energetic).
- Optional **first-card** opener and sparse **milestone** lines ("Five to go —
  keep it up!" at 5/3/1 remaining) — used sparingly (too many annoy).
- `pickSpokenFrontVariables(cardId, frontText, index, total)` picks a DETERMINISTIC
  (hash of card id) but varied combination → stable regeneration, canned-free set.

## Storage — schema already supports it
Each spoken front is an **`fc_detail` row, `kind='spoken_front'`**, with
`audio_file_id` → a durable `file_id` (via `fileHandler`), `generation_status`
`text_ready`→`audio_ready`. `fcService.addDetail(cardId, 'spoken_front', text, { audio_file_id })`
already exists. Playback re-mints from the file_id (never a stored expiring URL).

## Timing — generate ON-DEMAND, batched (owner's call)
- **NOT at card creation** — a 50-card set would be far too expensive up front.
- **Generate the first time the user turns the feature on / starts a spoken drill**:
  fire all cards **async**, **~5 concurrent**, so a set completes quickly. Show
  progress; play each card's audio the moment it's ready (and it's cached for next
  time). Cards already `audio_ready` are skipped.
- Realtime per-turn generation is explicitly rejected (per-turn delay).

## Drill integration (pending)
When the "Hear the questions" option is on and a card enters `card_recording`,
play its cached `spoken_front` audio (instant). If a card's audio isn't ready yet,
either skip audio for that card or fall back gracefully (never block the timer).

## ⚠ OPEN QUESTION — resolve before building generation
**How does the "Generate custom speech" agent deliver its AUDIO output to the FE
so we can store it as a durable `file_id`?** The Fast Fire grader outputs JSON
(text, read via `selectFirstExtractedObject`). A TTS agent outputs *audio*. Before
wiring generation, confirm the contract:
- Does `launchAgentExecution` on this agent surface the audio as a media block /
  `file_id` in the stream (server auto-persists the WAV → returns a file_id)?
- Or does the run return audio bytes the FE uploads via `fileHandler`?
- Look at how the **podcast** feature / any existing TTS-agent consumer obtains a
  stored audio file (`features/podcasts`, `features/audio`), and whether the
  `agent_run` result for this agent carries a file reference.
Once the delivery mechanism is known, the generation service is small: for each
card → `pickSpokenFrontVariables` → run the agent → obtain the durable file_id →
`fcService.addDetail(card.id, 'spoken_front', content, { audio_file_id })`.

## Acceptance criteria
1. A "Hear the questions" toggle in Fast Fire setup (default OFF).
2. Turning it on generates spoken fronts for the set on-demand, ~5 concurrent,
   with progress; nothing generated at card-creation time.
3. Each spoken front is a durable `fc_detail(kind='spoken_front')` — cached, so a
   second run plays instantly with zero new generation.
4. In the drill, the question is spoken the instant the card appears (no delay),
   fast-paced and audibly *different* card to card.
5. Never forced; never blocks the timer if audio isn't ready.

## Change log
- 2026-07-01 — Created. Variation bank + deterministic picker built
  (`spoken-front/variations.ts`); generation + drill playback pending the audio-
  delivery contract question above.
</content>
