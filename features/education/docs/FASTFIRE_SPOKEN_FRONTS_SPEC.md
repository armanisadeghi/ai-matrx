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

## ⚠ STATUS (2026-07-01): BUILT, audio-read corrected, NEEDS LIVE VERIFICATION
An adversarial review caught that the first implementation read the audio from an
`audio_output` render block — WRONG for streaming TTS. Corrected: Gemini TTS
terminates with an **`audio_stream_end`** event carrying the durable `file_id`
(the exact contract the podcast generator reads, `features/podcasts/generator/
reduce.ts`); the agent stream processor files it as an `unknown_data_event` render
block tagged `_dataType:"audio_stream_end"`. `readAudioFileId` now reads that
(with the `audio_output` path as a fallback). Duplicate spoken_fronts are now
structurally impossible (partial unique index `uq_fc_detail_one_spoken_front`).
**Still to verify LIVE** (couldn't be tested headlessly — `agent_run` doesn't
return stream events): that a real run of agent 04f69dff surfaces
`audio_stream_end` with a non-null `file_id` in the agent pipeline (vs the podcast
running its own stream reader). The toggle is DEFAULT OFF, so the core drill is
unaffected until this is confirmed. iOS off-gesture `<audio autoPlay>` is a known
follow-up (play the decoded buffer through the Start-resumed AudioContext, like
the buzzer).

## Audio delivery — mechanism RESOLVED (one detail to confirm)
The TTS agent's audio comes back through the agent **STREAM as an audio render
block**, NOT via `selectFirstExtractedObject` (that's JSON-only, what the grader
uses). In `features/agents/redux/execution-system/thunks/process-stream.ts` the
server emits a `media_block` event (or legacy `audio_output`); the FE lifts it via
`fromMediaBlock` into a `UnifiedMediaBlock` (`kind: "audio"`) and upserts it into
the render-blocks store under `requestId`, blockId `media_block_audio_current`
(status `streaming` → `complete`). So the generation service:
1. `launchAgentExecution({ agentId: '04f69dff-…', runtime: { variables }, config:{ autoRun:true, displayMode:'background' } })`.
2. Wait for the run to complete (poll stream phase, like `executeBuiltinWith*`).
3. Read the audio block from the render-blocks store by `requestId` (kind audio).
4. **CONFIRM (the one detail):** does that `UnifiedMediaBlock` carry a durable
   `file_id`/CDN `url` (server already persisted the WAV) — then store it directly;
   OR raw bytes/a transient url — then push through `fileHandler.upload` to mint a
   durable `file_id`. (Inspect the live block shape at build time; `UnifiedMediaBlock`
   / `fromMediaBlock` are in the agents stream layer.)
5. `fcService.addDetail(card.id, 'spoken_front', content, { audio_file_id })`.
The render-block selectors keyed by requestId already exist
(`active-requests`/render-blocks selectors) — reuse them; do not re-read the stream.

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
