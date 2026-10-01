# Kind never renders raw — the checklist

Owner: the session that opened this on 2026-09-30 (Arman's ruling, after a floating agent chat showed a
streaming `flashcard_set` as a raw ```json card). Work it top to bottom; delete nothing — tick it.

## The rule (Arman, 2026-09-30)

1. The moment it COULD be a kind → it displays as a kind (that kind's loader).
2. The moment we know WHICH kind → that kind's component.
3. The moment we know it is broken or not a kind → handled properly (the kind's broken state, or plain JSON).

"Could" is decided by the **first key**. Nothing raw shows before the first key has arrived. First key
`__kind`, or a `__kind` key anywhere at any time → kind. A complete first key that is anything else, with no
`__kind` seen → genuine JSON, and showing it as JSON is correct. Raw source of a kind is reachable only
through an explicit "view source" control.

**The one detector:** `features/content-ir/surfaces/json-kind-signal.ts` (`jsonKindSignal`, `hasKindKey`).
Every gate below calls it; nobody writes a second one.

**The guard:** `features/content-ir/__tests__/kind-never-raw-midstream.test.ts` streams payloads one
character at a time through the real accumulator and fails if any frame would draw the raw JSON card.
Every stream item below adds its case there.

## Core

- [x] C1. Live stream: a ```json fence body feeds the kind parser character by character, not line by line
      (one-line JSON never completed a line, so `__kind` was unseen until the fence closed).
- [x] C2. Live stream: ```JSON (any case) is treated as json at early and close detection.
- [x] C3. Renderer: the 300-character "kindless patience" is replaced by the first-key rule.
- [ ] C4. Bottom-layer refusal: the JSON code card, code block, plain markdown renderers, JSON tree viewer and
      the generic value grid each run the detector themselves and render the kind (or its loader) when handed
      kind data, and report the caller to the Error Inspector.
- [ ] C5. One value renderer for every non-stream surface, routing `__kind` at any depth.

## A. Live stream

- [x] A1. ```json one-line kind → raw until fence close.
- [x] A2. `__kind` not first key, or after 300 chars → raw until reached.
- [x] A3. ```jsonc / ```json5 / fence with no language → raw for the whole stream (parser never opens).
      Mid-stream now held by the renderer's first-key gate. Still open: jsonc WITH comments never parses at close.
- [x] A4. `~~~json` fences → only work by accident; stray empty code blocks left behind.
      `~~~` is a real fence in the prefilter, accumulator (FenceReader closer) and static splitter.
- [ ] A5. Kind object on the same line as prose → raw until stream end.
- [ ] A6. Array of kinds → raw mid-stream; leftover `[` `,` `]` render as tiny JSON cards after.
- [ ] A7. Kind nested inside a non-kind object → whole region should show as could-be-kind; wrapper
      fragments left broken after recovery.
- [ ] A8. Kind inside a simple XML tag → rescued only at tag close.
- [ ] A9. Transport drop mid-fence (no `finalize`) → block stuck `streaming` forever.
- [ ] A10. Fence closes on truncated/invalid JSON with `__kind` → should be the kind's broken state, not raw.
- [ ] A11. Cold registry at stream end → raw until the registry repaints.
- [x] A12. Static splitter: ```JSON (capital) gets no envelope (`content-splitter-core.ts` case-sensitive check).

## B. Rendering-layer fallbacks

- [ ] B1. Kind component crash → JSON code block fallback (`BlockFallback.tsx`).
- [ ] B2. Unregistered block type → `UnknownDataEventBlock` prints JSON.
- [ ] B3. Nested search/rank/rag/scraper/seo-ruling helpers drop to the JSON card when the route declines.
- [ ] B4. `AgentResultBlock` turns unparseable / nested output into a ```json fence.
- [ ] B5. "Show data" toggles on workflow-step, function, fetch, search, categorization result blocks.
- [ ] B6. Invalid-payload fallbacks on decision-answers, list-change-proposal, map-topic-proposal blocks.

## C. Saved messages and Redux

- [ ] R1. Answer-text selectors hand `{"__kind":…}` as plain text to consumers (`extractFlatText`,
      `selectAnswerText`, `selectLatestAnswerText`, `selectResultText`, `selectLatestAccumulatedText`).
- [ ] R2. `selectAnswerDocumentText` / `selectLatestAnswerDocumentText` stringify kinds on purpose.
- [ ] R3. `extractInspectableText` pretty-prints the content array → action bar, dialogs, full-screen editor.
      PARTIAL: the action bar and its dialogs send through `contentForDestination` (O1); the message hover
      preview converts with `kindTextToMarkdown`. The full-screen editor is the explicit edit-of-source view
      (only "Open in full-screen editor" sets `_editingInPlace: "expanded"`) — left on purpose.
- [x] R4. Pencil "edit answer" opens raw JSON. Deliberate edit-of-source view, kept: `InPlaceAnswerEditor`
      mounts only when the edit action's explicit click sets `_editingInPlace` (`handlers/edit.ts`,
      `handlers/fullscreen-editor.ts` are the only writers); a structured payload opens the read-only raw viewer.
- [ ] R5. "Started with" strip prints object variables as JSON (`variableValueToInputText`).

