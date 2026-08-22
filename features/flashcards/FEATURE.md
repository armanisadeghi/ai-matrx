# Flashcards — FEATURE

The largest education subsystem (sets, cards, details, study modes, FastFire, editor,
public deck pages). 🚨 **Start at the education project home:
`/Users/armanisadeghi/code/common-docs/systems/education/STATE.md`** — its
GAP_ANALYSIS supersedes any older status claim. This file holds the durable per-feature
contracts; it was created by the flashcard-images build (2026-08-18) and is deliberately
narrow — extend it as other lanes land, don't fork a second doc.

## Data spine

`education.fc_set` / `fc_card` / `fc_detail` (Supabase, direct client reads via
[data/fcService.ts](./data/fcService.ts)). Set membership is a `platform.associations`
edge (`fc_card -member-> fc_set`), NOT a column. A card loads as `CardWithDetails`
(`{...card, position, details: FcDetailRow[]}`). Detail rows are the per-card layer
system: text layers (`helper`/`example`/`hint`/…), audio (`spoken_front` and
`helper` + `audio_file_id`), and images (below). All reads filter
`deleted_at is null`. A text-only layer gains durable TTS audio via
`fcService.setDetailAudio` (status → `audio_ready`) — the helper-audio lane
([fast-fire/helper-audio/generateHelperAudio.thunk.ts](./fast-fire/helper-audio/generateHelperAudio.thunk.ts))
is its consumer.

## Agent-generated decks — the single-writer contract (D-WP3-4)

A headless generation run has TWO potential fc_set writers: the surface's explicit
save (from-topic / from-source / convert deck) and the stream's render-block
materialization (`FLASHCARDS_CANONICAL_ADAPTER`). The contract that keeps them to
ONE row, keyed by the run's conversation id (every headless generation runs in its
own fresh conversation):

- **Surfaces never call `createSetWithCards` directly for a generated deck** — they
  go through `fcService.createGeneratedSetForConversation(conversationId, input, cards)`,
  which adopts the adapter's set if the adapter won the race (updating
  name/topic/difficulty) and otherwise creates the set stamped
  `metadata.source_system="cx_conversation"` / `source_id=<cid>`.
- **The adapter links, never twins:** before creating, it looks up the
  cx_conversation stamp for its `info.conversationId` and returns a link to the
  surface's set. Ordinary multi-deck chat conversations never carry the stamp, so
  chat behavior is unchanged.
- Pinned by [`data/__tests__/generated-set-single-writer.test.ts`](./data/__tests__/generated-set-single-writer.test.ts).

### Known limits (single-writer)

- The dedupe is look-before-write, not a DB constraint (a global unique on
  `metadata->>conversation_id` would break legitimate multi-deck chat
  conversations), so a few-millisecond interleave of both writers could in
  principle still double-create. Observed writer gap in production was ~500ms;
  live-verified single-set behavior 2026-08-18.

## Images on card faces — cross-repo SoR: `common-docs/systems/education/flashcard-images/VISION_AND_PLAN.md`

- **Model:** `fc_detail` kinds `front_image` / `back_image` — one ACTIVE row per face
  (writers soft-delete prior rows of the kind). `image_file_id` = stored platform file;
  `image_url` = durable/hotlinked web URL (the PRIMARY lane per Arman's 2026-08-17
  ruling: agents find expert images on the open web); `text` = real alt text;
  `metadata` = provenance + the sourcing agent's trust judgment.
- **ONE renderer:** [`FlashcardFaceImage`](../../components/mardown-display/blocks/flashcards/FlashcardFaceImage.tsx)
  (file_id → `InlineMediaRef` self-re-mint; url → graceful link-rot fallback that hides
  instead of breaking, console-warns for re-source sweeps). Never render a face image
  any other way.
- **ONE adapter:** [`components/study/cardImages.ts`](./components/study/cardImages.ts)
  (`getCardImages` / `getFaceImageDetail` / `cardHasImage`) — the image twin of
  `voiceTestExtra.ts`. Never inline the `details.find(...)` idiom again.
