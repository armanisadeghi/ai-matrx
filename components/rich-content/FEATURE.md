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

**Nested fences** — ONE rule, defined once in `@ai-matrx/content-ir/source` (`source/fence-nesting.ts`, aidream `apps/shared/content-ir-core`): inside a markdown-language fence, ```lang opens a nested fence and a bare ``` closes the innermost one; a nested fence still open at the end retries strict CommonMark. Both splitters here (static `content-splitter-core`, live `StreamBlockAccumulator`) and the source tokenizer import it; aidream's Python block detector is held to it by the package-generated vectors (`content-ir-core/__tests__/fence-nesting-vectors.json`, byte-identical copy run by `test_fence_nesting_vectors.py`). Guard here: `components/markdown-core/__tests__/nested-fence-splitting.test.ts`.

## Server level — `server/RichContentServer`

`<RichContentServer level="inline" | "standard" source>` renders on the server (React Server Component) so SEO and public pages ship the formatted text in their HTML. Same core, not a second renderer: `preprocessProse` + delimiter guard, preset table `markdown-core/markdown-core-presets.ts` (shared with the client `MarkdownCoreImpl`; the server runs `MarkdownCoreServer`), element maps `prose/inline-level-elements.tsx` and `prose/prose-block-elements.tsx` (shared with `RichContentInline` and `BasicMarkdownContent`), and the splitter core `content-splitter-core.ts` with `NO_SPLITTER_ENVELOPES` (the client entry `content-splitter-v2.ts` binds the kind-registry envelope hooks, which only add metadata and cannot load in an RSC). Prose, tables, XML sections (to the depth cap), dividers and images render on the server; code, mermaid, XML cards, ```markdown fences and past-cap sections go to the client `StandardBlock` inside a depth provider. Delimiter violations report through a client leaf (`DelimiterViolationReport`). Guard: `__tests__/server-level-parity.test.tsx` — server HTML equals client HTML for a study guide, a dispatcher note and a flashcard (mutations of preset, math normalizer and prose preparation each turn it red).

Keep the shared modules environment-neutral: no `"use client"` and no hooks in `prose/*-elements.tsx` or the presets; every stateful piece they name carries its own `"use client"`.

Consumers (server level unless noted): learn articles (`SectionRenderer` via `SectionRendererBase` — prose `standard`/`reading`, every short authored string — descriptions, FAQ answers, subheadings, bullets, CTA body — `inline`; `LearnArticle` summary), education hero descriptions (`EduHero`), creator pages `/c/[handle]` (tagline, bio, class descriptions), booking intro `(link)/b/[bookingId]`. Client-SSR through `RichContentStaticProse` / `RichContentStaticInline` (same core, react-markdown statically imported — public pages only): `/s/[token]` share lenses, `/p/e/...` public resource body + description, `(link)/sign/[token]` frozen document. The editor preview (`SectionRendererPreview`) uses the client `<RichContent>`.

## Variants — `variant="reading"`

Typography only, never a second renderer (`prose/variant-root.tsx`): the same markup inside one `[data-rc-variant="reading"]` wrapper plus one scoped, UNLAYERED stylesheet — body 1.125rem / line-height 1.75, ~70ch measure, heading scale 2 / 1.5 / 1.25 / 1.125rem, foreground text color. Available on `<RichContent>` (standard/full), `RichContentServer` (standard) and `RichContentStaticProse`. Used by learn prose, share-page and public-resource document bodies; card faces and short text keep `default`. Guard: the parity test proves server == client for `reading` and that removing the wrapper leaves the default markup byte-for-byte.

Why unlayered CSS and not descendant utilities (`[&_p]:text-base`): the prose elements carry their own size classes, so a parent utility wins only by specificity inside Tailwind's utilities layer; unlayered CSS outranks every layered utility regardless. Diagnosis of the 2026-09-24 "size change didn't apply": the utility never reached the stylesheet — the dev build was failing on a syntax error in `content-splitter-core.ts` (the console listed it), so Turbopack kept serving the previous CSS; with a healthy build the same class applied (probe re-run 2026-09-25: 14px → 16px). Rule for UI checks: read the console for compile errors before trusting a computed style — a failing build serves stale CSS silently.

## Previews and titles

- **Heading anchors** (the hover "#" after each heading) link to a section, so they exist only where the section is on screen: the inline level never renders them; a standard/full preview context passes `headingAnchors={false}` (or wraps in `HeadingAnchorsProvider value={false}`, `components/markdown-core/heading-anchors-context.ts`). Guard: `__tests__/heading-anchors-in-previews.test.tsx`.
- **Titles derived from content** go through ONE plain-text projection, `components/markdown-core/plain-title.ts` (`plainTitleFromMarkdown`); stored titles that still carry syntax display clean via `displayTitle` / `withDisplayTitle` at the service read boundary (flashcard sets, assessments, study media) — storage is not rewritten. Guard: `components/markdown-core/__tests__/plain-title.test.ts`.

## Build-graph rule

Inside the chat engine (`components/mardown-display/**`), import `RichContentInline` or `NestedRichContent` directly — never the `RichContent` router, whose standard/full edges would stack a boundary under `MarkdownStream` (code-splitting skill, rules 2–3).

## Not yet here

- The org-level knob for `depthCap` (today a prop/provider default).
- `/f/[formId]` form text (intro, question help, thank-you body) is rendered inside `@ai-matrx/records-ui` `FormRunner` as plain text — needs a `renderText` seam in the package and a package release.
- Card previews inside a link (creator tool cards, `ExamCuratedLibrary` guide summaries) stay plain: an inline markdown link would nest an anchor. Needs an inline option that renders links as text.
- `/canvas/shared/[token]` is client-fetched and `ssr:false` (kind renderers), out of this level's reach.

## Change log

- 2026-09-25 — RC-B2 fixes: nested-render identity guard + tag-fragment text, same-name section balance, nested stream holdback; heading anchors off in previews; one plain-text title projection (paste titles, note auto-labels, task seeds, observation labels, podcast/document names) + display projection of stored titles.
- 2026-09-25 — `variant="reading"`; static inline leaf; remaining public text converted (sign document, booking intro, education hero/section strings, class descriptions, resource descriptions).
- 2026-09-25 — server level (RC-B2b): `RichContentServer`, shared presets / element maps / splitter core, parity guard, learn + creator pages converted; shared nested-fence vectors with aidream.
- 2026-09-24 — created (RC-B2): levels, nested rendering, nested-fence rule, first surfaces (CardFaceContent, QuestionView, StudyGuideReader key terms, AnalysisCard preview, MemoryAidBlock).
