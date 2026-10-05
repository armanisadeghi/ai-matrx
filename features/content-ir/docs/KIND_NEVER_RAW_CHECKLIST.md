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
- [x] B4. `AgentResultBlock` turned unparseable / nested output into a ```json fence. (→ a kind nested in the payload goes to `AnswerValueView` (value); kind text that never parsed goes to `AnswerValueView` (text, broken state); the private depth-4 `carriesKind` is gone, `valueCarriesKind` is the one detector; kindless unparseable JSON keeps its fence. Guard `agent-result-nested-kind-routes-through-the-kind-door.test.tsx`)
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
- [x] S8. Research review/repair page (`RagReviewRepairWorkspace`). `BasicMarkdownContent` is gated by `KindTextGate`; verified with the page's exact props in `kind-text-gate.test.tsx`.
- [x] S9. Assist cards. Suspense fallback now `AnswerTextPreview`; the body is `BasicMarkdownContent` (C4 lane).
- [x] S10. Scheduled-run results. Summary via `kindTextPreview`; kind-carrying result metadata via `AnswerValueView`.
- [x] S11. Vision interview live turn card. `BasicMarkdownContent` is gated by `KindTextGate`; verified with the card's exact props (streaming, partial kind too) in `kind-text-gate.test.tsx`.
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

## J. Round 2 — verifier-confirmed leaks (2026-09-30)

**Ruling (owner, this round):** a kind inside an inline code span, or inside a fence whose language is not
json/jsonc/json5/unlabelled (```ts, ```xml, ```markdown …), is the model QUOTING SOURCE and stays as written.
Everywhere else — blockquote, list item, table cell, prose, 4-space indented block — it is data. ONE definition,
`quotedSourceRanges` (`json-kind-signal.ts`), read by the splitter, the accumulator and the leaf gate. This flips
the earlier "every fence is only an arrival container" rule for non-JSON fences (```python / ```text kinds are
no longer lifted; `embedded-kind-container-recovery.test.ts` updated).

- [x] V1. Kind fenced (or bare) inside a blockquote → drawn raw in chat, reload, public share, tool results.
      `surfaces/quoted-kind-lift.ts`: ONE chunk-invariant transform, run on every delta by the accumulator and on the
      whole text by the splitter. A quoted JSON-family fence, or quoted JSON whose first key says kind, loses its
      quote prefix: the quote before stays a quote, the region renders as its kind, the text after is a new quote.
      Quoted prose, kindless quoted JSON and quoted non-JSON fences are untouched. Guard `quoted-kind-lift.test.ts`
      + parity fixture. Known edge: a kind block lifted out of a quote has no verbatim source span, so an in-place
      code edit of THAT block (`replaceBlockContent`) cannot find it.
- [x] V2. Markdown leaves let a kind in prose / a table cell / a 4-space block through raw. `markdownCarriesKind` =
      a kind key outside quoted source; leaf and pipeline agree by construction (`leaf-and-pipeline-agree.test.ts`).
      A kind in a table cell is lifted out of the table (the table is split around it).
- [x] V3. Tool result string with prose before a kind → `<p>` raw. `detectResultShape` → markdown when
      `markdownCarriesKind` (`kind-never-raw-grid.test.tsx`).
- [x] V5. Frame judge ≠ BlockRenderer. `decideBlockRender` (BlockRenderer.tsx) is the one pure decision BlockRenderer
      renders from; `draws-raw-kind-json.ts` calls it with the MESSAGE's stream state and follows dispatch (JSON-family
      code = raw card, other languages = their renderer / quoted source, text = raw when it still holds a kind region).
      Leak it found: a settled block inside a streaming message got no terminal envelope (valid jsonc/json5/unlabelled
      kind drawn as the broken floor until the message ended) — `withTerminalEnvelope` honours `isStreamingBlock === false`.
      Guards `frame-judge-matches-renderer.test.ts`, midstream V5a; run-path/ShapeStreamTab judge every frame.
- [x] V6. `[{"x":1}, {"__kind` / `{"data":{"__kind` flashed raw before the colon. A trailing object key that has
      reached `"__k` (key position only) is undecided → loader. `_id`, `__type`, string values never flicker.
