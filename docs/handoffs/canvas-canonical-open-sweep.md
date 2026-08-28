---
status: active
updated: 2026-08-27
repos: [matrx-frontend]
scope: program
feature: Artifacts + Canvas
vision: [/Users/armanisadeghi/code/common-docs/systems/workspace/artifacts-canvas/VISION.md]
---

# Canvas canonical-open sweep

**What this is:** Make every surface that shows an artifact open it the SAME way — by pointer to
its `canvas_items` row — instead of each one pushing its own private copy into the canvas slice.
**Scope:** Program
**Feature:** Artifacts + Canvas
**Vision:** [VISION.md](/Users/armanisadeghi/code/common-docs/systems/workspace/artifacts-canvas/VISION.md)

## Vision — Arman's words

> "The key is for the canvas to be system wide and always essentially available from any route."

> "Canvas items/artifacts should always open directly into the canvas from ALL surfaces, other
> than the ones that are specifically for the purpose of rendering these directly. Once open, the
> user can have an option to go to the dedicated page. Of course, some routes will override this
> but that would only be if they're a surface that has a unique relationship with a specific
> canvas item."

> "…for us to have a simple sort of canonical, reusable system where any place where we have them,
> you click and they all do the same thing and they work."

## The law this sweep enforces

There are exactly **two** canonical openers. Nothing else may open an artifact.

| Opener | Use when | File |
|---|---|---|
| `useOpenArtifactInCanvas` | You hold block CONTENT that may not be persisted yet | `features/canvas/hooks/useOpenArtifactInCanvas.ts` |
| `useOpenCanvasItem` | You hold a row id for something already saved | `features/canvas/hooks/useOpenCanvasItem.ts` |

`useCanvas().open` (→ `openCanvas`) pushes a full-payload SNAPSHOT into the slice. A snapshot has no
UUID, so `findItemByArtifactId` cannot dedupe it against an item already showing that artifact, and
it drifts the moment the row changes. It survives ONLY for content with no artifact behind it.

## Resources

- Feature docs: [features/canvas/FEATURE.md](../../features/canvas/FEATURE.md) ·
  [features/artifacts/FEATURE.md](../../features/artifacts/FEATURE.md)
- Type registry (what is materializable): `features/canvas/artifact-types/artifact-type-registry.ts`
- Non-persistable types: `NON_PERSISTABLE_CANVAS_TYPES` in `features/canvas/redux/canvasSlice.ts`
- Id check: `isMaterializedArtifactId` in `features/canvas/artifact-types/artifactId.ts`
- Dev server: `pnpm preview:start` (port 3001, ONE machine-wide). Login: `/api/dev-login?token=$DEV_LOGIN_TOKEN&next=/artifacts`
- Test route: `/artifacts` — click any card, the canvas pane opens.

## EXEMPLAR A — a block that holds content (copy this shape)

`components/mardown-display/blocks/artifact/ArtifactBlock.tsx` L166-199. Registry decides, id decides,
snapshot is the fallback:

```tsx
const handleOpenCanvas = () => {
  const rawPayload = typeof canvasData === "string" ? canvasData : JSON.stringify(canvasData);
  const def = getArtifactDef(canvasType);
  const useArtifactPath = def?.materializable && isMaterializedArtifactId(artifactId);

  if (useArtifactPath) {
    void openArtifact({                       // useOpenArtifactInCanvas
      canvasType, title: artifactTitle, content: rawPayload,
      messageId, artifactId,
      artifactIndex: artifactIndex > 0 ? artifactIndex : 1,
    });
    return;
  }
  open({ type: canvasType, data: canvasData, metadata: { /* … */ } });  // no artifact yet
};
```

`components/mardown-display/blocks/mermaid/MermaidBlock.tsx` L211-263 is the same shape with
per-type render metadata hoisted into an `extras` object shared by both branches — copy that when
your block passes render options.

## EXEMPLAR B — a list that holds a row id

`features/canvas/core/SavedCanvasItems.tsx` `handleOpenInCanvas` and
`features/artifacts/components/CmsArtifactList.tsx` `handleOpen`:

```tsx
const { openItem } = useOpenCanvasItem();
void openItem({ artifactId: item.id, type: item.content?.type, title: item.title });
```

## Remaining work — 12 sites, all pending

### Group 1 — thread `artifactId` down, then convert (10 files, do these first)

Each block's renderer ALREADY receives `artifactId` but only folds it into `taskId` via
`artifactDedupKey`. Three mechanical steps per row: (1) renderer passes `artifactId={artifactId}`
to the block, (2) block accepts an optional `artifactId?: string` prop, (3) block's opener adopts
Exemplar A. Do NOT change any rendering.