- **ONE writer:** `fcService.setCardImage(cardId, face, {file_id|url, alt, ...})` /
  `removeCardImage` — supersede-then-insert. Server-side (agent lanes) writes are
  aidream `services/education/card_images.py`: web-sourcing through mandate
  `education.card_image_web_source`, and VERIFIED generation through
  `education.card_image_prompt_writer` → `card_image_generator` →
  `card_image_qc_judge` (generate → adversarial vision judge → retry once → refuse).
- **Per-SET trigger:** "Illustrate this set" on
  [`components/set-detail/SetDetailView.tsx`](./components/set-detail/SetDetailView.tsx),
  over the `/education/images/source-set` door. THREE parts, one module each —
  never fork a second copy: [`illustrateSetRun.ts`](./components/set-detail/illustrateSetRun.ts)
  (the typed stream contract + pure reducer; wire twin of aidream's
  `SetImagePlanEvent` / `SetImageProgressEvent`),
  [`IllustrateSetWindow.tsx`](./components/set-detail/IllustrateSetWindow.tsx) (an
  `inline-window` that renders the canonical `LiveRunProgress` rows WHILE the batch
  runs — ~30-60s per card, so never a spinner and never a page-shifting block — then
  becomes the review pass), and `fcService.reviewCardImage` (the writer).
  **The review pass is the point:** every attached image shows the sourcing agent's own
  trust reasoning, its source domain as a real link, and Keep / Reject; a rejection
  stamps `fc_detail.metadata.human_review` BEFORE the soft-delete so the agent's miss
  survives as evidence for judge accuracy. The set refetches after the run so badges and
  thumbnails match.
- **Editor slot:** [`components/editor/CardImageSlot.tsx`](./components/editor/CardImageSlot.tsx)
  — one compact icon row per face in `EditSetView` with FIVE actions. Two are FREE
  (no entitlement guard, no AI spend, added 2026-08-19) and two are METERED:
  - **Upload** (free) — the learner's own picture through the canonical
    [`useFileUpload`](../files/handler/hooks/useFileUpload.ts). Uploaded with
    `visibility:"public"` ON PURPOSE ("images are born public", VISION_AND_PLAN §2.1):
    cards are shareable and public sets render for anonymous visitors, so the face needs
    a permanent CDN URL. The lane stamps BOTH `image_file_id` and the durable
    `image_url`, and **refuses to persist a signed URL** (`isSignedUrl` guard →
    file_id-only + a console warning + an honest toast, never silent rot).
  - **Photo** (free) — Unsplash stock via
    [`UnsplashPickDialog`](./components/editor/UnsplashPickDialog.tsx) on THE shared
    primitive [`lib/media/unsplash.ts`](../../lib/media/unsplash.ts) (`/api/unsplash`
    proxy; the slide-deck `slide-images.ts` is a thin re-export of the same module —
    never fork a second Unsplash client). Stores Unsplash's permanent CDN URL plus
    `metadata.credit {name,url}`, and fires `trackUnsplashUse` on ATTACH (ToS: on use,
    not on browse).
  - **Find** / **Generate** (metered) — stream the aidream doors
    `/education/images/source-card|generate-card`. Agent refusals surface with their
    reasoning; never forced, never silent. **Remove** soft-deletes the face's rows.
  - **ALT TEXT IS REQUIRED on both free lanes** — pre-filled (Unsplash's own description,
    else the face text) in a dialog the user confirms; the attach button stays disabled
    while it is empty. Education is unusable without it.
- **Attribution renders, it is not just stored:** `metadata.credit` flows
  `cardImages.toCredit` → `FaceImageRef.credit` → a small "Photo: <name>" caption under
  the face image (linked, UTM-tagged). Unsplash requires the photographer to be credited
  wherever the photo is displayed.
