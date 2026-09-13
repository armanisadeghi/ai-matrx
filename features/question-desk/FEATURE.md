# FEATURE.md — `question-desk`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-12`

---

## Purpose

The Question Desk is where a question an agent filed actually reaches the person who decides it. One interview holds many questions; each is put to ONE respondent, one question filling the screen, and what comes back is a **verdict** plus, when he wrote or spoke one, his **verbatim answer**. A second mode (`review`) shows decisions the desk already made in his name as a dense table he can confirm or overturn.

Cross-repo plan and rulings: `common-docs/projects/question-desk-in-app/PLAN.md` + `REGISTER.md`. The data contract is `aidream/db/migrations/qd_001_decision_interview.sql` — where this doc and that file disagree, the file wins.

---

## Entry points

**Routes**
- `app/(admin)/administration/question-desk/page.tsx` — the interview list.
- `app/(admin)/administration/question-desk/[interviewId]/page.tsx` — the interview. `?q=<slug>` opens that exact question; it is the shape the `question_desk.answer_recorded` notification's deep link uses.
- `app/(admin)/administration/question-desk/layout.tsx` — route metadata **and** the Newsreader `--font-editorial` variable (ruling QD-R7).

The `(admin)` group admits any admin level. That is deliberate and it is not a hole: both tables are `data_class='private'` and RLS grants a row to its filer and its respondent only, so the page can hold nothing a reader is not already entitled to. There is no second, hand-written gate on this surface.

**Components**
- `components/InterviewListClient.tsx` — `MatrxDataTable` + `ArchiveFilter`.
- `components/InterviewClient.tsx` — the orchestrator: state, the keyboard contract, saving, undo.
- `components/QuestionDeskRail.tsx` · `QuestionScreen.tsx` · `AnswerBar.tsx` · `ReviewTable.tsx` · `AskTable.tsx`.

**Hooks**
- `useQuestionDeskKnobs()` — the four `question_desk` knobs, ladder-resolved, with an honest `failed` state.
- `useInterviewQuestions(interviewId)` — the rows plus realtime.
- `useAnswerDraft(questionId)` — the own-words draft in `localStorage`.
- `useDictationAudio(questionId)` — the `cld_files` id of the recording behind a spoken answer, plus `questionRecordingOrigin()`, the stamp that ties a recording to its question.
- `useReadAloud(parts)` — R / Esc through the platform voice.

**Services (direct Supabase, under RLS)**
- `data/db.ts` — the `interview`-schema client, typed off the GENERATED `types/database.types.ts`.
- `data/interviews.ts` — list (with counts), load, archive/unarchive, `opened_at`.
- `data/questions.ts` — list, load, `saveAnswer`, `reopenAnswer` (the undo).

**Redux slices** — none of its own. It reads `userAuth.id` and `appContext.organization_id`, and rides the audio feature's playback and recording slices.

**API endpoints** — none. Every read and write is direct Supabase; transcription rides `POST /api/audio/transcribe` through `useVoiceCapture`.

---

## Data model

**Tables** (`interview` schema, both canonical entity tables, both in `supabase_realtime` with `REPLICA IDENTITY FULL`)
- `interview.decision_interview` — one interview. `respondent_user_id`, `status`, `opened_at`, `archived_at`, `source`, `settings`.
- `interview.decision_question` — one question: the five research parts, the recommendation, the ledger classification (`kind` / `door` / `weight` / `node`), the filing provenance, and the answer (`verdict`, `answer_text`, `answer_source`, `answer_audio_file_id`, `answered_at`, `answered_by`). `mode` is `ask` or `review`.

**Knobs** (`platform.feature_knob`, feature `question_desk`, `overridable_by {organization,user}`)
- `default_view` `"one" | "table"` · `skip_ships_recommendation` bool · `read_aloud_parts` string[] · `undo_window_ms` integer.
Voice, speed and language are NOT here — they come from the existing tiered `listening` config.

**Key types** — `features/question-desk/types.ts`, every row type derived from `Database["interview"]["Tables"]`.

---

## Key flows

