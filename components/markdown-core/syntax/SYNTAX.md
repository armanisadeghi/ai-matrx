---
type: Reference
title: "Markdown core — extended syntax"
description: "Every construct the ONE markdown core renders beyond CommonMark/GFM, its grammar, where it is implemented, and how it degrades while streaming."
tags: [markdown, rich-content, syntax, directives, callouts, wikilinks]
timestamp: 2026-09-25
---

# Extended syntax (RC-B8)

Every GFM-based preset in `../markdown-core-presets.ts` carries this syntax, so every
`<RichContent>` level, the server level and every `MarkdownCore` caller renders it. Parse
extensions: remark-frontmatter (yaml+toml), remark-directive, remark-definition-list,
remark-gfm (`singleTilde: false`), remark-math + KaTeX (mhchem registered). Transform:
`remark-matrx-syntax.ts` (+ remark-gemoji), `rehype-slug` + `rehype-matrx-syntax.ts`.
Elements: `elements/core-syntax-elements.tsx`, merged UNDER every caller's element map.

| Construct | Grammar | Notes |
|---|---|---|
| Callout (9 types: note tip important warning caution info success question quote + aliases) | `> [!NOTE]`, `> [!tip]- Title` (fold closed) / `+` (open), `!!! warning "Title"` / `??? x` / `???+ x` (MkDocs), `:::note[Title]{fold}`, `:::note Title` (Docusaurus) | ONE component: `containers.ts` `calloutNode` + `CalloutIcon`. Unknown `[!word]` stays a quote. |
| Front matter | `---` YAML / `+++` TOML at the very top | Hidden; `extractFrontmatter` / `useDocumentProperties` / `DocumentPropertiesPanel` expose it. `preprocessProse` passes it byte for byte. |
| Wikilink / embed | `[[Page]]`, `[[Page\|alias]]`, `[[Page#Heading]]`, `[[note:<uuid>]]`, `![[Page]]` | Resolved through `searchCandidatesAcrossTokens` + registry `hrefFor` (lazy `wikilink-resolver.ts`). Missing → dashed name + "Create" (creates a note via `createEntityRow`). Standalone embed of a note renders its body (NestedRichContent, depth-capped); inline embed is a compact reference. |
| Directives | `:::name[label]{#id .cls k=v}` … `:::`; leaf `::name`; text `:name[text]{…}` | Known: details, columns/column, tabs/tab, figure, table, aside, toc; text: span, mark, kbd, abbr, sup, sub. Unknown container → neutral div; unknown text/leaf → restored literally ("3:2", "10:30" never lose a colon). |
| Text colour | `:span[text]{color=danger}`, `:mark[text]{color=green}` (`bg=` too) | Semantic names only (red orange amber yellow green teal blue indigo purple pink gray muted primary success warning danger info); hex ignored. |
| Definition list | `Term` / `: definition` | remark-definition-list → dl/dt/dd |
| Super/subscript, highlight | `x^2^`, `H~2~O`, `==text==` | Pandoc rule: no whitespace inside. `~~x~~` is strikethrough. |
| Emoji | `:fire:` | gemoji names only. |
| Heading ids + anchors | auto (rehype-slug) or `## Title {#sec:id}` | A hover/focus `#` anchor; in-doc links scroll within the NEAREST document (`InDocAnchor`). |
| Table of contents | print grammar `isTocLine` (`[[toc]]` canonical, `[toc]`, `${toc}`, `<!-- toc -->`, `\tableofcontents`) + `::toc` / `:::toc` | Static from the block; re-reads the whole `[data-matrx-doc-root]` in the browser. |
| Captions + cross-references | `:::figure[Caption]{#fig:id}`, `:::table[Caption]{#tbl:id}`, `\label{eq:id}` in display math, `## H {#sec:id}`; refs `@fig:id` `@tbl:id` `@eq:id` `@sec:id` `\eqref{eq:id}` `\ref{id}` | Numbered per rendered block ("Figure 1."); cross-block refs resolve at runtime (`CrossRef`); unresolved shows `@x:y?` flagged. |
| Math extras | `\ce{…}` (mhchem), `\tag{}`, `\label{}` → `\tag{n}` | katex pinned to one version (pnpm override) so mhchem registers on rehype-katex's instance. |
| Abbreviations | `*[PPE]: Personal protective equipment` | Definition line hidden; every whole-word use → `<abbr title>`. |
| Keys | `<kbd>Esc</kbd>`, `:kbd[Ctrl]` | Inline raw tag pairs now build real elements (`rehypeSafeRawHtml` `pairInlineTag`). |
| details/summary | raw `<details><summary>` or `:::details[Summary]` | Allow-listed; styled by `DetailsElement`. |
| CSV/TSV fence | ` ```csv ` / ` ```tsv ` | Sortable `CsvBlock` at every level (the engine already routed it). |
| Footnotes | GFM `[^1]` / `[^1]: …` | Hover preview + back-links; li ids survive the prose leaf; a note whose ref is in another block still renders and links. |
| Task lists | `- [ ]` / `- [x]` | Interactive ONLY under `MarkdownSourceEditProvider` (toggle = `toggleTaskInSource` → content-ir `spliceSave`); read-only state marks otherwise. |
| Page break | `@ai-matrx/print/directives` grammar | Unchanged; subtle "Page break" divider. |

**Streaming:** `stream-heal-syntax.ts` hides open front matter, a half-typed directive/callout/
admonition/abbreviation line, `[[Pag`, `[^1`, `:smi`, and closes `==text`. Guard:
`../__tests__/extended-syntax.test.tsx` (every prefix of a composite source).

**Editor islands:** `@ai-matrx/content-ir/source` marks `directive`, `callout`, `footnote_def`,
`wikilink` (inline) and TOML `front_matter` as islands (aidream 106bb72220).

**Known limits (open):** the chat engine's block splitter (content-splitter + its Python twin)
knows nothing about `:::` containers, so a fence/table/image INSIDE a container is expected to be
cut into its own block at the `standard`/`full` levels (e.g. tabs holding code fences) — not yet
measured; the fix is a container rule in both splitters. Figure/equation numbering restarts per
rendered block.