- **Metered, structurally (Arman 2026-08-18):** capabilities
  `education.card_image_source` / `card_image_generate` — FE
  `useEntitlementGuard` (guard before spend, commit on success, paywall on cap);
  server checks `billing.resolve_capability` BEFORE any spend and records
  `usage_ledger` rows even while unenforced; `source_set_images` pre-flight-trims a
  batch to the plan's remaining allowance. Numbers live in the admin plan UI.
- **Wired surfaces:** FlashcardItem flip faces (+ open-in-window forwarding),
  FlashcardMobileView slides (via `toFlashcardMobileCardsFromStudy`), StudyDeck,
  CanvasFlashcardsView, FastFire live card (`DrillCard.frontImage*`), SetDetailView
  CardPeek (badge + thumbnail), public anon pages (`get_public_flashcard_set` RPC emits
  `front_image_url`/`back_image_url` + alt — anon can only use durable URLs, never a
  bare file_id), and print (cut-cards / both-sides / study-sheet / front-only /
  back-only variants; the fixed-geometry variants — landscape / 6-up / Avery — are
  text-only by design), reachable from BOTH lanes: the markdown block and — since
  2026-08-19 — the DB-backed deck (SetDetailView **Print**, beside Export, same
  10-variant dialog). The DB deck's `CardWithDetails[]` reaches the printer through ONE
  mapper, [`utils/deckPrintData.ts`](./utils/deckPrintData.ts) (`buildDeckPrintData`):
  faces via the shared `studyFaces` (cloze prints occluded front / revealed back, never
  raw `{{c1::}}`), images via `getCardImages`. Print honours a **Print face images**
  setting (default ON, offered only on the 5 image-capable variants).

### Known limits (images)

- The set run is not durable across a page refresh: every attached image is already
  committed to the DB card by card, but the REVIEW pass lives in page state, so a
  refresh mid-run loses the keep/reject list (the images stay, and per-card Remove in
  the editor still reaches them). Making the run itself resumable needs a server-side
  run record.
- The review pass records `fc_detail.metadata.human_review`; wiring those verdicts into
  `platform.judge_verdict` accuracy for `education.card_image_web_source` is the
  follow-on (see `docs/handoffs/flashcard-images.md`).
- A print window is a fresh, UNAUTHENTICATED document, so only a durable `image_url`
  can travel into it. A `file_id`-only face image is skipped and counted
  (`skippedImageCount` → a toast naming how many), never silently dropped — the same
  constraint the anon public-deck lane lives under. New uploads no longer create such
  rows (the upload lane stamps the public URL beside every `image_file_id`), but rows
  written before 2026-08-19 still can — no backfill sweep exists yet.
- Hotlinked `image_url` rot has a graceful render fallback but no re-source sweep yet —
  chipped.
- The anon public-deck RPC and print lanes can only use `image_url`, so any face image
  carrying a bare `image_file_id` is invisible to them. Every writer stamps both today;
  the residue is historical rows, which have no backfill sweep yet.
- Attribution reaches the face renderer through the `cardImages` adapter only. Surfaces
  fed the flattened `front_image_url`/`back_image_url` shape (the anon public-deck RPC,
  print) carry the URL and alt text but not the credit caption.

## Change log
- 2026-08-22 — Generated-set title reads the `flashcard_set` kind's `title` only: the mandate
  `flashcards.generate_from_source` (v6) dropped `set_title` from its output_schema and declares
  `output_kind="flashcard_set"`, so the `title | set_title` coercion is gone from
  `useGenerateCards` (`GeneratedCardSet.title`), `generated-set-from-envelope`, the
  from-topic/from-source creators, and `education/convert/generators/deck.ts` (no legacy twin).