**1. Answering with one key.** `1` / `2` / `3` on the interview screen → `record(question, verdict, null, "keystroke")` → `saveAnswer` writes `verdict`, `answered_at`, `answered_by`, `status='answered'` in ONE guarded update → the row comes back, `applyRow` merges it, the saved line offers an Undo for as long as the `question_desk.undo_window_ms` knob says (30 s by default), and the screen advances to the next OPEN question.

**2. Answering in his own words.** `W` opens the box (an effect focuses it after the commit — see gotchas), every keystroke persists the draft under `qd.draft.<questionId>`, `⌘/Ctrl+Enter` saves. The text goes to the row **exactly as typed**. An empty save is refused on screen with *"Write something first, or use one of the buttons."* and never reaches the database.

**3. Answering out loud.** The mic is `ProTextarea`'s, so the level glow, the live streaming transcript, the device menu, the troubleshooting modal and the "you are still recording" protection all come with the field. `V` (or the "Answer by voice" button) opens the box, focuses it, and **starts the microphone** through the field's `startDictation()` handle — the person just talks. `Esc` stops the microphone first and only closes the box on a second press, because a transcript still on its way needs the box to land in. If the field refuses to start, its sentence appears in the action bar instead. When the transcript lands, `onTranscriptionComplete` marks the draft as spoken, so the save writes `answer_source='voice'` instead of `'typed'`. When the recorder's upload lands, `dictationAudioRegistry` announces the `cld_files` id (matched by the `RecordingOriginProvider` stamp around the box) and the save writes it to `answer_audio_file_id`; when the upload FAILS the screen says so and offers the retry, and the answer still saves without the audio.

**4. Confirming or overturning a decision made in his name.** `mode='review'` rows render as the dense table, grouped by `review_kind`. Confirm writes `verdict='confirm'`. Overturn opens an inline box that REQUIRES words and writes `verdict='overturn'` with them — which is what turns the row back into a real question.

**5. An agent changes a question while he is reading it.** The realtime channel delivers the new row, `mergeRow` accepts it because its `version` is newer, and the screen updates with no reload. His own echoes are dropped by the same rule.

---

## Invariants & gotchas

