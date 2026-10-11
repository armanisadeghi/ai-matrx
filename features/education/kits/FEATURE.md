# Study Kits — one subject, everything for it

**Status:** live · **Routes:** `/education/kits` (index, `KitsHome`), `/education/kits/new` (the one create page), `/education/kits/[id]` (the hub, `KitHub`). `/education/start` forwards to `/new` with its query.
Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/education/STATE.md — read it before touching this feature in ANY repo (living-kit status and the study-pack open items); product plan `common-docs/systems/education/study-kit/projects/living-kit/PLAN.md`. Agent surface `matrx-user/education-kits` (list / detail / new views, one manifest).

## What it is

A kit is the learner's material for ONE subject plus every study aid made from or added to it (flashcards, summary, quiz, practice test, mind map, memory aids, notes, audio). The hub is a study path (Understand it, Make it stick, Prove you know it), not a directory.

## Data model (zero tables)

A new kit is a `scope` under the per-org "Study kit" scope type (slug `study-kit`; `kitScope.ts`):

- **Sources** are plain edges `source → ('scope', kitId)` with metadata `kitSource: true`; a kit holds any number of them. Removing one archives its edge (`assoc_remove` tombstones); the Source is untouched.
- **Aids** are flagged `member` edges `aid → ('scope', kitId)` (`educationKit: true`, `targetKind`).
- **Lineage:** each generated aid links a `source` edge to EVERY Source, stamped `kitId`, so "Made from" names each one (`convert/recordSourceLineage.ts` is the one writer).
- **Legacy anchor kits** (made before the scope model: the kit id IS the ingest anchor, a `file`/`note`/`processed_document`/`fc_set`/`assessment`) are still read from the anchor's incoming `source` edges. The first time one takes another Source it is promoted (`promoteAnchorKit` in `kitService.ts`: kit scope created, anchor becomes Source #1, aids copied, old edges stamped `kitId`, old URL opens the new kit; nothing deleted).
- Reads go through the registered association RPCs (`assoc_for_entity` / `assoc_for_sources`) — never a direct `platform.associations` query. The kit name is `metadata.sourceTitle` (written once per run by `onboard/kitTitle.ts`); older kits without it fall back to the newest artifact's title. An artifact's own title may differ from the kit's name.

## Rules

- **`targetKind` is the discriminator.** Generated edges (`recordSourceLineage`) and flagged manual members carry it; a `source` edge without it belongs to another system on the same anchor (the per-card `fc_card → file` edges would flood a kit). Filter on the stamp, never a type blocklist.
- **Reads fail loudly.** `readKit` returns `null` only when the authoritative read succeeds with no members; a failure throws so the hub shows a retryable error, never a false empty kit. `listKits` scans the complete canonical library (no ceiling), throws if any origin lookup fails, and goes through `lib/db/transientRetry.ts`; the index offers retry rather than claiming no kits.
- **No invented kit score.** Per-aid stats come from the Education Library KPI fold for the kit's exact artifact ids (`readKitArtifactStats`; the exact-id filter keeps it from scanning the whole library). One deck's retention is never shown as kit mastery. See `../library/FEATURE.md`.
- **One create page** (owner ruling, VISION.md): `/education/kits` then Create kit then `/education/kits/new` (`StartHero`: the one Source input, then Build with AI or Saved aids via `SavedAidsKitForm`); both modes call `createMultiSourceKit`. `?source=<fileId>` pre-picks a file; `?source=&from=` naming an existing kit forwards to its page. Guard: `__tests__/one-create-route.test.ts`.
- **Add saved aid** opens `AddSavedAidsDialog` in place over THE `SavedAidPicker`; the writer checks the membership fingerprint and re-reads the selected library records before writing flagged `member` edges. The unsaved Saved-aids draft survives a tab (`manualKitDraftRecovery.ts`).
- **"Make more from it" converts the kit's OWN material** — never the generic ingest (that builds a second, disconnected kit). `MakeMoreFromKit` recovers text via `convert/reopenAnchor.ts` (no re-upload, no new anchor) and hands it to `ConvertContentDialog` with the recovered `SourceRef` (stripping it loses the durable ids a citation needs), so output lands in THIS kit. `kitAddHref(sourceType, sourceId, target)` is the kit URL plus `?add=<kind>`; an unknown `add` is ignored; a deep link opens and highlights the picker and never auto-runs (generation spends quota).
- **Chat builds the kit** (`generate_in_kit`, one write target, `applyPolicy: "ask"`): `parseGenerateInKit` lists every problem at once (unknown kind, `into` not a live deck/quiz member, `card_kinds` on a quiz, `question_types` on a deck, bad `section_titles`, count outside 1-100; `audio` is not offered). Apply STARTS the run and returns "started"; `KitGenerateRunner` runs the COPPA gate (`useAiComplianceGate`), the entitlement guard (`TARGET_CAPABILITY`, check before, commit on success) and a tab-bound run marker (`kit:generate:<type>:<id>`). One code path: `generate/runKitGenerate.ts` (new aid = the converter contract; cards into a deck = Add more cards; questions into a quiz = Add more questions).
- **Outline and Coverage:** `outline/outlineService.ts` reads `education.study_structured_section` rows (by `kit_scope_id`, `position`) and starts the server workflow `education_kit_outline` through the system lane (subject `kit:<id>`; an active run is rejoined, never doubled); `useKitOutline` reattaches on mount. Stale = the Sources now held differ from `input.sources` of the run in `metadata.built_by_run_id` (the server fingerprint cannot be recomputed in a browser). Coverage counts per section by `metadata.outline_section_id`; legacy anchor kits promote before building.
- **Doors:** a kit is reachable from the run board (Open your kit), every artifact page (`convert/MadeFromSource`), the tools grid, the kit page's own Material / Make more / Add saved aid, and the home nudge chip (`home/nudges.ts` to `kitAddHref`).

## Where it lives

`features/education/kits/`: `kitScope.ts`, `kitService.ts`, `kitWrites.ts`, `kitSurfaceScope.ts` (path order and next-challenge shared by page and scope), `recoverKitMaterial.ts`, `generate/`, `outline/`, `components/`, `__tests__/`. The kit builder is `features/education/onboard` (`useKitGeneration.ts`).
