# Adding a New Block Pattern

Authoritative checklist for introducing a new renderable block in the streaming + markdown pipeline. Only files that actually matter are listed.

Pick the **flavor** that matches the new block, then follow that section.

---

## Flavor A — Server-driven `render_block` event

Python emits a `render_block` event. No raw markdown pattern is parsed on the client; `block.serverData` (Python's `data` field) carries everything.

**Python team owns the type contract.** After they ship, `types/python-generated/stream-events.ts` regenerates and the new case lights up client-side.

Client changes (you):

1. **`block-registry/BlockRenderer.tsx`** — add a `case "<type>":` in the main switch. Read from `block.serverData`. If the component has a streaming skeleton, guard with `isBlockLoading(block)` and render `LoadingComponents.<X>`. If the block should respect `hideReasoning` / `hideToolResults`, add the gating at the top of the case (see `thinking`, `tool` cases).
2. **`block-registry/BlockComponentRegistry.tsx`** — `const X = lazy(...)` + an entry under `BlockComponents`. Add a `LoadingComponents` entry only if there's a streaming skeleton.
3. **`components/mardown-display/blocks/<name>/<Name>Block.tsx`** — the component itself. Props consume the (snake_case) fields Python sends.

Ping Python team (block the merge until they've shipped):

- Add `<Type>RenderBlock` to `TypedRenderBlock` in `stream-events.ts` (auto-generated — they add on the Python side, you regen).
- Until they ship, temporarily declare the interface in **`types/python-generated/missing-types.ts`** under `ServerOnlyRenderBlock`. Delete that temp entry as soon as regen picks it up.

Round-trip to DB (only if the block needs to survive reload from `cx_message.content`):

- **`features/agents/redux/execution-system/utils/assemble-cx-content-blocks.ts`**
  - If it's a media payload (url + mime_type), add the type string to `MEDIA_BLOCK_TYPES`.
  - Otherwise, if the block has a meaningful markdown form to reconstruct, extend the `reconstructBlockMarkdown` switch. Fall-through returns `content` which is fine for most server-driven blocks (they replay via `render_block`, not via markdown re-parsing).

---

## Flavor B — Client XML-tag block (e.g. `<thinking>`, `<flashcards>`, `<timeline>`)

Pattern: simple `<tag>...</tag>` wrapper with no attributes. Splitter extracts, renderer consumes `block.content` (and optionally a client-side parser).

1. **`components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts`**
   - Add the tag to the `XML_TAG_BLOCKS` registry (`{ <type>: ["<tag>"] }`).
2. **`block-registry/BlockRenderer.tsx`** — add a `case "<type>":`. Prefer the server-data-first pattern: render from `block.serverData` if present, else parse `block.content` via a dynamic-imported parser (see `case "cooking_recipe"` / `case "timeline"` for the canonical shape).
3. **`block-registry/BlockComponentRegistry.tsx`** — lazy entry + `BlockComponents` entry. Add `LoadingComponents.<X>` if you want a streaming skeleton.
4. **`components/mardown-display/blocks/<name>/`** — the component + optional `parse<Name>Markdown.ts` parser file.
5. **DB round-trip** — `assemble-cx-content-blocks.ts::reconstructBlockMarkdown`: add the type to the `case "task": case "database": ...` group so it gets wrapped as `<type>\ncontent\n</type>` on replay.

Ping Python team:

- If Python will also emit this as `render_block`, they add the matching `TypedRenderBlock` interface. If purely client-only, no Python work — but add a stub entry to `missing-types.ts` under `ClientOnlyRenderBlock` so the splitter's union type accepts it.

---

## Flavor C — Client XML-tag block with attributes (e.g. `<decision prompt="...">`, `<artifact title="...">`)

Same as Flavor B, but the opener carries `key="value"` attrs parsed into `metadata`.

1. **`content-splitter-v2.ts`** — add the type string to the `ATTRIBUTE_XML_BLOCKS` array. Attributes are auto-extracted by `parseXmlAttributes`.
2. **`BlockRenderer.tsx`** — `case "<type>":` reads `block.metadata?.<attr>` and `block.content`.
3. **`BlockComponentRegistry.tsx`** — lazy entry.
4. **`components/mardown-display/blocks/<name>/`** — component.
5. **DB round-trip** — `reconstructBlockMarkdown`: add a `case "<type>":` in the same group as `artifact`/`decision` so attrs are serialized back into the opening tag.

Python team: same rule as Flavor B.

---

## Flavor D — JSON in a code fence (e.g. `quiz`, `presentation`, `diagram`, `decision_tree`)

Pattern: triple-backtick `json` fence whose top-level key identifies the block (`{"quiz_title": ...}` → quiz).

1. **`content-splitter-v2.ts`**
   - Add a pattern to `JSON_BLOCK_PATTERNS` with `rootKey` (the top-level JSON key) and a `validate(parsed)` predicate.
   - `detectJsonBlockType` picks it up automatically.
   - If it needs special streaming-completion heuristics, extend `validateJsonBlock`.
2. **`BlockRenderer.tsx`** — `case "<type>":` with the canonical three-tier shape: prefer `block.serverData`, else `isBlockLoading` → show `LoadingComponents.<X>`, else `safeJsonParse(block.content)` and render, else `renderFallbackContent(block.content)`.
3. **`BlockComponentRegistry.tsx`** — lazy `BlockComponents` entry + `LoadingComponents.<X>` entry (streaming JSON needs a skeleton).
4. **`components/mardown-display/blocks/<name>/`** — component + optional `parse<Name>JSON.ts`.
5. **`block-registry/json-parse-utils.ts`** — only if you introduce a new shared JSON-parse helper. `safeJsonParse` already handles LaTeX-aware JSON.
6. **DB round-trip** — generic ` ```json … ``` ` reconstruction in `reconstructBlockMarkdown` is usually enough; override with a dedicated `case` only if the canonical markdown must differ.

Python team: same rule as Flavor B.

---

## Flavor E — Code fence with special language (e.g. `yaml`, `csv`, `toml`, `markdown`)

Block stays `type: "code"`; only the `language` changes the renderer branch.

1. **No splitter changes.** The splitter emits `{ type: "code", language }`.
2. **`BlockRenderer.tsx`** — extend the `case "code":` block: add a `if (lang === "<lang>") return <YourBlock ... />`.
3. **`BlockComponentRegistry.tsx`** — lazy entry + `BlockComponents` entry.
4. **`components/mardown-display/blocks/<name>/`** — component.

No Python work, no `missing-types.ts`, no DB round-trip work — `code` is already handled.

---

## Flavor F — Code fence remapped to a non-`code` type (e.g. ` ```transcript `, ` ```tasks `, ` ```questionnaire `, ` ```mermaid `)

Like Flavor E, but the block emerges with a different `type` so it flows through its own renderer branch. **` ```mermaid ` is the fullest worked example** (server + client detection, an alias, live progressive rendering, materialization, an editor) — read its diff before adding the next render-block skill.

1. **`content-splitter-v2.ts`** — add the language to the `SPECIAL_CODE_LANGUAGES` array. (Optional) add a fence alias to `CODE_LANGUAGE_ALIASES` (e.g. `mmd → mermaid`) and normalize with `normalizeCodeLanguage` before the membership test — both are exported and mirrored in aidream `block_detector.py`.
2. **`BlockRenderer.tsx`** — `case "<type>":`.
3. **`BlockComponentRegistry.tsx`** — lazy entry.
4. **`components/mardown-display/blocks/<name>/`** — component + optional parser.
5. **DB round-trip** — add a `case "<type>":` in `reconstructBlockMarkdown` that wraps back as ` ```<type>\n…\n``` ` (a fence — NOT the `<type>…</type>` XML default, which corrupts fence-promoted blocks).
6. **(Optional) live promotion** — to render progressively *during* streaming, promote the fence at open-time in `stream-block-accumulator.ts` (the code-fence branch) instead of only at close. Mermaid is the first non-JSON type to do this.
7. **Server side (do this FIRST when server emits it):** aidream `block_detector.py` `SPECIAL_CODE_LANGUAGES` (+ `CODE_LANGUAGE_ALIASES`), a Pydantic model + forgiving parser, `stream_processor.py` classification set + parser map, `render_blocks.py` registry (3 entries), then `pnpm sync-types:fast` so `TypedRenderBlock` gains the type. Landing the server first means no temp `missing-types.ts` entry.

Python team: if the block is ever emitted server-side as a `render_block`, they add the matching TypedRenderBlock (step 7).

---

## Flavor G — Pure client-only text pattern (no tag, no fence — e.g. `tree`, `accent-divider`, `heavy-divider`)

Regex/structural detection directly in the splitter.

1. **`content-splitter-v2.ts`** — add a detector (new step in `splitContentIntoBlocksV2`) that pushes `{ type: "<type>", content }`.
2. **`types/python-generated/missing-types.ts`** — add a `<Type>RenderBlock` interface under `ClientOnlyRenderBlock` (and into the `ClientOnlyRenderBlock` union). This keeps the splitter's union type happy.
3. **`BlockRenderer.tsx`** — `case "<type>":`. If rendering is trivial (e.g. a divider), inline the JSX; otherwise delegate to a component.
4. **`BlockComponentRegistry.tsx`** — entry only if the renderer delegates to a component.

No Python work. No DB round-trip work (the raw pattern survives in the text chunk).

---

## Files that never need changes for a new block

Do not touch these — they're either generic passthroughs or unrelated:

- `components/MarkdownStream.tsx` + `components/MarkdownStreamImpl.tsx` — entry shell, no block logic.
- `chat-markdown/StreamAwareChatMarkdown.tsx` — stringly-typed `render_block` handler; no per-type branching.
- `chat-markdown/EnhancedChatMarkdown.tsx::renderBlockToContentBlock` — generic normalizer; no per-type branching. Only touch if you need special post-processing like reasoning consolidation.
- `chat-markdown/BlockRenderingContext.tsx` — only affects blocks that use `serverData` in strict mode.
- `features/agents/redux/execution-system/active-requests/active-requests.slice.ts::upsertRenderBlock` — keyed by `blockId`, generic.
- `features/agents/redux/execution-system/thunks/process-stream.ts` — generic fan-out to `upsertRenderBlock`.
- `features/agents/redux/execution-system/active-requests/active-requests.selectors.ts::selectUnifiedSlots` — ordering only matters for new event kinds, not new block types.
- `lib/chat-protocol/from-stream.ts::buildCanonicalBlocks` — canonical text/tool segments; `render_block` is deliberately not folded in.

---

## Python contract reminder

- `types/python-generated/stream-events.ts` is **auto-generated**. Never hand-edit. For any server-emitted block, the Python team owns the source — notify them, they regen.
- While waiting on Python, declare a temp interface in `types/python-generated/missing-types.ts` (under `ServerOnlyRenderBlock` for server-driven, `ClientOnlyRenderBlock` for client-only). Delete the temp entry once regen lands.
- Python sends `snake_case`. Components want `camelCase`. The `BlockRenderer` case is where the remap happens (see the `// TODO(python): rename x → y` comments on existing cases). Leave the TODO and move on — a later sweep renames on the Python side.

---

## Quick decision tree

```
Is the block emitted by Python as a render_block event?
├── YES → Flavor A (server-driven). Notify Python team. Client: BlockRenderer + Registry.
└── NO → parsed from raw markdown by the client splitter.
    │
    ├── Triggered by a <tag>?
    │   ├── Tag has attributes → Flavor C
    │   └── Plain tag → Flavor B
    │
    ├── Triggered by a ```fence?
    │   ├── Fence language is json + root key match → Flavor D
    │   ├── Special language, stays as `code` with branch → Flavor E
    │   └── Special language, remapped to own type → Flavor F
    │
    └── Neither tag nor fence (structural pattern) → Flavor G
```

---

## Minimum file count per flavor

| Flavor | Files touched (min) |
|--------|---------------------|
| A — server render_block | 2 client (`BlockRenderer`, `BlockComponentRegistry`) + 1 Python-side |
| B — plain XML tag | 3 (`content-splitter-v2`, `BlockRenderer`, `BlockComponentRegistry`) + `assemble-cx-content-blocks` if DB round-trip matters |
| C — attribute XML tag | Same as B |
| D — JSON fence | 3 (`content-splitter-v2`, `BlockRenderer`, `BlockComponentRegistry`) |
| E — code language branch | 2 (`BlockRenderer`, `BlockComponentRegistry`) |
| F — code language remapped | 3 (`content-splitter-v2`, `BlockRenderer`, `BlockComponentRegistry`) + `assemble-cx-content-blocks` |
| G — pure client pattern | 3 (`content-splitter-v2`, `missing-types`, `BlockRenderer`) + `BlockComponentRegistry` if non-trivial |

Always remember to create the component itself under `components/mardown-display/blocks/<name>/`.