- 🚨 **EVERY TEXT BOX ON THIS SURFACE IS `ProTextarea`** — the write box, the inline own-words box in the ask table, and the overturn box in the review table. Arman, 2026-09-12: *"you need to be using our protext area so that you automatically get all of the recording features and the other things that come along with it."* A raw `<textarea>` here is a defect, not a shortcut. **ProTextarea does not trim or normalise the value it emits** (checked 2026-09-12: its only `.trim()` calls gate the submit button and the agent-action guards, and trim an AI *result* the user explicitly applies) — the bytes a person types or dictates reach `onChange` unchanged.
- 🚨 **`V` starts the microphone through the PLATFORM field's handle, never through this feature's own recorder.** `ProTextarea`'s forwarded ref is a real `HTMLTextAreaElement` carrying `startDictation()` / `stopDictation()` / `isDictating()` (type it `ProTextareaElement`) — the same `useMicField` → `useVoiceCapture` → shared-recorder path the mic button takes, so a keyed dictation and a clicked one are ONE recording, app-wide. `V` sets a pending flag and the mount effect calls `startDictation()` after the box has actually committed (the same commit-order rule as the focus call below). **Nothing here reaches into ProTextarea's DOM, and nothing here instantiates a recorder.** If the field refuses — voice off, no microphone, no recorder on the route, a transcript still finalizing — it returns `{ started: false, reason, message }` and that `message` is what the action bar prints, beside a read-aloud refusal. `V` is never a dead key. (Before 2026-09-12 the field had no such door and `V` only opened the box; the platform fix landed with this feature as its first consumer.)
- **This surface does NOT wire `ProTextarea`'s `onSubmit`.** Its submit gate is `value.trim().length > 0`, which would refuse a whitespace-only answer with no sentence at all; the save stays this feature's, so the refusal a person meets is always *"Write something first, or use one of the buttons."*
- **`answer_text` is never trimmed.** Not here, not in the data layer, not on the way out. Leading spaces and trailing newlines are part of the answer. Proven live 2026-09-12: 67 chars in, 67 chars stored, hex begins `202020` and ends `0a`.
- **`verdict` and `answered_at` move TOGETHER, in both directions.** `decision_question_answer_pair_ck` is `(verdict IS NULL) = (answered_at IS NULL)`, so the undo must clear both in one statement — clearing one alone is refused by the database.
- **A knob never has a code fallback.** `useQuestionDeskKnobs` has three states and the screen honours all three; it does not guess `"one"` or `true` while the read is unresolved or failed, because the skip button's SENTENCE depends on the value and a wrong sentence there ships a ruling nobody made.
- **The write box is focused from an effect, not from the key handler.** `requestAnimationFrame` inside the keydown fires before React has committed the textarea, so the focus call hit nothing and every following keystroke was read as a command. While a box is open the global handler also declines every printable key, focus or no focus.
- **Which view shows is DERIVED, never latched.** An effect that chose the view when the knobs resolved ran before the questions had loaded, so a review-only interview latched the one-per-screen view and printed "Nothing to ask here yet." over 117 real decisions.
- **A refusal renders INSIDE the sticky action bar, above the buttons.** Printed under it, a refusal lands below the fold on a 900px viewport and the person sees nothing happen at all (verifier finding 1, 2026-09-12). Read-aloud failures also raise a toast.
- **The progress meter counts exactly the rows the rail lists.** It used to count every question in the interview while the rail listed only the ask-mode ones — "1 of 8 answered" over six rows (verifier finding 3). Review rows now get their own line.
- **The undo restores the status the row actually held**, passed in by the caller, never guessed from `asked_at` (verifier finding 5).
- **The rail's legend keeps its own bottom clearance** because the app shell parks fixed chrome in the bottom-left corner, on top of it (verifier finding 6).
- **The rail lists ask-mode questions only.** A review-only interview shows a count and points at the table instead of a queue whose rows would open a screen with nothing on it.
- **Realtime echo suppression is version-monotonic**, never a saving flag: the echo arrives after the REST response has already landed the fresh row.
- **Read-aloud passes no voice, no speed, no language.** Those are the `listening` tier's, resolved inside the adapter at start time.
- **`primeAudioOutput()` runs synchronously inside the gesture.** An async hop first means silence with no error.
- **`utils/supabase/interviewDb.ts` is NOT this feature's client.** That one still casts through the Vision Interview's hand-declared `InterviewSchema`; `data/db.ts` is typed off the generated types with no cast and must never grow one.

---

## Related features

- Depends on: `components/official/ProTextarea` (every text box), `features/audio` (`speak`/`useSpeech`, `primeAudioOutput`, `RecordingOriginProvider`, `dictationAudioRegistry`), `lib/scoped-config` (knobs), `@ai-matrx/data` (`guardedUpdate`, `useRealtimeChannel`), `@ai-matrx/design-system` (`MatrxDataTable`, `ArchiveFilter`, `ConfirmDialog`), `lib/toast`.
- Depended on by: the `question_desk` MCP tool and the `question_desk.answer_recorded` notification in `aidream` (they write and link to these rows).
- Cross-links: `features/vision-interview/FEATURE.md` (the OTHER tenant of the `interview` schema — a different primitive, deliberately), `lib/entity-list/FEATURE.md`.

---

## Doctrine compliance

**Primitives reused**
- Types: `Database["interview"]["Tables"]` from the generated `types/database.types.ts`; `ArchiveFilterValue`; `MatrxColumnDef`; `RecordingOrigin`; `PlaybackItemStatus`.
- Components: `ProTextarea` (`components/official/`), `RecordingOriginProvider`, `MatrxDataTable`, `ArchiveFilter`, `ConfirmDialog` (`@/components/ui/confirm-dialog`), Lucide icons.
- Redux slices / selectors: `selectUserId`, `appContext.organization_id`, the audio playback and recording slices (through their own hooks).
- Hooks: `useSpeech`, `useAudioPlayback`, `useEffectiveKnob` / `ensureEffectiveKnob`, `useRealtimeChannel`.
- Services: `guardedUpdate`, `toast`, `primeAudioOutput`, `subscribeDictationAudio`, `get_user_emails_by_ids` (the respondent column).