- [x] V7. `"\u005f_kind"` escaped key: `hasKindKey` / `firstKindSlug` / the first-key path read JSON escapes.
- [x] V8. Public canvas "Debug Info" dump → kind door (`KindValueFrontDoor`), debug only for kindless; kit
      `TablePreview` record cell → `KindCellPeek`.
- [x] V9. User cancel mid-kind: verified — an aborted reader is not handed to rejoin and `finalizeAccumulator` runs
      (midstream A9 describe). Workflow run page: the recorded real run judged frame by frame, never raw
      (`real-run-partial-kinds.test.ts`). Message edit: `saveAnswerEdit` writes text parts; the re-render is the static
      splitter (covered by V1/V2 parity) — no dedicated UI test.

## W. Writers — a human destination never receives raw kind JSON (2026-10-05)

Clipboard, file, CSV/XLSX/Sheet, notes, task, email, speech: the answer goes out as the kind's markdown
(`kindTextToMarkdown` for text, `kindValueToMarkdown` for a value). `__kind` stays in anything stored or handed to
a machine; explicit raw controls ("Copy JSON", the extraction "JSON" download, the agent/json copy flavors) stay raw.

- [x] W1. `PublicMessageOptionsMenu` (Copy text / Google Docs / reasoning / HTML preview / Copy HTML page / Save as file /
      Scratch / Notes / Tasks / Email / speech) converts the answer once at the top. Guard
      `public-menu-never-copies-raw-kind.test.tsx`.
- [x] W2. Scheduled runs: `runCsvRows` `result_summary` (CSV download and Google Sheet export). Guard `run-csv-never-raw-kind.test.ts`.
- [x] W3. Page extraction exports: `cellToHumanString` feeds CSV / XLSX / TSV / markdown table / the Univer workbook push
      (string cells that are kind JSON, object cells carrying a kind, the "Response" text). The plain "JSON" download
      stays DATA — its label says JSON, a machine format; the data-table push (`datasetGrid`) stays raw because it STORES the
      value. Guard `export-never-raw-kind.test.ts`.
