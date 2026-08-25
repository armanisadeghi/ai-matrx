# FEATURE.md — `knowledge` (local mechanics)

> Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/knowledge/STATE.md`
> — read it before touching this feature in ANY repo. The domain map, the honest built/missing
> capability picture, the guided-walkthrough vision, and every ruling live there. This file is the
> file map and the traps.

The `/knowledge` route is an informational showcase page for the Knowledge System.

## Files

- `app/(core)/knowledge/page.tsx` — route; `bg-textured` wrapper + header spacer + `<Metadata>`.
- `features/knowledge/components/KnowledgeShowcasePage.tsx` — the page (server component).
- `features/knowledge/components/KnowledgePipelineDiagram.tsx` — `"use client"` interactive,
  theme-aware rebuild of the source SVG (tap a phase to focus it).
- `app/(core)/knowledge/extractions/` — extraction dataset catalog; see
  `features/page-extraction/FEATURE.md`.

## Traps

- **Do not confuse this with `KnowledgeLanding`**
  (`features/auth/components/module-landing/landings/KnowledgeLanding.tsx`) — that is the
  conversion-oriented sales landing shown to guests at `/knowledge/data-stores`. This page is
  informational and is not a sales pitch.
- **The diagram has two sources that must stay in sync.** The hand-authored original is
  `common-docs/projects/knowledge-system/vision/visuals/matrx_knowledge_system_full.svg`; the page
  rebuilds it in React/HTML for responsiveness and theming. **Change the system's phases → update
  both** the SVG and `KnowledgePipelineDiagram.tsx`.
- **Keep the capability grid honest.** It links real surfaces and must never imply a capability
  that does not exist. The verified built/missing table is in the common-docs STATE above — update
  it there first, then mirror the labels here.