## D. Tool calls

- [ ] T1. Generic tool renderer (`ResultValue`) never routes kinds → grid / raw JSON tree.
- [x] T2. Reloaded tool call with only `output_preview` → unparseable raw text. (→ `previewResult`: whole JSON parses; truncated kind JSON → "<Kind> · full output not saved")
- [x] T3. Sub-agent call results; collaboration cards on plain markdown. (→ `AnswerValueView` for the child's answer; live child text → `MarkdownStream` content mode — the child has no request of its own, it streams inside the parent's)
- [x] T4. Search / research / scrape / random-wheel / SQL renderers on plain markdown.
      Closed at the leaf: `BasicMarkdownContent` hands `__kind` text to `MarkdownStream` (`KindTextGate`).
- [x] T5. Shared public conversation tool steps. (truncated `output_preview` → `previewResult`; the cards themselves are the chat's, so T1 covers the rest)

## E. Workflows

- [x] W1. Run board emissions call `DbEmitRenderer` directly, skipping the kind route. (→ `EmissionRender`)
- [x] W2. Seven bakeoff run-page variants do the same. (→ `EmissionRender`; guard `kind-emissions/__tests__/emissions-route-through-the-kind-door.test.tsx`)
- [x] W3. `SettledOutputBody` sends `__kind` output to the generic grid when no output kind is declared. (→ `AnswerValueView` by the value's own `__kind`; truncated kind text → json region)
- [ ] W4. `StructuredValueView` strips nested kinds instead of rendering them.
- [x] W5. Readout summary table prints 80 chars of stringified output. (→ `invocation-summary.ts`: kind name · instance title)

## F. Screens rendering answer text outside the pipeline

- [x] S1. Pro textarea / pro input AI actions (popover, diff, write-back). Popover draws `result` through
      `AnswerValueView`; apply / compare / copy / Help-with-this write-back (`agentRunResult`) use the
      markdown conversion (`resultText`) — every target is human prose.
- [x] S2. Transcript cleanup pad edit mode. No change: the preview is `MarkdownStream`; the textarea is reached
      only by the explicit "Edit text" toggle (`CleanupOutput`) and edits the stored source text.
- [x] S3. Toast overlay answers (raw text, reasoning included). Collapsed line now `AnswerTextPreview`
      (complete kind → markdown, arriving kind → its loader line); expanded view was already `AgentRunner`.
- [ ] S4. AI code editor message list.
- [ ] S5. Fully custom agent-app shells.
- [ ] S6. "Ask about this meeting".
- [ ] S7. Assignments demo.
- [ ] S8. Research review/repair page.
- [ ] S9. Assist cards.
- [ ] S10. Scheduled-run results.
- [ ] S11. Vision interview live turn card.
- [x] S12. Old AI chat dialogs (flashcards, strategy brief) on `MarkdownRenderer`.
      Closed at the leaf: `MarkdownRenderer` hands `__kind` text to `MarkdownStream` (`KindTextGate`).
- [ ] S13. Voice agent transcript.

## G. Window panels

- [ ] P1. Extraction cell editor window shows AI-extracted values in a raw JSON viewer.

## H. Answers sent elsewhere

- [x] O1. Every save/send action (`contentForDestination`) passes raw kind JSON into notes, tasks, flashcards,
      files, PDF, Word, Google Doc, print, email, speech, conversation export — convert with
      `genericKindMarkdown` instead. Done through ONE helper, `kindTextToMarkdown`
      (`features/content-ir/surfaces/kind-text-to-markdown.ts`: whole-text, fenced and bare kind regions →
      `kindValueToMarkdown`), applied in `contentForDestination`, "Copy with thinking", conversation transfer
      and `documentMarkdown`. A kind with no `toMarkdown` facet still exports `genericKindMarkdown`'s fenced
      JSON (the converter's zero-loss floor) — a facet per kind is the fix there.
- [ ] O2. Context values and context items show it raw.

## I. Public pages and other features

- [x] U1. Shared conversations / shared notes / public resource pages use the `standard` level, which renders
      kinds as JSON fences by design. (→ `StandardBlock` runs the first-key rule on json/unlabelled fences and
      promoted blocks; a kind goes to `standard/StandardKindRegion` behind one React.lazy edge — loader while
      undecided, broken state + "View source" when unreadable. Covers the static/share path too, which hands
      engine blocks to `StandardBlock`. The kind body is client-only, so share-page HTML carries the loader.)
- [x] U2. Research synthesis truncates JSON at 20,000 chars. (→ `AnswerValueView`; consolidation too)
- [x] U3. Content-plan step rail and AI runs view. (kindless artifact + run result → `AnswerValueView`; the request/error sections stay raw on purpose)
- [x] U4. Transcript studio module column. (object payload → `AnswerValueView`; the explicit edit box keeps JSON text)
- [ ] U5. Data-table cells and their cell editor.

## Out of scope (deliberate raw views — keep)

Admin debug windows and panels, Error Inspector, tool overlay "Raw" tab, directive item "Raw" tab, text-sections
raw/split view, scraper JSON tabs, podcast run-truth inspector, research "show raw search result".