- [x] W4. Data-table copies: `kindCellCopyText` (same `kindCell` door as the display's chip) feeds bulk-row TSV, the viewer's
      cell/range copy (`getCellText` → `useGridSelection`), row copy, context-menu scope. Guard
      `a-kind-in-a-cell-copies-as-its-markdown.test.ts` (the viewer wiring itself has no render test — workspace too heavy).
- [x] W5. Tool-call `CopyButtons` `human` flavor: `resultToHuman` / `bundleToHuman` (one helper, `tool-call-visualization/utils/human-copy.ts`)
      for `ToolTabBodies`, `GenericRenderer`, the window panel's all-tools copy. Workflow `workflowFailureHuman`
      (`readout-parts`, `RunActivityFeed`) copies the failure sentence exactly as rendered — an error explanation, not a
      result value: not a leak. Guard `tool-copy-human-is-never-raw-kind.test.ts`.
- [x] W6. `AgentExecutionTestModal` plain "Copy" now copies the markdown of what the harness shows. Guard
      `execution-test-modal-never-raw-kind.test.tsx` (new case).

## Y. Round 3 attacker findings (2026-10-05)

- [x] Y2. Workflow approval card: `contextEntriesForPeople` marks EVERY context value that carries a kind at any depth (second
      top-level kind, array of kinds, nested kind, string of kind JSON); each goes through `AnswerValueView`, the rest stay plain facts.
      Guards `interrupt-view.test.ts` (new block) + `interrupt-context-kind-door.test.tsx`.
- [x] Y5. Context snapshot body (`ContextInputBody`): a kind-carrying value draws through `AnswerValueView`. Guard
      `context-input-body-never-raw-kind.test.tsx`.
- [x] Y6. `kindTextToMarkdown`: kind in an HTML comment, kind as front matter, a cut-off kind with an escaped key (preview now
      finds the key with `hasKindKey`), and a `__kind` that is a number/null/empty/non-slug ("Structured output could not be read"). LF + CRLF.
      Guard `kind-text-to-markdown-hidden-forms.test.ts`.
- [x] Y7. Tool ARGUMENTS human copy and the image result copy go through `resultToHuman`. Guard
      `tool-copy-human-callsites-never-raw-kind.test.tsx`.
- [x] Y8. Copy sweep. Fixed: commerce + print kind block header copy, `TextActionResultModal` Copy, `AgentAppFullyCustomShell` result
      copy, `CleanupPad` "copy both". Guards `kind-block-copy-human-never-raw.test.tsx`, `text-action-result-copy-never-raw-kind.test.tsx`
      (the custom shell and cleanup pad edits have no render test — hosts too heavy). Kept as explicit raw controls: "Copy raw JSON"
      (`StructuredAgentAnswerBlock`), "Copy JSON" (`StructuredValueTabs`, `UnknownDataEventBlock`), "Raw AI Response" copies
      (`CodeEditErrorCanvas`, `AICodeEditor`, `SmartCodeEditor`), "Copy raw response" (`AgentGenerator`, `FullPromptOptimizer`,
      `SystemPromptOptimizer`), request payload copy (`PayloadTab`), JSON editors/viewers.
- [x] Y9. `CleanupPad` cleaned-transcript field: the DISPLAY (field value, output content) uses `cleanedResponseShown` (a kind answer as markdown,
      an edit wins); `responseValue` — what `persistCleanRun`, apply and compare use — stays the raw answer text. Typing in the field is a
      person's explicit edit of what they see. Guard `cleaned-response-display-never-raw-kind.test.ts`.

## Z. Round 4 — verifier-confirmed leaks (2026-10-05)

Door added: `surfaces/kind-text-label.ts` (`kindTextLabel`) — answer text → ONE readable line ("<Kind> · <instance title>",
`deriveInstanceTitle`; prose with a kind → the prose's first line; cut-off kind → its one-line note). Destination transform only.

- [x] Z1 (S1). Collaboration agent-call card header subtitle: `collabHeaderSubtitle` (text, stored preview and structured value all
      through the kind's label). Guard `collab-subtitle-never-raw-kind.test.ts`.
- [x] Z2 (S4). "Worth keeping?" add-to-rulebook: `appendDraftRuleFromMessage` keeps the kind's markdown as the rule statement and
      `deriveRuleNameFromContent` names it from the kind's title (the dialog preview converts too). Guard in `oracleTapDraft.test.ts`.
- [x] Z3 (S5). Artifact version history: `ArtifactVersionBody` draws a kind version through `AnswerValueView`; "View JSON" is the labelled raw
      toggle (`data-kind-source="explicit"`); the compare diff reads the readable text; restore keeps the stored data. Guard
      `artifact-version-never-raw-kind.test.tsx`.
- [x] Z4 (S-compare). Compare with clipboard / set base / compare with base: `contentForDestination` (the diff is read by a person).
      `compare.ts` left the raw-allowed list in `destinationContent.test.ts`. Guard `compare-and-save-code-never-raw-kind.test.ts`.
- [x] Z5 (S-save). DECIDED: "Save code" saves CODE the person saw. A fence whose body carries a kind rendered as the kind's component,
      so it is not code: `extractFirstCodeBlock` skips it (`found: false`), "Save code to Scratch" is not offered for it and
      "Save to Code" opens with the readable markdown. A real code fence after a kind fence still wins. (Editors save what is on the
      screen; raw kind source stays reachable by the explicit source/JSON controls.)
- [x] Z6 (S-attach). "Attach your version" opens with the kind's readable text; the frozen original handed to the capture and an
      already-attached version stay as stored/written. Guard `attach-version-prefills-readable.test.tsx`.
- [x] Z7 (S-share). Shared-chat link-preview/OG description: `kindTextLabel(firstUserText)`. Guard `a-shared-chat-preview-never-raw-kind.test.ts`.
- [x] Z8 (also). Note and task list previews, task seeds, note auto-labels: all go through the ONE title projection
      (`plainTitleFromMarkdown`), which now names a kind by its label (`plain-title.test.ts`). Toast + `AnswerTextPreview` already closed (S3).
      Email-to-me / email dialog / public-menu email send `contentForDestination` text (W1); no client-side SMS body is built from an answer.

## Out of scope (deliberate raw views — keep)

Admin debug windows and panels, Error Inspector, tool overlay "Raw" tab, directive item "Raw" tab, text-sections
raw/split view, scraper JSON tabs, podcast run-truth inspector, research "show raw search result".

## X. Round 3 — attacker-confirmed leaks (2026-10-05)

**Rulings (owner, this round):** (a) a ```xml FENCE and an inline code span stay quoted source. (b) An XML TAG the
model wraps content in (`<answer>`, `<result>`, `<output>`, any generic tag, attributes, nested, closed or never
closed) is STRUCTURE: a kind inside it renders as the kind, live and on reload. Kindless XML stays the XML card;
comments, CDATA, attributes and fences of other languages inside it stay literal. (c) A `__kind` key whose value is
missing, unreadable or not a slug is broken structured output → the generic broken floor, never the raw card.
ONE marker says which XML card is which: `genericXmlContainer` on every piece of an XML tag (splitter AND
accumulator), read through `isQuotedSourceXmlBlock` (`json-kind-signal.ts`) by XmlBlock's three callers and the judge.

- [x] X1. Kind inside an XML tag streamed raw (36/46 frames in source view); a short ```json fence in a closed
      `<output>` and a short kind in a never-closed tag stayed raw for good. Accumulator: a JSON object or JSON-family
      fence inside `generic_xml` leaves the card the moment `__kind` is visible (line or fragment) and the tag resumes
      after it (`trackGenericXmlKindCandidate` / `splitKindOutOfGenericXml`); never-closed tags recover at finalize.
      Splitter: incomplete XML is recovered too, and `liftJsonFences` makes a JSON fence's lines chrome around the kind
      (`embedded-kind-json.ts`) — same bytes live and on reload. XmlBlock takes `quotedSource`; only a ```xml fence
      keeps the source view. `InlineCodeSnippet` refuses settled kind JSON (json/jsonc/json5/unlabelled) through a lazy
      `KindDataGate`, honouring the source view (moved to `kind-source-view.tsx`). Judge: an XML card is followed as it
      draws (`xmlCardDrawsKindRaw`, standard decision `standard-kind-region.ts`). Render matrix: `chat_xml_tag` path.
      Guards `kind-never-raw-xml-tag.test.ts`, `blocks/xml/__tests__/xml-tag-kind-renders-as-kind.test.tsx`.
- [x] X3. ```jsonc / ```json / unlabelled fence opening with `// …` or `/* … */` stayed raw all stream.
      `withoutLeadingJsonComments` feeds the one detector (`jsonKindSignal`), the pending gate (JSON-family languages
      only) and the standard level. Settled jsonc with comments still does not PARSE → the kind's broken state (not raw).
- [x] X4. `settleBrokenKindRoute` returned the raw card when no slug → `settleUnnamedKindRoute`: the generic floor
      with a `parse_error` notice, live (loader) and on reload. Guard `kind-never-raw-round3.test.ts`.
- [x] X5. One-line `<details>` holding a kind: an HTML BLOCK line is prose to the A5 split (`startsStructuralLine`).
- [x] X6. Table cell frame `| x | {"__kind":"flashcard_set` — not reproduced by the round-3 guard (no raw frame).
- [x] X7. ```json5 `{__kind: …}`: `hasKindKey` / `firstKindSlug` / `jsonKindSignal` accept an unquoted or
      single-quoted key with `{ json5: true }` only; a settled json5 body is parsed through `json5AsJson`.
- [x] X8. Front-matter kind: DECIDED hidden (document properties). `frontMatterEnd` moved into `json-kind-signal.ts`;
      `markdownCarriesKind` ignores front matter, and the accumulator holds an OPEN front matter instead of drawing
      its `---` as a rule and its values as prose. Judge and renderer agree.

## R4. Round 4 — the class guards and the leaks they exposed (2026-10-05)

- [x] G1. LEAK SENTINEL. `surfaces/kind-leak-scan.ts` (ONE DOM scan: `__kind` key in rendered text outside
      `data-kind-source`; puts back the underscores markdown emphasis ate) + `surfaces/kind-leak-sentinel.ts`
      (MutationObserver + initial scan, debounced, char-capped, never throws; `captureError` source "content-ir"
      once per DOM path, ≤20 per page; dev console.error), mounted once in `app/DeferredSingletonCore.tsx` (idle,
      `ssr:false` edge — nothing on the main chunk). Marked `data-kind-source="explicit"`: `KindSourceView`,
      `KindDataGate` with `showSource` (JsonInspector / JsonTreeViewer / RawJsonExplorer / JsonViewer / ResultJson),
      `CodeBlock` non-JSON language or settled `showSource`, `InlineCodeSnippet` quoted, inline code spans
      (`prose-inline-elements`), debug `<pre>` panes (AgentExecutionDebugPanel, ExecutionInstanceInspector,
      ErrorInspectorWindow). Guard `kind-leak-sentinel.test.ts`.
- [x] G2. DOM FRAME JUDGE. `render-paths/__tests__/dom-frame-judge.tsx` draws a frame through the real BlockRenderer in
      jsdom and asks the same scan. Midstream (every stream the file drives) and the render matrix (every streaming
      path × archetype) judge sampled frames: each block's first `__kind` frame, its last frame, every 8th between.
- [x] P2. Kind right after inline markup on its line (`<b>…</b>:`, `` `x` ``, `~~`, `<!-- -->`, `<img>`):
      `startsStructuralLine` now means fence (3+) / table row / directive / bare JSON / line-owning tag. Guard midstream P2.
- [x] P3. Content-fed streams: the static splitter makes an unbalanced object whose first key is (or may still be)
      `__kind` a json code block — loader live, broken state settled. Guard `content-fed-stream-never-raw.test.tsx` (unmocked).
- [x] P6. Inline level: `surfaces/kind-one-line.ts` (`inlineKindText`, `kindOneLine`) in `RichContentInline` and
      `RichContentPreview` (before the cut); `ExtractionCellDisplay` kind cells. Guard `inline-level-never-raw-kind.test.tsx`.
- [x] P7. Tables mid-stream. Cells render through the inline level (P6), so a kind in a header or body cell reads as
      its one-line form. Guard: midstream P7 — header row, cell after prose, cell only, DOM-judged (every 3rd kind
      frame + first + last). Live lifting of the kind OUT of the table stays the reload splitter's (V2).
- [x] P8. Markdown-escaped `{"\_\_kind":…}`: `hasKindKey(…, { markdown: true })` (text contexts; `markdownCarriesKind`);
      `surfaces/markdown-escaped-kind.ts` un-escapes the key and every `\_` in its object — accumulator per delta,
      splitter on the whole text (live = reload). Double-encoded: DECIDED — a whole answer that is a JSON string of kind
      JSON reads as that kind (`decodeDoubleEncodedKindText`, splitter). Guards midstream P8 + `kind-text-transforms-chunk-invariant`.
- [x] P9. `![{kind}](url)`: `surfaces/kind-image-alt.ts` drops the image wrapper of a kind (kindless alt untouched), both
      hosts — no stray `!` / `(url)`. A truncated kind settled at message end decides as the broken state (gate null,
      never text, never the raw card), live-finalized and reload. Guards midstream P9 + chunk-invariance.
- [x] S1. Search snippets (Knowledge Hub). A snippet is a FRAGMENT. `cleanSnippet` (hub row + card, `HubResults` copy
      "Preview"), `HubPeek` and the knowledge command bar read it through `surfaces/kind-snippet-text.ts`
      (`snippetKindText`: the shared `inlineKindText` for a kind that opens in the fragment, whole or cut at the end, plus
      the case it cannot see — a fragment that STARTS inside a kind object, cut from its start to the object's close).
      Plain text out; kindless JSON untouched. Guard `knowledge/hub/__tests__/snippetKindNeverRaw.test.tsx` (5 failed
      before, 6 pass). KNOWN GAP: a fragment cut so that it holds no `__kind` key at all (only cards' inner fields) is
      undetectable on the client — closed only at the source (S2).
- [x] S2. SOURCE — done live 2026-10-05 (Supabase MCP + direct session connection, no file): new
      `chat.kind_readable_text(text)`; `chat.message_search_text(jsonb)` now wraps its old body in it, so every
      reader (search_messages, count_messages, cvx_deep_hits, conversation title fallbacks, the tsv index) sees a
      kind's words, never its JSON. `REINDEX INDEX CONCURRENTLY chat.cx_message_search_tsv_idx` (180 s, no lock;
      178→158 MB). Verified: index-backed search for a kind's word returns a clean headline. NOTE: the old body
      lives in aidream migrations 1373/1401 — never re-apply those files (they would revert this).