- **2026-08-19 — The editor's two FREE image lanes shipped (upload + Unsplash stock).**
  `CardImageSlot` is now a compact 5-icon row per face. Upload goes through the canonical
  `useFileUpload` at public visibility and stamps BOTH `image_file_id` and the durable CDN
  `image_url` (signed URLs are refused, loudly). Unsplash goes through the new SHARED
  primitive `lib/media/unsplash.ts` — `slide-images.ts` was collapsed into a re-export of
  it, so one client, one cache, one ToS contract — stores `metadata.credit {name,url}`,
  and fires the download event on attach. Both lanes require alt text. Credit now RENDERS
  under the face image (`cardImages` → `FaceImageRef.credit` → `FlashcardFaceImage`).
  Neither free lane is metered. Live-verified in the browser on the Volcanology set: an
  Unsplash attach (durable `images.unsplash.com` URL + credit row) and an upload attach
  (public `cdn.matrxserver.com` URL + `image_file_id`, file visibility `public`).

- **2026-08-21 — Collapse-on-mastery (Q15 #4b, spec 26a).** The other half of
  `expands_into`: ONE pure resolver ([data/collapse.ts](./data/collapse.ts), pinned by
  8 tests) folds mastered sub-cards out of a queue and steps a parent aside while its
  sub-cards are still active — when every child folds, the concept collapses back into
  the parent. Durable per-learner decision on `education.item_mastery.collapse_state`
  (`auto` derives from streak≥3 + mastery≥0.8; `collapsed`/`expanded` overrides win —
  writer: `studyService.setCollapseState`, owner-scoped RLS update). The expansion
  edge gained its first reader (`fcService.getExpansionEdges`). Wired into the
  FastFire launcher (best-effort, never folds a deck to nothing) with a
  "N mastered sub-cards folded in" receipt on card 1. Classic-study wiring is the
  named next step (interacts with D-WP3-2's fixed-pass ruling).

- **2026-08-21 — Review modes + play-all (Q15 #4a, spec 26b).** The scoreboard's
  filter pills gained **Best** (top-5 scored answers WITH audio — a rank, not a
  predicate, in `selectReviewRows`) and a **Play all** transport
  (`fast-fire/components/FastFireReviewPlaylist.tsx`): one persistent `<audio>`
  element whose src swaps inside `ended` with a lookahead-of-1 URL resolve, so the
  chain honors the iOS unlock rule the per-row player documents. Keyed on the
  filter so switching resets the chain.

- **2026-08-21 — Session-level transcript review (Q15 #3, spec 26c).** FastFire now
  assembles the SEGMENTED full-session transcript (per card, in presented order, with
  question + grade — `fast-fire/session-transcript.ts`, capped at 20k chars) and the
  end-of-session professor review receives it as `transcript` instead of the old
  unlabeled per-attempt join; it persists to `study_session.session_transcript`
  (column existed, never written) and renders collapsed on the session detail page.
  The DB-held "Flashcard Batch Reviewer" agent (v4) is instructed to use the sequence
  for cross-card confusion, consistency, and in-session improvement — the three
  payoffs the spec named.

- **2026-08-21 — Pre-generated "I'm confused" helper audio (Q15 lane #1).** The
  FastFire spec's zero-wait help headline shipped by composing live primitives:
  `flashcards.enrich_card` writes the spoken-friendly helper text (kind
  `helper`), the new `flashcards.helper_tts` mandate (declared in aidream
  `client_mandates.py`, same TTS holder as spoken fronts, independently
  rebindable calm voice) renders it ONCE to a durable `audio_file_id` on the
  same `fc_detail` row. Prep is on-demand + cached
  (`ensureHelperAudioForSet`, "Instant help" card on FastFire setup, N/M
  progress, never re-generates); mid-drill, "I'm confused" plays the cached
  clip + shows the text INSTANTLY while the live `flashcards.help_live` lane
  still deepens the answer in the background. No cached helper → behavior
  unchanged.

- **2026-08-19 — DB-backed decks can print.** `SetDetailView` gained a **Print** action
  (beside Export) on the SAME canonical printer/dialog the markdown lane uses, fed by the
  new `buildDeckPrintData` mapper (studyFaces + getCardImages). Added the printer's
  `showImages` setting (default ON, image-capable variants only). Browser-verified on a
  live deck: both face images render in the print document, a cloze card prints occluded
  front / revealed back, and the one file_id-only image is skipped with a toast.

- **2026-08-18 — "Illustrate this set" (the per-SET image lane).** Set detail can now run
  the whole deck through the web-sourcing agent in one action, entitlement-guarded with the
  meter shown before the click. aidream's `source_set_images` was extended to stream typed
  per-card progress, which this surface renders as live rows in a floating window; when the
  run settles the same window becomes a review pass (thumbnail + the agent's trust
  reasoning + source link + Keep/Reject), and rejections are recorded on the detail row
  before the image is removed.
- **2026-08-18 — Image lanes completed to the acceptance bars:** editor `CardImageSlot`
  (Find/Generate/Remove per face, streaming, metered), verified generation lane on
  mandates (adversarial judge, retry-once, refuse), structural entitlements with batch
  pre-flight, aidream `/education/images` streaming router. Live-verified in the
  browser end to end (including a correct, explained agent refusal).
- **2026-08-18 — Duplicate-deck bug fixed (D-WP3-4).** Every surface generation was
  creating TWO identical fc_set rows (explicit save + render-block materialization,
  ~500ms apart). Single-writer contract above; 20 historical duplicate pairs
  soft-deleted in the live DB (canvas links repointed to the kept twins).
- **2026-08-18 — Inline voice tutoring is closed to the current card.**
  `VoiceTutorPanel` still resolves `education.voice_tutor` and appends the exact
  front/back/topic/revealed state, but no longer equips a hidden `web_search`
  tool. The database-held Holder now treats that card as its complete ground
  truth, coaches Socratically, and gives a loud handoff to the full uploaded-
  material tutor when the question is unsupported.

- 2026-08-18 — `fcService.mergeSetMetadata` is now the canonical compare-and-swap merge for
  `fc_set.metadata`. Public-library classification and grounding provenance no longer need a blind
  read/spread/write that can erase import, folder, or concurrent metadata keys. First consumer:
  WP11's grounded exam-content pipeline (`exam_slug`, curation state, retrieved chunk ids).
- 2026-08-18 — WP3 gaps 4/8/12/14 closed. **Formula card kind** (VISION §17: latex +
  variable definitions + worked example in `dynamic_content.formula`; composed by
  `studyFaces` so every surface renders it; editor Add→Formula + FormulaFields; fixing it
  exposed and fixed the platform-wide `\(…\)` inline-math promotion defect in
  `ConfigurableMarkdownContent`). **Generation-time depth tiers** (Depth picker on both
  create surfaces; `foldDepthIntoRequest` carries the tier through the agents' declared
  `user_request`/`focus` variables; 5 forcing tests; exam-tier proven live). **Semantic
  Write grading** (`gradeTypedSemantic` lane on the `flashcards.grade_typed_answer`
  mandate; Levenshtein stays instant, verdict+reason upgrade it; live-proven on a
  paraphrase). **Deck-level card-audio prep** ("Prepare card audio" on set detail,
  batch generator with N/M progress). Known limit: D213 — AI generation currently
  persists duplicate sets (surface save + stream-end artifact materialization); fix
  owned by chip `task_a876e306`.
- 2026-08-18 — Fast Fire spoken-front generation dispatches every missing card at
  once. Provider admission, cooldowns, and rate-limit adaptation belong to the
  central matrx-ai dispatch boundary; this feature no longer maintains a five-call
  worker pool that serializes large decks.
- 2026-08-17 — `/education/flashcards` route chrome (IC-5): the six secondary actions
  (drill weak areas, review due, progress, new-from-document, import, export library) moved out
  of the body button row — which could not wrap and overflowed the viewport at 375px — into the
  shell header via `EducationToolHeader actions={…}` → `HeaderActions`. Export is offered only
  when the library has decks (`HeaderAction` has no disabled state). "New" stays in the body as
  the one labelled primary action. Verified at 1280/820/375 in both themes.
- 2026-08-18 — Created with the images-on-faces contract (flashcard-images P0 + web
  sourcing lane shipped; see the cross-repo SoR for the full determination).
