# Flashcard images — remaining lanes

**SoR (read first):** `/Users/armanisadeghi/code/common-docs/systems/flashcard-images/VISION_AND_PLAN.md`
— its §0/status blocks say exactly what is LIVE as of 2026-08-18: the data model, ONE renderer
wired through every UI + 5 print variants, the web-sourcing lane (mandate
`education.card_image_web_source`, demonstrated on real cards incl. correct refusals), the
VERIFIED generation lane (3 more mandates, adversarial judge, retry-once-then-refuse,
demonstrated), structural entitlements with batch pre-flight, the aidream streaming router
`/education/images/*`, and the editor's per-face `CardImageSlot` (Find / Generate / Remove,
browser-verified end to end). FE contract: `features/flashcards/FEATURE.md` § Images. aidream
half: `aidream/services/education/card_images.py` + its FEATURE.md.

## Remaining — all four independent lanes are CHIPPED (2026-08-18); pick up a chip's scope, not this list twice

1. **Editor free lanes** (chip `task_7c28d97b`): upload + Unsplash picker (+credit) in
   `CardImageSlot`, both stamping durable public `image_url` beside any `image_file_id`.
2. **Illustrate-this-set** (chip `task_06ed19da`): per-set trigger in SetDetailView over the
   live `/education/images/source-set` door, per-card streaming progress (Floating Law),
   accept/reject review pass (rejections recorded for judge accuracy).
3. **Link-rot re-source sweep** (chip `task_60e47449`): scheduled aidream sweep —
   bounded-verify hotlinked `image_url` rows, re-source dead ones through the same mandate,
   assists chip summary.
4. **DB-deck print door** (chip `task_0aa48778`): Print action in SetDetailView feeding the
   existing 10-variant printer with `CardWithDetails → Flashcard` mapping (studyFaces for
   cloze + `getCardImages` for image urls).

## Not chipped (blocked on other owners / rulings)

- **study_pack_v1 image lane (P3):** add an optional per-card web-sourcing step to the study
  pack workflow. Blocked-ish on study_pack's own mandate conversion (its 4 hardcoded agent
  version ids are a tracked education-program item); when that lands, the lane is a call into
  `source_card_image` per generated card.
- **Orphaned platform image-pipeline graph nodes:** `ai.image.concept_generate` /
  `prompt_write` / `qc_judge` (`packages/matrx-ai/matrx_ai/graph_nodes/image_pipeline_actions.py`)
  + the never-created `media.images.produce` workflow. The flashcard lanes deliberately went
  through mandates instead (superseding qc_judge FOR CARDS), but the nodes remain
  built-and-unwired with a Python-pinned model default — platform-level unfinished work, not
  flashcards-scoped. Do not delete (unfinished-work alarm); conforming them onto the Judge
  primitive + a mandate is the plan §2.4 shape.
- **Judge human-feedback loop:** editor/review accept-reject clicks should feed
  `platform.judge_verdict` accuracy (kappa calibration) for `education.card_image_qc_judge`;
  the review UI (chip 2) records rejections in metadata — the verdict-ledger wiring is a
  follow-on once that lands.
- **Rolled-up per-image USD:** usage_ledger counts actions; VISION_AND_PLAN §2.5's summed
  describe+generate+judge `pipeline_cost_usd` stamp is not implemented (waiting on the
  matrx-runtime MeterEvent spine, or a service-side AiUsage sum if wanted sooner).

## Related flashcards-feature work owned elsewhere (global view, 2026-08-18)

- WP3 (study core depth) reports fully dispositioned on the education STATUS_BOARD;
  the duplicate-deck single-writer contract lives in `features/flashcards/FEATURE.md`.
- Flashcard generation streams no chunks until run end (aidream agent/provider config) —
  chipped under the Live Run Streaming Sweep handoff, not here.
- Mandate override surfaces (users/orgs swapping the four card-image mandates' agents):
  PROPOSED plan awaiting Arman at `common-docs/projects/mandate-binding-surfaces/PLAN.md`.
