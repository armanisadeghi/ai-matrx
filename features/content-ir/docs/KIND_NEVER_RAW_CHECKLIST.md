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
- [x] C4. Bottom-layer refusal: the JSON code card, code block, plain markdown renderers, JSON tree viewer and
      the generic value grid each run the detector themselves and render the kind (or its loader) when handed
      kind data, and report the caller to the Error Inspector.
      PARTIAL (2026-09-30): markdown leaves (`KindTextGate`), value grid (`ResultValue`/`KeyValueGrid`/`ResultJson`
      via `KindValueNode`), JSON viewers (`JsonInspector`/`JsonTreeViewer`/`RawJsonExplorer`/`JsonViewer` via
      `KindDataGate`, `showSource` for deliberate raw views) and the settled `JsonBlock` all refuse and report
      (`report-kind-at-raw-renderer.ts`). The plain `CodeBlock` (json/jsonc/json5/unlabelled, settled) refuses too;
      source-view callers (editors, diffs, artifact/canvas source) pass `showSource`. `KindDataGate` loop-guards.
- [x] C5. One value renderer for every non-stream surface, routing `__kind` at any depth.
      Bottom layer: every raw renderer above routes kind data through `AnswerValueView` (text through
      `MarkdownStream`), nested kinds at any depth; surfaces above it are their own items.

## A. Live stream

- [x] A1. ```json one-line kind → raw until fence close.
- [x] A2. `__kind` not first key, or after 300 chars → raw until reached.
- [x] A3. ```jsonc / ```json5 / fence with no language → raw for the whole stream (parser never opens).
      Mid-stream now held by the renderer's first-key gate. Still open: jsonc WITH comments never parses at close.
- [x] A4. `~~~json` fences → only work by accident; stray empty code blocks left behind.
      `~~~` is a real fence in the prefilter, accumulator (FenceReader closer) and static splitter.
- [x] A5. Kind object on the same line as prose → raw until stream end.
      Split live the moment `__kind` is visible (fragment) or the line completes; reload trims prose pieces the same way.
- [x] A6. Array of kinds → raw mid-stream; leftover `[` `,` `]` render as tiny JSON cards after.
      Bare: each element is its own live region (`kind_array` substate, held until the first key). Fenced: the
      first-key gate holds a kindless/errored envelope. `[` `,` `]` are `chrome` pieces, never blocks (both hosts).
- [x] A7. Kind nested inside a non-kind object → whole region should show as could-be-kind; wrapper
      fragments left broken after recovery. Mid-stream the first-key gate already held (now guarded); after
      recovery a JSON wrapper splits into its kinds + ONE `residual` piece (its data, kinds removed, valid JSON).
- [x] A8. Kind inside a simple XML tag → rescued only at tag close.
      A JSON object in a simple section leaves it the moment `__kind` is visible (line or fragment) and the
      section resumes after it; recovered section pieces are trimmed on both hosts so live = reload.
- [x] A9. Transport drop mid-fence (no `finalize`) → block stuck `streaming` forever.
      `processStream` finalizes on every exit: the commit path, an unexpected throw, and a retained processor
      discarded without a rejoin (`dispose`). Only the live hand-off to a rejoin keeps the region open.
- [x] A10. Fence closes on truncated/invalid JSON with `__kind` → should be the kind's broken state, not raw.
      Kind-preserving breaks already routed. A break BEFORE `__kind` (kindless error envelope, or none) now
      settles as that kind with `kindState: "raw"` (`settleBrokenKindRoute`) — the broken-instance floor.
- [x] A11. Cold registry at stream end → raw until the registry repaints.
      `@ai-matrx/content-ir-react` 0.13.0: settling and a single-kind answer repaint every waiting kind. Host: an
      identified kind still `code` after the route is its loader while the block streams or the registry is cold.
- [x] A12. Static splitter: ```JSON (capital) gets no envelope (`content-splitter-core.ts` case-sensitive check).

## B. Rendering-layer fallbacks

- [x] B1. Kind component crash → JSON code block fallback (`BlockFallback.tsx`).
      A crashed kind now falls to `StructuredValueView` with its kind ("its view hit an error").
- [x] B2. Unregistered block type → `UnknownDataEventBlock` prints JSON.
      A payload carrying `__kind` renders through `AnswerValueView`; kindless keeps the catch-all card.
- [x] B3. Nested search/rank/rag/scraper/seo-ruling helpers drop to the JSON card when the route declines.
      Closed at the leaf: `renderJsonFallback` → `JsonBlock` now draws a settled kind through `AnswerValueView`
      (a loop back to the same value keeps the code card).
