# Content Converter — the cross-tool conversion contract

**Status:** live. The registry is `generators/index.ts`; all eight `TargetKind`s (`ALL_TARGET_KINDS` in `types.ts`: deck, summary, mind_map, memory_aid, notes, quiz, practice_test, audio) have live generators.
Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/education/STATE.md — read it before touching this feature in ANY repo (kit/ingest flow, the two study-pack producers).

**This is the ONE dispatch layer for turning content into study artifacts.** Do not build a second one — register a generator.

## What it is

`convertContent({ source, targetKind, options })` turns a normalized text source into a persisted study artifact, links a `source` lineage edge to the origin, and returns enough to open it. React entry: `useContentConverter()` (`convert`, `convertMany` — parallel, never throws, each target succeeds/fails alone); outside React: `runConvert` from `registry.ts`. Consumers: the upload kit fan-out (`onboard`), one-click note/deck/quiz conversion, flashcards, assessment, media.

`ConvertSource` is `{ text, title?, ref? }`: `text` is already extracted (ingest owns raw input to text; generators own text to artifact; never mix). `ref: SourceRef` is the lineage anchor, canonically a `cld_files` id (`ref.fileId`) or an origin entity (`ref.entityType`/`entityId`). `ConvertResult` is `{ targetKind, artifactId, resourceType, href, title, trust?, detail? }`; keep `href` + `resourceType` exact so lineage and navigation work. `isTargetAvailable` / `listGenerators` drive the kit picker.

## Registering a generator

Add the `TargetKind`, then `registerGenerator({ targetKind, label, available, capability, run })` in `generators/index.ts` (or self-register from the owning feature, as notes, quiz/practice_test and audio do). A generator is a plain async function (not a hook): run the agent (`runAgentExtraction`, which takes a `mandateKey`, never an agent id), coerce, persist, call `recordSourceLineage`, return. The kit picker lights it up automatically.

## Rules

- **THE COVERAGE LAW: an artifact is sized by the MATERIAL, never a constant.** `coverage.ts#planCoverage` splits at the source's own boundaries and scales the count (bounded by knobs, times `depth` quick/standard/thorough); every list-shaped generator (deck, quiz, practice_test, memory_aid, summary key points, notes key terms) goes through `segmentedGenerate` (plan, per-section run, merge, de-duplicate, report gaps). Never hand-roll a second fan-out. Prose targets write one section per coverage section and stitch in order; `mind_map` namespaces node AND edge ids per sub-map before grafting under one root. Every ceiling is a knob (`platform.feature_knob`, feature `education.study_kit`, via `lib/knobs/featureKnobs.ts`) — never a constant.
- **THE COUNT LAW:** an explicit `options.count` is delivered exactly (balanced passes, spares merged and trimmed, near-duplicates dropped), and `onProgress` never reports more than the request. Guard: `__tests__/count-law.test.ts`.
- **A multi-section run is BACKGROUND** (`runAgentExtraction` `live: false`): N sections are N conversations, and a kept instance would materialize as its own artifact. Progress goes through `ctx.onProgress`. A single-pass run keeps the live stream.
- **THE NO-FREEZE RULE:** every section attempt has an end-to-end deadline (`SECTION_ATTEMPT_DEADLINE_MS`, cancelled via `signal`) and gets one retry (`SECTION_MAX_ATTEMPTS`); a failed section drops to `null`, is reported when it fails, and `describeGaps` puts the honest line in `ConvertResult.detail`. `sectionJournal.ts` lets a retry over the same plan (`sectionPlanKey`) resume only unanswered sections.
- **Lineage is mandatory, one writer, visible both ways.** `recordSourceLineage` is the ONE writer (it RETURNS a `LineageOutcome`; callers surface failed edges with Retry via `announceLineage`, never console-only); `lineage.ts` + `GeneratedFromChips` read forward, `MadeFromSource` reads backward (and shows kit siblings). Do not grow a third renderer. Quiz/practice_test also keep the flat `assessment.source_kind`/`source_id` columns.
- **Trust flows through unchanged** (`trustMerge.ts` rolls up per-item envelopes). `mind_map`/`audio` agents emit no citations, so `sourceTrust.ts#buildSourceTrust` derives a grounded envelope from the known source; no generator persists `trust: null`. When `ConvertSource.text` carries IC-3 `GROUNDING_PASSAGE` markers the deck generator keeps them verbatim — never replace durable RAG chunk ids with local markers.
- **Steering and kit runs:** `ConvertOptions.steer` (instruction, card/question types, sections) is honoured by deck and quiz/practice_test. A kit run (`ref.kitId`) drops items the kit's decks/quizzes already hold (`existingItems.ts`) and, when the kit has an outline, runs per outline section stamping `metadata.outline_section_id`.
- **Making more:** `reopenSource(fileId)` recovers a file anchor's text (docproc, stored bytes, PDF re-extract); `reopenAnchor(sourceType, sourceId)` is the ONE anchor-to-text read (file via `reopenSource`; `note` / `fc_set` / `assessment` via the SAME serializer their own convert surface uses; it throws an actionable line, never returns empty). Worked examples: flashcards `AddMoreCardsButton`, `kits/MakeMoreFromKit`.
- **ONE convert-source dialog** (`ConvertContentDialog`): metered via the canonical entitlement guard and gated by `useAiComplianceGate`; opens the floating `LiveRunWindow` per target; optional `sourceRef` (pass a richer ref when you hold one) and `focusKind` (lead with and highlight one format; neither auto-runs a conversion).
- Capability per target comes from the generator's `capability` (e.g. `education.generate_cards`, `education.mindmap_generate`, `education.notes_generate`, `education.quiz_generate`, `education.practice_test_generate`, `education.audio_generate`). Mandate keys: `mandates.ts` (`CONVERT_MANDATES`; the deck target rides `flashcards.generate_from_source`).
- Presentation (icons, colours, names, units, verbs per format) lives once in `targetPresentation.ts`.

## Where it lives

`registry.ts`, `types.ts`, `useContentConverter.ts`, `coverage.ts`, `segmentedGenerate.ts`, `runAgentExtraction.ts`, `recordSourceLineage.ts`, `lineage.ts`, `generators/` (`deck`, `summary`, `mindMap`, `memoryAid`; notes, quiz/practice_test and audio self-register from `education/notes`, `education/assessment`, `education/media/audio`), `__tests__/`.
