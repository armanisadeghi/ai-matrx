> ARCHIVED 2026-07-26 — campaign complete (waves verified shipped in code; live doctrine: .claude/skills/type-safety/SKILL.md)

# (non-feature) — type drift hitlist

_Generated: 2026-07-11T14:08:07.824Z_

**24** actionable duplicates in this feature.

Regenerate: `pnpm generate:type-drift-hitlists`

## `app/(core)/podcast/studio/run-f/_mock/events.ts` (5)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| PodcastStageStartedEvent | interface | stream-events | 7 | duplicate |  |
| PodcastStageEvent | interface | stream-events | 15 | duplicate |  |
| PodcastMetadataEvent | interface | stream-events | 26 | duplicate |  |
| PodcastAssetEvent | interface | stream-events | 34 | duplicate |  |
| PodcastCompleteEvent | interface | stream-events | 44 | duplicate |  |

## `app/(dev)/demos/local-tools/_lib/types.ts` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| ResearchMetadata | interface | stream-events | 63 | duplicate |  |

## `app/(transitional)/apps/app-builder/applets/[id]/page.tsx` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| FieldDefinition | interface | api-types | 45 | duplicate |  |

## `app/api/compute-targets/route.ts` (2)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| ComputeTarget | interface | api-types | 44 | duplicate |  |
| ComputeTargetListResponse | interface | api-types | 61 | duplicate |  |

## `components/mardown-display/blocks/cooking-recipes/parseRecipeMarkdown.ts` (2)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Ingredient | interface | stream-events | 1 | duplicate |  |
| RecipeStep | interface | stream-events | 6 | duplicate |  |

## `components/mardown-display/blocks/diagram/parseDiagramJSON.ts` (2)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| DiagramNode | interface | stream-events | 1 | duplicate |  |
| DiagramEdge | interface | stream-events | 24 | duplicate |  |

## `components/mardown-display/blocks/presentations/SlideView.tsx` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| SlideTheme | interface | stream-events | 22 | duplicate |  |

## `components/mardown-display/blocks/transcripts/AdvancedTranscriptViewer.tsx` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| TranscriptSegment | type | stream-events | 70 | duplicate |  |

## `components/mardown-display/markdown-classification/processors/custom/heading-list-processor.ts` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Position | interface | api-types | 1 | duplicate |  |

## `components/mardown-display/markdown-classification/processors/custom/intro-outro-list.ts` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Position | interface | api-types | 1 | duplicate |  |

## `components/mardown-display/markdown-classification/processors/custom/intro-outro-nested-list.ts` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Position | interface | api-types | 1 | duplicate |  |

## `components/mardown-display/markdown-classification/processors/types.ts` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Position | interface | api-types | 2 | duplicate |  |

## `components/official-candidate/json-truncator/JsonTruncator.tsx` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| JsonValue | type | stream-events | 49 | duplicate |  |

## `components/ui/JsonComponents/newUitls.ts` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| ValidationError | interface | api-types | 5 | duplicate |  |

## `components/ui/JsonComponents/types.ts` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| ValidationError | interface | api-types | 6 | duplicate |  |

## `lib/redux/app-runner/validations/appRunnerValidations.ts` (2)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| ValidationIssue | interface | api-types | 5 | duplicate |  |
| ValidationResult | interface | api-types | 13 | duplicate |  |