**Primitives introduced**
- `useAnswerDraft` (`hooks/useAnswerDraft.ts`) — Why a new hook: nothing in the repo persists an unsaved textarea per RECORD id and restores it. Considered extending: the notes autosave loop. Rejected because: notes autosave writes to the database, and a half-written ruling must NOT reach the row until he saves it.
- `useQuestionDeskKnobs` (`hooks/useQuestionDeskKnobs.ts`) — Why a new hook: `useSessionKnob` deliberately swallows a failed read so a cosmetic consumer never throws; this surface must SAY when a knob is unreadable, because the value decides what a button says. Considered extending: `useSessionKnob`. Rejected because: changing its swallow-and-continue contract would change every existing consumer.

---

## Rulings this lane made (each with its cost if wrong)

| id | ruling | why | cost if wrong |
|---|---|---|---|
| QD-L2-1 | The list is `MatrxDataTable` + `ArchiveFilter` driven directly, not `<EntityListPage>` | the shell needs a `qd_list_scoped` / `qd_list_scope_counts` RPC pair, which only a migration can create — outside this lane | one RPC migration plus a `listConfig`; the columns and row actions move across unchanged |
| QD-L2-2 | Counts come from ONE grouped read of the questions' status columns, capped at 2,000 rows, and the screen SAYS when the cap was hit | three `count(*)` head requests per interview is an N+1 that grows with the list | a counts RPC later |
| QD-L2-3 | Own-words drafts live in `localStorage` under `qd.draft.<questionId>` | it survives a refresh and a closed tab with no write to the row | a server-side draft column later; nothing to migrate |
| QD-L2-4 | The Undo window is the `question_desk.undo_window_ms` knob (30 s default), read with no code fallback | an undo offered after its sentence is gone is a control nobody can find, and how long is a preference, not taste | change the knob row |

---

## Current work / migration state

Built 2026-09-12 as lane L2 of the Question Desk campaign, then re-worked the same day: every text box became `ProTextarea` on Arman's ruling, and the six client defects from the zero-authorship walk were closed. **Not verified by any agent, and stated rather than assumed:** a real voice answer end-to-end — the agent browser blocks microphone access, so `answer_audio_file_id` has still never been written by a recording; and read-aloud has never been HEARD (the button flips, the broker token returns 200, the state holds for about the length of the parts, then returns — nothing observed says it played and nothing says it failed). **A person with a microphone and speakers still has to press R once and dictate one answer.**

---

## Change log

- `2026-09-12` — L2 (Claude Opus 5): **`V` actually dictates.** `ProTextarea` gained an imperative dictation handle on its forwarded ref (`startDictation` / `stopDictation` / `isDictating` — the platform fix this doc previously filed as a gap), and this surface consumes it: `V` and the "Answer by voice" button open the box and start the shared recorder, `Esc` stops the microphone before it will close the box, and a refusal from the field prints in the action bar. The transcript still saves verbatim with `answer_source='voice'`.

- `2026-09-12` — L2 (Claude Opus 5): closed the zero-authorship walk's six client findings — refusals render inside the action bar with a toast; `default_in_force`, `blocks`, `door_note` and the filing provenance now reach the screen; the meter counts the rows the rail lists; the list names the respondent; the undo restores the real prior status; the key legend clears the shell's bottom-left chrome.
- `2026-09-12` — L2 (Claude Opus 5): every text box is `ProTextarea` (Arman's ruling), so the mic, live transcription, the device menu, recording protection and the cleanup actions come from the platform field instead of this feature's own `useVoiceCapture` wiring, which was deleted.
- `2026-09-12` — L2 (Claude Opus 5): the Undo window became the `question_desk.undo_window_ms` knob (a peer lane registered the row and mirrored the literal here; reading the row is the honest version of that mirror).
- `2026-09-12` — L2 (Claude Opus 5): built the feature — interview list with the archive axis, the one-question-per-screen interview with the full keyboard contract, the dense review and ask tables, read-aloud, voice answers, per-question drafts, the undo, realtime, and the three knobs.