- [ ] B4. `AgentResultBlock` turns unparseable / nested output into a ```json fence.
- [x] B5. "Show data" toggles on workflow-step, function, fetch, search, categorization result blocks. (→ `data-events/ToggledDataBody`: a payload carrying `__kind` at any depth → `AnswerValueView`; kindless stays JSON)
- [x] B6. Invalid-payload fallbacks on decision-answers, list-change-proposal, map-topic-proposal blocks. (→ alert heading over `StructuredValueView` with the kind + "could not be read"; raw data behind its explicit toggle)
- [x] B7. `MarkdownStream`'s top-level error boundary (and EnhancedChatMarkdown's give-up path) fall to `PlainTextFallback`, which printed kind JSON raw. (→ each kind region through `KindInstanceRender` inside its own error boundary, then `kindTextToMarkdown`; truncated kind → "<Kind> could not be read"; kindless stays plain. Guard: `internal-handlers/__tests__/plain-text-fallback-never-raw.test.tsx`)

## C. Saved messages and Redux

- [ ] R1. Answer-text selectors hand `{"__kind":…}` as plain text to consumers (`extractFlatText`,
      `selectAnswerText`, `selectLatestAnswerText`, `selectResultText`, `selectLatestAccumulatedText`).
      PARTIAL — selectors stay faithful to stored data by design (`__kind` is data; thunks/JSON parsers/scopes
      read them). Display/export consumers fixed: rich-document actions + copy, conversation export, hover
      preview, Pro text actions, agent toast, AI code editor. Audited one by one: agent-app — shells render
      `response` through `MarkdownStream`; the public renderer's copy now converts (`kindTextToMarkdown`);
      `AgentAppSurfaceRuntime` feeds the workspace SCOPE (machine, kept). Run scope (`useAgentRunSurfaceScope`,
      `agent-run-history-scope`) and the model-battle scope are agent context (kept). Comparison
      `battleMarkdown` → people get `battleMarkdownForPeople` (copy + .md export) and the CSV/sheet answer cell is the kind's
      markdown (full answer, like every kindless cell beside it — a title alone would say less); the agent payload
      keeps the data. Agent-app "Open in canvas": see S5. Code editor readers of `selectLatestAccumulatedText`:
      `ContextAwareCodeEditorCompact`/`Modal` only feed `parseCodeEdits` (machine, kept); `useAICodeEditor` →
      `rawAIResponse` shows in the Response tab / `ReviewStage` (`MarkdownStream`, fine) and in the parse-failure
      panel (`ErrorPanel`, `AICodeEditor`) — a kind there now draws through `AnswerValueView`. Also audited:
      `useToolComponentAgent` (displays via `MarkdownStream`; the MCP preview's "Generated code" `<pre>` is a
      deliberate source view of generated CODE meant for the Edit Code tab — kept), `useProposePack` (machine:
      `parseProposal` — kept), `SystemPromptOptimizer` (display `MarkdownStream`; accept/copy/diff write a
      SYSTEM PROMPT, which legitimately carries kind JSON examples — kept raw), `AgentGenerator` (display
      `MarkdownStream`; "Copy raw" is an explicit raw control — kept), `AgentExecutionTestModal` (direct and
      inline panes printed a `<pre>` → now `AnswerValueView`; copy and inline Replace keep the raw text the
      harness is proving).
      FINAL SWEEP (every reader of the answer-text selectors, 2026-09-30) — fixed: voice relay speech
      (`speakDelivery` gets the markdown), meeting agenda draft (`MeetingFormDialog` writes the markdown),
      official-candidate transcription cleanup field (`answerFieldText`), markdown-studio lab picker label.
      Display already canonical: `AgentAssistantMessage`/`AgentUserMessage` (MarkdownStream; action bars go
      through `contentForDestination`), `CollabNoteMessage` (BasicMarkdownContent — C4 layer). Machine/data,
      kept raw: execution thunks, message-crud, citations, wire transcript, `ChatConversationSurface` +
      `chatTranscriptScope` (scope/edit resolution), display-group/answerless predicates, instant-analysis
      hooks (JSON extraction), podcast source resolvers, page-image prompt, binding-suggestions length,
      transcript-studio reattach, `ChatHistoryWindow` scope. Deliberate raw/debug views, kept: transcript
      integrity report copy, `AgentExecutionDebugPanel`, `AgentDebugWindow`, `ExecutionInstanceInspector`.
- [ ] R2. `selectAnswerDocumentText` / `selectLatestAnswerDocumentText` stringify kinds on purpose.
      PARTIAL — kept (stored/passed text). Its display reader, the cleanup pad, previews through `MarkdownStream`;
      transcript studio reattach is a data path.
- [ ] R3. `extractInspectableText` pretty-prints the content array → action bar, dialogs, full-screen editor.
      PARTIAL: the action bar and its dialogs send through `contentForDestination` (O1); the message hover
      preview converts with `kindTextToMarkdown`. The full-screen editor is the explicit edit-of-source view
      (only "Open in full-screen editor" sets `_editingInPlace: "expanded"`) — left on purpose.
- [x] R4. Pencil "edit answer" opens raw JSON. Deliberate edit-of-source view, kept: `InPlaceAnswerEditor`
      mounts only when the edit action's explicit click sets `_editingInPlace` (`handlers/edit.ts`,
      `handlers/fullscreen-editor.ts` are the only writers); a structured payload opens the read-only raw viewer.
- [x] R5. "Started with" strip prints object variables as JSON (`variableValueToInputText`). A variable whose
      value (object, or string of JSON) carries `__kind` renders through `AnswerValueView` in
      `UserMessageVariables`. `variableValueToInputText` itself feeds text INPUTS (lossless edit) — unchanged.

## D. Tool calls

- [x] T1. Generic tool renderer (`ResultValue`) never routes kinds → grid / raw JSON tree.
      `detectResultShape` → `kindInstance`/`kindList`; `ResultValue` routes them via `KindValueNode`.
- [x] T2. Reloaded tool call with only `output_preview` → unparseable raw text. (→ `previewResult`: whole JSON parses; truncated kind JSON → "<Kind> · full output not saved")
- [x] T3. Sub-agent call results; collaboration cards on plain markdown. (settled answers → `AnswerValueView` via `readAgentCallAnswer`; live child output → `MarkdownStream requestId agentCallId`: `selectAgentCallChildSlots` feeds the child's own render blocks — the `sub_agent` op's range in the parent request — to the normal BlockRenderer path; `selectUnifiedSlots` still drops them from the transcript, D209. Guard: `chat-markdown/__tests__/agent-call-child-renders-through-the-engine.test.tsx`)
- [x] T4. Search / research / scrape / random-wheel / SQL renderers on plain markdown.
      Closed at the leaf: `BasicMarkdownContent` hands `__kind` text to `MarkdownStream` (`KindTextGate`).
- [x] T5. Shared public conversation tool steps. (truncated `output_preview` → `previewResult`; the cards themselves are the chat's, so T1 covers the rest)

## E. Workflows

- [x] W1. Run board emissions call `DbEmitRenderer` directly, skipping the kind route. (→ `EmissionRender`)
- [x] W2. Seven bakeoff run-page variants do the same. (→ `EmissionRender`; guard `kind-emissions/__tests__/emissions-route-through-the-kind-door.test.tsx`)
- [x] W3. `SettledOutputBody` sends `__kind` output to the generic grid when no output kind is declared. (→ `AnswerValueView` by the value's own `__kind`; truncated kind text → json region)
- [x] W4. `StructuredValueView` strips nested kinds instead of rendering them.
      Only the root marker is dropped; a nested kind routes to its component (`KindValueNode`).
- [x] W5. Readout summary table prints 80 chars of stringified output. (→ `invocation-summary.ts`: kind name · instance title)
- [x] W6. `EmissionRender` routed only on the wire `kind`: a payload with its own root `__kind` (wire kind empty) or a nested kind fell to the generic emit body. (→ `routeEmission` reads the payload's `__kind`; nested kind with no `component_ref` → `AnswerValueView`)

## F. Screens rendering answer text outside the pipeline

- [x] S1. Pro textarea / pro input AI actions (popover, diff, write-back). Popover draws `result` through
      `AnswerValueView`; apply / compare / copy / Help-with-this write-back (`agentRunResult`) use the
      markdown conversion (`resultText`) — every target is human prose.
- [x] S2. Transcript cleanup pad edit mode. No change: the preview is `MarkdownStream`; the textarea is reached
      only by the explicit "Edit text" toggle (`CleanupOutput`) and edits the stored source text.
- [x] S3. Toast overlay answers (raw text, reasoning included). Collapsed line now `AnswerTextPreview`
      (complete kind → markdown, arriving kind → its loader line while the caller's `streaming` is true, then a
      one-line broken state "<Kind> did not finish"); expanded view was already `AgentRunner`.
- [x] S4. AI code editor message list. `AnswerTextPreview` for text + stream, `AnswerValueView` for structured.
- [x] S5. Fully custom agent-app shells. `response` into compiled app code is the app contract (left); the result
      bar's human copy converts with `kindTextToMarkdown`; `DefaultFallback` was already `MarkdownStream`. "Open in
      canvas" (custom shell + public renderer) goes through ONE door, `useOpenAppResponseInCanvas`: a kind answer
      opens as its kind (`detectKindInJsonText` → artifact canvas type, bound via `useOpenArtifactInCanvas` when
      the message is persisted, else the kind's canvas type over its value); a kind with no canvas type opens as
      its markdown; kindless stays the HTML canvas. The unbound (guest) open announces itself:
      toast "Opened as a preview — not saved".
- [x] S6. "Ask about this meeting". Answer drawn through `AnswerValueView` (no unit test — workspace too heavy).
- [x] S7. Assignments demo. Output text and input values through `AnswerValueView` (no unit test).
- [ ] S8. Research review/repair page. Already `BasicMarkdownContent` — left to the bottom-layer lane (C4).
- [x] S9. Assist cards. Suspense fallback now `AnswerTextPreview`; the body is `BasicMarkdownContent` (C4 lane).
- [x] S10. Scheduled-run results. Summary via `kindTextPreview`; kind-carrying result metadata via `AnswerValueView`.
- [ ] S11. Vision interview live turn card. Already `BasicMarkdownContent` — left to the bottom-layer lane (C4).
- [x] S12. Old AI chat dialogs (flashcards, strategy brief) on `MarkdownRenderer`.
      Closed at the leaf: `MarkdownRenderer` hands `__kind` text to `MarkdownStream` (`KindTextGate`).
- [x] S13. Voice agent transcript. Assistant turns via `kindTextPreview` (spoken text; a kind is never read out).

## G. Window panels

- [x] P1. Extraction cell editor window shows AI-extracted values in a raw JSON viewer.
      Closed at the viewer: `JsonViewer` draws kind data through `AnswerValueView` (`KindDataGate`).

## H. Answers sent elsewhere

- [x] O1. Every save/send action (`contentForDestination`) passes raw kind JSON into notes, tasks, flashcards,
      files, PDF, Word, Google Doc, print, email, speech, conversation export — convert with
      `genericKindMarkdown` instead. Done through ONE helper, `kindTextToMarkdown`
      (`features/content-ir/surfaces/kind-text-to-markdown.ts`: whole-text, fenced and bare kind regions →
      `kindValueToMarkdown`), applied in `contentForDestination`, "Copy with thinking", conversation transfer
      and `documentMarkdown`. A kind with no `toMarkdown` facet now exports `genericKindMarkdown`'s READABLE
      fallback (instance-title heading, bold-label scalars, uniform arrays as tables, nested lists, nested
      kinds through `kindValueToMarkdown`) — never the `__kind` key, never a JSON fence.
- [x] O2. Context values and context items show it raw. `ContextValueDisplay` (markdown / text with a kind →
      `AnswerValueView`; every `value_json` → `AnswerValueView`) and `GenericBody` (kind text or kind-carrying
      payload → `AnswerValueView`). A kind NESTED in a kindless payload reaches `StructuredValueView`, which
      the bottom-layer lane (C4/C5/W4) is making route nested kinds. Kindless markdown stays on
      `BasicMarkdownContent` (bottom layer).

## I. Public pages and other features

- [x] U1. Shared conversations / shared notes / public resource pages use the `standard` level, which renders
      kinds as JSON fences by design. (→ `StandardBlock` runs the first-key rule on json/unlabelled fences and
      promoted blocks; a kind goes to `standard/StandardKindRegion` behind one React.lazy edge — loader while
      undecided, broken state + "View source" when unreadable. Covers the static/share path too, which hands
      engine blocks to `StandardBlock`. The kind body is client-only, so share-page HTML carries the loader.)
- [x] U2. Research synthesis truncates JSON at 20,000 chars. (→ `AnswerValueView`; consolidation too)
- [x] U3. Content-plan step rail and AI runs view. (kindless artifact + run result → `AnswerValueView`; the request/error sections stay raw on purpose)
- [x] U4. Transcript studio module column. (object payload → `AnswerValueView`; the explicit edit box keeps JSON text)
- [x] U5. Data-table cells and their cell editor. (display: json/array cell with `__kind` → `KindCellPeek` = the records kind chip, opens `structuredValueWindow`; unreadable kind text → "<Kind> · unreadable"; edit box keeps JSON on purpose — `EditableCell` gets its display from the viewer)

## Out of scope (deliberate raw views — keep)

Admin debug windows and panels, Error Inspector, tool overlay "Raw" tab, directive item "Raw" tab, text-sections
raw/split view, scraper JSON tabs, podcast run-truth inspector, research "show raw search result".
