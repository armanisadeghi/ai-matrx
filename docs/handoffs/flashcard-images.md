# Flashcard images — remaining lanes

**SoR (read first):** `/Users/armanisadeghi/code/common-docs/systems/flashcard-images/VISION_AND_PLAN.md`
— its status block says exactly what shipped 2026-08-18 (P0 model+rendering everywhere; the
web-sourcing lane through mandate `education.card_image_web_source`, live-demonstrated).
FE contract: `features/flashcards/FEATURE.md` § Images. aidream half:
`aidream/services/education/card_images.py` + its FEATURE.md.

## Remaining

1. **P1 — editor image slot (FE only).** Per-face image control in `EditSetView`'s
   `CardEditor`: show current image (`getCardImages`), replace/remove via
   `fcService.setCardImage`/`removeCardImage`; sources = upload (`useFileUpload` /
   `openFilePicker` + `<CloudFilesPickerHost/>`), the existing Unsplash picker
   (`<ImageManager>` / `SingleImageSelect`, credit → metadata), paste-a-URL, and a
   "Find an image on the web" button calling the aidream lane (needs a thin service
   entry the FE can POST to — none exists yet; there is deliberately no education
   router, so decide the door with the workflow/service owner). Closes the editor
   header's declared fast-follow.
2. **FE trigger for the web lane** ("Illustrate this card / set") — surface the
   sourcing agent per-card and per-set with live progress (floating LiveRunWindow law)
   + the accept/reject review affordance (human feedback trains judge accuracy).
3. **P2 — verified GENERATION pipeline** (plan §2.4): wire `media.images.produce`,
   conform `ai.image.qc_judge` onto JudgeContract + a mandate (its model default is
   still pinned in Python), retry/refuse loop, rolled-up cost, entitlement capability
   `education.card_image_generate` (plan §2.5).
4. **P3 — study_pack_v1 image lane** (mandate-aware, never the hardcoded-agent shape).
5. **Print gaps:** DB-backed decks have no print door (SetDetailView exports only);
   markdown-lane print shows images only when card data carries `frontImageUrl` — wire
   the DB→print data path when the print door lands.
6. **Link-rot sweep:** hotlinked `image_url` rows whose bounded re-fetch fails →
   re-source via the same mandate (FlashcardFaceImage console-warns on rot; make it a
   real sweep + assist chip).
7. **Anon stored-file images:** when the stored lane (upload/generation) writes
   `image_file_id` for a card on a PUBLIC set, also stamp the public CDN URL into
   `image_url` so the anon RPC lane can render it.
