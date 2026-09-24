---
type: Feature
title: "Rich Content — one entry, three levels, one core"
description: "<RichContent source level> renders any text that is more than plain text through the ONE markdown core; nested content renders through the same core, depth-bounded."
tags: [rich-content, markdown, math, nested-rendering, content-ir]
timestamp: 2026-09-24
---

# Rich Content

Spec: `common-docs/projects/rich-content-unification/PLAN.md` decisions 1, 2, 9 (register row RC-B2).

## The entry

```tsx
import { RichContent } from "@/components/rich-content/RichContent";
<RichContent level="inline" source={card.front} />
```

| Level | Renders | Use it for | Loading boundary |
|---|---|---|---|
| `inline` | markdown + math, **phrasing only** (every block element is a `<span>`) — valid inside `<p>`, `<button>`, `<td>`, headings | card faces, quiz prompts/options, key terms, previews, titles, cells | MarkdownCore's shared edge |
| `standard` | + code, tables, mermaid, XML sections, ```markdown fences, nested blocks — no kinds, no actions | notes-like bodies, nested content | one dynamic edge (`RichContentStandardImpl`) |
| `full` | the chat engine (`MarkdownStream` → block registry → kinds, actions) | assistant answers, documents | MarkdownStream's edge |

## One core (invariants)

1. Every level prepares prose with `prose/prose-prepare.ts` (moved out of `BasicMarkdownContent`), runs the delimiter guard, and parses with `MarkdownCore` preset `"chat"` — one plugin list, one math dialect.
2. Inline marks (bold, italic, links, inline code, images, checkboxes, `{{variables}}`, citation chips) come from ONE map: `prose/prose-inline-elements.tsx`. `BasicMarkdownContent` spreads it; the inline level spreads it. Guard: `__tests__/level-parity.test.tsx` (identical elements across all three levels; inline emits no block element).
3. `standard` uses the SAME block splitter as the engine (`content-splitter-v2`) and the SAME block components (`BasicMarkdownContent`, `XmlBlock`, `MarkdownPreviewBlock`, `CodeBlock`, `MermaidBlock`). It is a routing subset, never a second renderer.
4. The kind registry never enters `inline` (checked with `pnpm lab:graph`: a card-face consumer's closure grows by the inline modules only).

## Nested content — `standard/NestedRichContent`

Anything rendered inside other content goes through `NestedRichContent`, which renders at `standard`, one depth deeper:
- XML control sections (`<info>`, `<task>`, `<plan>`, `<database>`, `<private>`, `<event>`, `<tool>`) — `block-dispatch.tsx` `renderNestedSection`;
- prose between tags in an XML card — `XmlBlock`;
- a ```markdown / ```md / ```mdx fence's document — `MarkdownPreviewBlock` (rendered by default, Preview/Source toggle);
- the expanded thinking trace — `ThinkingTraceMarkdown` `variant="body"`;
- the `markdown` kind — `MarkdownKindBlock` (full engine at depth 0, nested renderer below).

**Depth cap** — knob `depthCap` on `<RichContent>` / `RichContentDepthProvider`, default `DEFAULT_RICH_CONTENT_DEPTH_CAP` (3). Past the cap the source shows as plain text with a "Render it" button that renders that one section on demand. This replaces the old "never recurse" rule in `XmlBlock` and the unbounded `MarkdownKindBlock → MarkdownStream` recursion.

**Streaming** — `StandardBlocks` heals the tail of a streaming source (a half-arrived `<tag`, a one/two-backtick line) before splitting; an unclosed inner fence renders as a streaming code block, never raw markup. The React Compiler memoizes the split per source.

**Nested fences** — `components/markdown-core/fence-nesting.ts` is the ONE rule both splitters (static `content-splitter-v2`, live `StreamBlockAccumulator`) use: inside a markdown-language fence, ```lang opens a nested fence and a bare ``` closes the innermost one. Guard: `components/markdown-core/__tests__/nested-fence-splitting.test.ts`.

## Build-graph rule

Inside the chat engine (`components/mardown-display/**`), import `RichContentInline` or `NestedRichContent` directly — never the `RichContent` router, whose standard/full edges would stack a boundary under `MarkdownStream` (code-splitting skill, rules 2–3).

## Not yet here

- A server-renderable level for SEO pages (`features/education/components/sections/SectionRenderer.tsx` is a server component; the client-only levels would blank its prose from the SEO HTML).
- The org-level knob for `depthCap` (today a prop/provider default).

## Change log

- 2026-09-24 — created (RC-B2): levels, nested rendering, nested-fence rule, first surfaces (CardFaceContent, QuestionView, StudyGuideReader key terms, AnalysisCard preview, MemoryAidBlock).