| # | Block (open site) | Type | Renderer to edit |
|---|---|---|---|
| 1 | `components/mardown-display/blocks/quiz/MultipleChoiceQuiz.tsx` L506 | `quiz` | `renderers/QuizArtifact.tsx` |
| 2 | `components/mardown-display/blocks/comparison/ComparisonTableBlock.tsx` L569 | `comparison` | `renderers/ComparisonArtifact.tsx` |
| 3 | `components/mardown-display/blocks/presentations/Slideshow.tsx` L215 | `presentation` | `renderers/PresentationArtifact.tsx` |
| 4 | `components/mardown-display/blocks/research/ResearchBlock.tsx` L226 | `research` | `renderers/ResearchArtifact.tsx` |
| 5 | `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx` L318 | `resources` | `renderers/ResourcesArtifact.tsx` |
| 6 | `components/mardown-display/blocks/progress/ProgressTrackerBlock.tsx` L392 | `progress` | `renderers/ProgressArtifact.tsx` |
| 7 | `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx` L379 | `troubleshooting` | `renderers/TroubleshootingArtifact.tsx` |
| 8 | `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx` L307 | `recipe` | `renderers/RecipeArtifact.tsx` |
| 9 | `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx` L587 | `decision-tree` | `renderers/DecisionTreeArtifact.tsx` |
| 10 | `components/mardown-display/blocks/diagram/InteractiveDiagramBlock.tsx` L2985 | `diagram` | `renderers/DiagramArtifact.tsx` |

Renderers live under `features/canvas/artifact-types/`.

### Group 2 — generic wrappers (2 files, do these last)

`components/mardown-display/blocks/common/BlockHeaderWrapper.tsx` L122 and
`components/mardown-display/blocks/common/ContentBlockWrapper.tsx` L119 open whatever
`canvasType`/`canvasData`/`canvasMetadata` their caller passed. Read `canvasMetadata.artifactId`
and adopt Exemplar A; when it is absent, keep the snapshot path unchanged. Callers already spread
`canvasMetadata`, so no caller signature changes.

## EXEMPT — do not touch, these are correct

| File | Why |
|---|---|
| `features/cloud-browser/hooks/useOpenCloudBrowserCanvas.ts` | `cloud_browser` — in `NON_PERSISTABLE_CANVAS_TYPES` |
| `features/code-editor/components/ContextAwareCodeEditorCompact.tsx` | `code_preview` / `code_edit_error` — non-persistable |
| `features/code-editor/components/ContextAwareCodeEditorModal.tsx` | same |
| `features/tool-call-visualization/components/ArtifactResultBar.tsx` | `working_document` — non-persistable |
| `components/mermaid/workbench/NewDiagramMenu.tsx` | creates a NEW blank diagram; nothing exists to point at |
| `features/canvas/core/CanvasButton.tsx` | generic pass-through primitive; its caller decides |
| `features/code-editor/components/AICodeEditorModalV2.tsx` | only calls `close()`, never opens |

## Needs a human ruling — STOP, do not convert

`iframe` and `html` live previews. They are persistable by type but their payload is a live preview,
so whether they are artifacts is a product call, not a refactor. Leave them and report them:
`features/code-editor/components/code-block/CodeBlock.tsx` L144 ·
`features/code-editor/components/code-block/MultiFileCodeEditor.tsx` L325 ·
`features/code-editor/multi-file-core/useCodeEdiorBasics.ts` L268 ·
`features/html-pages/components/HtmlInlinePreview.tsx` L161 ·
`features/agent-apps/components/AgentAppPublicRendererImpl.tsx` L558 ·
`features/agent-apps/components/shells/AgentAppFullyCustomShell.tsx` L180

## Rules for this sweep

1. **Never change rendering.** This moves how the canvas is OPENED. Nothing visual changes.
2. **Never delete the snapshot branch.** A block with no artifact behind it still needs it.
3. `pnpm type-check` must be clean before every commit — it is the ONLY type gate.
4. Shared checkout: `git commit --only <your files>`. Never `git add -A`, never `git stash`,
   never `reset --hard`. Other sessions edit this tree at the same time.
5. One commit per file (or per Group-1 row: renderer + block together). Push as you go.
6. Verify at least one converted type live before finishing: open `/artifacts`, click a card of
   that type, confirm the pane opens and clicking the SAME artifact twice reuses one pane item
   instead of stacking two.

## Done

- View mode + canonical opener for mermaid — see `components/mermaid/view/ViewModePane.tsx`, `MermaidBlock.tsx`.
- `useOpenCanvasItem` primitive + both list surfaces converted — see `features/canvas/hooks/useOpenCanvasItem.ts`.
- Pane "Open full page" + `/artifacts/[id]` resolving either identity — see `CanvasPane.tsx`, `artifactSelectors.ts`.

## Decisions needed

**Situation.** Six call sites open a live `iframe`/`html` preview (a code editor's output, an agent
app's rendered page) into the canvas. Their content is generated and re-renderable, so the type
system treats them as persistable, but nobody has said whether a live preview should become a saved
artifact with its own id and share link.
**Decide.** Are `iframe`/`html` live previews artifacts (convert them, they get ids and share links)
or ephemeral views (add them to `NON_PERSISTABLE_CANVAS_TYPES` and stop offering Save on them)?
