# Flashcards — FEATURE

The largest education subsystem (sets, cards, details, study modes, FastFire, editor,
public deck pages). 🚨 **Start at the education project home:
`/Users/armanisadeghi/code/common-docs/projects/education-platform/README.md`** — its
GAP_ANALYSIS supersedes any older status claim. This file holds the durable per-feature
contracts; it was created by the flashcard-images build (2026-08-18) and is deliberately
narrow — extend it as other lanes land, don't fork a second doc.

## Data spine

`education.fc_set` / `fc_card` / `fc_detail` (Supabase, direct client reads via
[data/fcService.ts](./data/fcService.ts)). Set membership is a `platform.associations`
edge (`fc_card -member-> fc_set`), NOT a column. A card loads as `CardWithDetails`
(`{...card, position, details: FcDetailRow[]}`). Detail rows are the per-card layer
system: text layers (`helper`/`example`/`hint`/…), audio (`spoken_front` +
`audio_file_id`), and images (below). All reads filter `deleted_at is null`.

## Images on card faces — cross-repo SoR: `common-docs/systems/flashcard-images/VISION_AND_PLAN.md`

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
  `removeCardImage` — supersede-then-insert. Server-side (agent lane) writes are
  aidream `services/education/card_images.py` through the mandate
  `education.card_image_web_source`.
- **Wired surfaces:** FlashcardItem flip faces (+ open-in-window forwarding),
  FlashcardMobileView slides (via `toFlashcardMobileCardsFromStudy`), StudyDeck,
  CanvasFlashcardsView, FastFire live card (`DrillCard.frontImage*`), SetDetailView
  CardPeek (badge + thumbnail), public anon pages (`get_public_flashcard_set` RPC emits
  `front_image_url`/`back_image_url` + alt — anon can only use durable URLs, never a
  bare file_id), and print (cut-cards / both-sides / study-sheet / front-only /
  back-only variants; the fixed-geometry variants — landscape / 6-up / Avery — are
  text-only by design).

### Known limits (images)

- The editor (`EditSetView`) has no per-face image slot yet (upload / stock / web /
  remove) — P1 in the SoR plan; `docs/handoffs/flashcard-images.md`.
- The markdown-block print lane only shows images when the caller's card data carries
  `frontImageUrl`/`backImageUrl` (widened `Flashcard` type); the DB-backed deck has no
  print door at all yet (SetDetailView exports, but doesn't print).
- Stored-file images (`image_file_id`) don't reach ANON pages until the writer also
  stamps the public CDN URL into `image_url`.

## Change log

- 2026-08-17 — `/education/flashcards` route chrome (IC-5): the six secondary actions
  (drill weak areas, review due, progress, new-from-document, import, export library) moved out
  of the body button row — which could not wrap and overflowed the viewport at 375px — into the
  shell header via `EducationToolHeader actions={…}` → `HeaderActions`. Export is offered only
  when the library has decks (`HeaderAction` has no disabled state). "New" stays in the body as
  the one labelled primary action. Verified at 1280/820/375 in both themes.
- 2026-08-18 — Created with the images-on-faces contract (flashcard-images P0 + web
  sourcing lane shipped; see the cross-repo SoR for the full determination).
