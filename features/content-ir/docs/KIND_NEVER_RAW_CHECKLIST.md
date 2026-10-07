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
      preview, Pro text actions, agent toast, AI code editor. Audited one by one: applet — shells render
      `response` through `MarkdownStream`; the public renderer's copy now converts (`kindTextToMarkdown`);
      `AppletSurfaceRuntime` feeds the workspace SCOPE (machine, kept). Run scope (`useAgentRunSurfaceScope`,
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
- [x] S5. Fully custom applet shells. `response` into compiled app code is the app contract (left); the result
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
- [x] Y8. Copy sweep. Fixed: commerce + print kind block header copy, `TextActionResultModal` Copy, `AppletFullyCustomShell` result
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
## R5. Round 5 — hardening the class guards (2026-10-05)

- [x] H1. `valueCarriesKind` read a string as kind-carrying only when it started with `{`/`[`; prose before a ```json kind
      fence (or inline kind JSON) passed as plain, so the JSON viewers (`KindDataGate`), `ResultValue`'s inline
      ResultJson hand-off and every other caller drew the key raw. The string check is now `textCarriesKind`: whole kind
      JSON, or a kind region by `markdownCarriesKind` (outside quoted source, markdown-escaped key too). `isKindJsonText`
      keeps its meaning (the gate before a whole-text `JSON.parse`). Guards `value-carries-kind.test.ts` (5 failed before)
      + `structured-value/__tests__/kind-data-gate-embedded-region.test.tsx` (3 failed before).
- [x] H2. Leak sentinel: only what changed is read (added node / changed text's element + ~64 chars of sibling context,
      never the parent it landed in); work runs in idle slices (`requestIdleCallback`, else `setTimeout`) of
      `maxCharsPerSlice`; unfinished work (the initial full-page scan, a huge addition) carries forward, nothing is
      dropped. Guards `kind-leak-sentinel.test.ts` H2a ×2 + H2b (3 failed before) + a cost guard (appending to a 2,500-row
      list reads < 2,000 chars) + split-token guard.
- [x] H3. DOM frame judge: (a) an EMPTY frame fails (`verdict.failed = raw || empty`) — it found a live header-only
      table drawing nothing (`StreamingTableRenderer` now draws its `RegionSkeleton`) and a matrix stand-in component
      returning null; (b) `frameHoldsKind` reads `\_\_kind`; (c) the matrix judges EVERY kind frame; midstream judges
      every kind frame of the historically broken variants (one-line ```json, same-line A5, P8 escaped, A6 array) and
      the transition sampler (`transitionKindFrames`: every renderer-branch change + the frame after, first/last, every
      4th) over all 56 streams. Every frame of all 56 streams (30,795 frames) was run once and passes, but takes ~9 min —
      over the suite budget, so G2 stays sampled; (d) IntersectionObserver / matchMedia / TooltipProvider so CodeBlock
      draws; SELF-TEST `dom-frame-judge-self-test.test.tsx` plants a raw ```json kind card (CodeBlock mid-stream) and an
      empty frame and proves the judge FAILS on both (the card failed to draw before the fix). Heap: one shared container
      + unlinked frames (jsdom's nwsapi cache kept every frame alive, ~1 MB/frame → OOM).
- [x] H4. `JsonBlock` passes `showSource` only when its content is kindless by the detector (or the surface shows kind JSON
      on purpose, `allowConvertToShape={false}`), so a kind routed into the card is reported, not whitelisted. Guard
      `JsonBlock.kind-route.test.tsx` (2 failed before).
- [x] H5. Pinned / read-only served fields (`ServedFieldControl`) and list-change `update` diffs draw a kind-carrying value
      through `KindValueFrontDoor` at inline density. Guards `served-form/__tests__/read-only-kind-value-never-raw.test.tsx`
      (4 failed before) + `list-change-proposals/__tests__/proposed-value-kind-never-raw.test.tsx` (failed before). The
      approval card's `formatPlain` only receives values the detector cleared — closed by H1; guard: a prose-before-fence
      context string in `interrupt-context-kind-door.test.tsx` (failed with the pre-H1 check).
- [x] H6. `<artifact type="flashcards" …>` + one-line kind body, streamed live: the accumulator keeps the tag lines in an
      artifact block's `content` (rawXml round-trip) while the reload splitter hands ArtifactBlock only the body, so live
      drew the raw `__kind` JSON mid-stream and "No flashcards available yet" settled (UUID id with a by-id miss and the
      model's own id alike) while reload drew the cards. `artifactBodyOf` in the live hop (`renderBlockToContentBlock`)
      gives the renderer the same body as the splitter. Guard `artifact-one-line-kind-live-equals-reload.test.tsx`
      (4 failed before: char-by-char + chunks × UUID / model id; every artifact frame DOM-judged, settled = reload).
      Render matrix judges every `chat_artifact` kind frame too (its fake kind types route to the html canvas, so that
      check passed before the fix — the flashcards guard is the forcing one). NOT reproduced: the reported prose-as-code
      card and generic flashcard grid (conversation 32eaa687 actually streamed a ```json fence — `content_history`
      shows the `<artifact>` text is the post-stream materialization rewrite); two live localhost runs at HEAD rendered
      prose + cards throughout.

## R6. Round 6 — catalog prose, string-held kinds, attributes, titles, raw views (2026-10-05)

Rulings: (a) catalog prose that shows an example kind JSON is documentation — it reads as the kind's one-line
label, the stored row is never rewritten; (b) an editor of a person's own stored text is an edit-of-source view —
marked `data-kind-source="explicit"`; (c) escaped kind JSON on screen (`{\"__kind\":…}`) IS a leak.

- [x] R1. Catalog prose. `catalogProseText` (`surfaces/kind-one-line.ts`; `inlineKindText(…, { plain: true })`) in every
      skill-description slot, text AND `title`: RunSkillPicker (secondary + tooltip + configured row), SkillConfigPicker
      (card + chip tooltip), SkillsBrowser, SkillDetailView, SkillInline (tool card). Search subtitles ride S1's
      `snippetKindText` (proven on the same shapes). Guard `catalog-prose-never-raw-kind.test.ts` (5 site checks failed
      before). Agent / tool descriptions not swept this round.
- [x] R2. `hasKindKey(JSON.stringify(x))` missed string-held kinds (escaped quotes) at 5 sites — ToggledDataBody,
      emission-routing, GenericBody, RunRow, FirstTurnVariables — now `valueCarriesKind`. Repo grep: no other site.
      Guard `string-held-kind-detection.test.tsx` (behaviour + a `git grep --untracked` source guard; 3 failed before).
- [x] R3. Sentinel: (i) `hasKindKey(…, { escaped: true })` (new detector option) via `screenTextHoldsKind` — an escaped
      key on screen is reported, silent inside marked views; (ii) `title` / `aria-label` / `alt` read on changed nodes
      only (+ an `attributeFilter` observer for attribute changes); (iii) every contenteditable that is not "false" is
      skipped (`plaintext-only`, `""`). Guard `kind-leak-sentinel.test.ts` (4 failed before, 22 pass). End to end:
      `kind-leak-sentinel-pipeline.test.ts` — DOM → sentinel → real captureError → store (tier red) →
      `installErrorPersistence` flush → `log_client_error` with `p_source: "content-ir"`. The client half works and
      the live RPC accepts the source; no drop in code. Zero rows = persistence is production-build only
      (`NODE_ENV`), so dev-server leaks never reach `ops.system_error`.
- [x] R4. Conversation titles: `conversationTitleText` (package `kind-text-label.ts`) at the list read boundary
      (`mapRpcRowToConversationListItem` + the cx list mapper), SsrSidebarChats, the panel title (ChatPanelTitleMenu),
      `displayConversationTitle`, and every `title?.trim() || "Untitled conversation|chat"` site (ai-work list/columns/
      detail/provenance/transcript, /work/conversations page, cx row actions, plugins, battle, import dialog, reference
      picker). `kindTextLabel` strips wrapper tags and is never "" for kind text (falls back to the kind name), so
      `plainTitleFromMarkdown` names an `<artifact>`-wrapped kind. Guard `conversation-title-never-raw-kind.test.ts`
      (7 failed before).
- [x] R5. ContextCompareView is an inspector of the bytes an agent is fed: its raw panes (Block, FedBlock, the diff
      tab, Selection JSON, difference values) are marked; AnswerBoth (real answers) is not. CmsArtifactDetail metadata
      and the CMS collection "Raw data" `<pre>` marked. Guard `marked-source-views-round6.test.ts`.
- [x] R6. Editors marked: TaskDetails Details, TaskDetailsPanel description, NoteEditorCore plain (ProTextarea +
      Textarea), the phone note textarea, FindMatchOverlay (a mirror of the editor text). A READ-ONLY note never shows
      Plain: desktop and phone map a reader's Plain to the rendered view (the phone's read-only textarea is gone).
      Task read view was already `RichContent`. Guard `marked-source-views-round6.test.ts`.
- [ ] R7. SOURCE, next 1–4 AM PT window — DESIGNED, NOT APPLIED. Proven read-only with pg_temp copies on live
      (10 shapes + 118 real kind messages, 13.5 MB: no `"__kind":` survives, prose outside regions untouched). Known
      limit: an escaped kind inside a string keeps its OUTER object's keys (`{"answer":"…"}`) — only kind regions are
      stripped, by design. APPLY: run the two statements below (Supabase MCP or direct), then
      `REINDEX INDEX CONCURRENTLY chat.cx_message_search_tsv_idx` over a session-mode connection (port 5432,
      `statement_timeout 30min`). `chat.kind_region_words` is NEW; `chat.kind_readable_text` replaces the body S2 set
      (take a `pnpm db:based-on chat.kind_readable_text` line first if it goes through a file).

```sql
create or replace function chat.kind_region_words(r text) returns text
language plpgsql immutable parallel safe set search_path to 'pg_catalog' as $fn$
-- The words of ONE kind region: \uXXXX decoded, the __kind pair and every key
-- (quoted, escaped, json5) removed, escapes / quotes / braces stripped.
declare
  m text; code int;
begin
  r := replace(r, '\_', '_');
  for m in select distinct (regexp_matches(r, '\\+u([0-9a-fA-F]{4})', 'g'))[1] loop
    code := ('x' || lpad(m, 8, '0'))::bit(32)::int;
    r := regexp_replace(r, '\\+u' || m, case when code between 32 and 55295 or code between 57344 and 65533 then chr(code) else ' ' end, 'g');
  end loop;
  r := regexp_replace(r, '\\*["'']?__kind\\*["'']?\s*:\s*\\*["'']?[A-Za-z0-9_.:-]*\\*["'']?\s*,?', ' ', 'g');
  r := regexp_replace(r, '(\\*"[A-Za-z_][A-Za-z0-9_ -]*\\*"|''[A-Za-z_]\w*''|(?<=[{,])\s*[A-Za-z_]\w*)\s*:', ' ', 'g');
  r := regexp_replace(r, '\\+[nrt]', ' ', 'g');
  r := regexp_replace(r, '```[A-Za-z0-9]*|\\+"|["{}\[\]]|\\+', ' ', 'g');
  r := regexp_replace(r, '(?<=^|[\s,:])''|''(?=[\s,]|$)', ' ', 'g');
  r := regexp_replace(r, '\s*,(\s*,)+', ',', 'g');
  r := regexp_replace(r, '^[\s,]+|[\s,]+$', '', 'g');
  return regexp_replace(r, '\s+', ' ', 'g');
end
$fn$;

create or replace function chat.kind_readable_text(p text) returns text
language plpgsql immutable parallel safe set search_path to 'pg_catalog' as $fn$
-- A message's kind regions indexed and headlined as the words a person sees
-- (kind-never-raw R7, round 6). Every key spelling: "__kind", \"__kind\"
-- (string-held / double-encoded), '__kind' and bare __kind (json5),
-- "\_\_kind", "__kind". Only the region from the key's owning { to its
-- matching } is rewritten; text outside every region passes through untouched.
declare
  c_key constant text := '(\\*"(__kind|\\_\\_kind|\\u005[fF]_kind)\\*"|''__kind''|(?<=[{,])\s*__kind)\s*:';
  rest text := p; out text := ''; k int; s int; back int; chars text[]; n int; i int; depth int; instr bool; e int;
begin
  if p is null or (strpos(p, '__kind') = 0 and strpos(p, '\_\_kind') = 0 and strpos(lower(p), '__kind') = 0) then
    return p;
  end if;
  loop
    k := regexp_instr(rest, c_key);
    exit when k = 0;
    back := strpos(reverse(left(rest, k - 1)), '{');
    s := case when back = 0 then k else k - back end;
    chars := regexp_split_to_array(substr(rest, s), '');
    n := coalesce(array_length(chars, 1), 0);
    depth := 0; instr := false; e := n; i := 1;
    while i <= n loop
      if instr then
        if chars[i] = '\' then i := i + 1;
        elsif chars[i] = '"' then instr := false;
        end if;
      elsif chars[i] = '\' then i := i + 1;
      elsif chars[i] = '"' then instr := true;
      elsif chars[i] = '{' then depth := depth + 1;
      elsif chars[i] = '}' then
        depth := depth - 1;
        if depth <= 0 then e := i; exit; end if;
      end if;
      i := i + 1;
    end loop;
    out := out || left(rest, s - 1) || ' ' || chat.kind_region_words(substr(rest, s, e)) || ' ';
    rest := substr(rest, s + e);
  end loop;
  return out || rest;
end
$fn$;
```

## R7. Round 7 — string shapes, the sentinel's own tests, attributes in the judge, Python repr, saved artifacts (2026-10-05)

- [x] K1. `ToggledDataBody` refused every non-object, so a tool `result` arriving as a plain STRING of kind JSON was
      printed raw. Now `valueCarriesKind(value)` for every shape; the same string-refusing local checks went from
      `FirstTurnVariables` (prose strings now carry their kind too) and emission routing. Guard
      `data-events/__tests__/a-string-held-kind-behind-show-data.test.tsx`: 6 value shapes × the function / workflow /
      search / fetch / categorization cards (13 red before) + a source guard against a wrapper that returns false for
      non-objects before asking `valueCarriesKind` (red before).
- [x] K2. Sentinel tests: `settle()` advanced timers before the MutationObserver's microtask, and the install-time
      full scan found every leak, so most tests passed with an observer that never fired. `settle` flushes microtasks
      first, every test starts after the install scan, and a self-test reruns the 14 change-based tests against a
      dead observer — each must FAIL (8 of them pass again if the old helper comes back).
- [x] K3. The DOM frame judge read text only. One shared `domLeaksKind` (`kind-leak-scan.ts`: text +
      `findKindAttributeLeaks`, the sentinel's own attribute scanner) answers for the judge; self-test plants a kind in
      `title` / `aria-label` / `alt` (3 red before) and a marked source view stays silent.
- [x] K4. Python repr (`{'__kind': 'flashcard_set'}`, text contexts only, key position) and a zero-width character
      inside the key: `hasKindKey` / `firstKindSlug` strip zero-width characters, a `python` option reads the repr;
      `markdownCarriesKind` and the screen scan use it; `normalizeKindSpellings` makes the markdown
      (`kindTextToMarkdown` / `kindTextPreview`), one-line (`inlineKindText`) and search-snippet (`snippetKindText`)
      converters convert both. Guard `python-repr-and-zero-width-kind.test.ts` (13 of 15 red before).
- [x] K4b. A Python repr INSIDE a chat answer. Ruling: not lifted into a kind block (the stream parser speaks JSON; a
      speculative repr rewrite mid-stream would split live from reload) — it reads as its one-line label at the one
      prose leaf both paths use (`BasicMarkdownContent` → `pythonKindsAsOneLine`; unfinished → the kind's name;
      `KindTextGate` no longer reroutes repr-only text). Guard `python-repr-kind-in-prose-live-equals-reload.test.tsx`:
      every frame of the real accumulator stream judged (char-by-char + chunked), settled live = reload (3 red before).
- [x] K8. Search / fetch result cards: the collapsed preview line (`snippet` / `content`) goes through
      `snippetKindText` — JSON, prose-held and Python-repr kinds read as their one-line label (6 red before).
- [x] K5. Render matrix path `chat_artifact_materialized`: prose + the real id-bearing tag (`wrapArtifactText`, the
      kind's canvas type, UUID id, version) through `ArtifactRefBlock`, every frame of every archetype judged with the
      saved row loading / loaded / missing (canvas row source mocked; the cell proves it read the id). Full sequence
      `stream-then-materialize-never-raw.test.tsx`: real accumulator → production `activeRequests` slice →
      EnhancedChatMarkdown after every chunk and finalize, then the real `materializeBlocks` rewrite (only the canvas
      row write is a stand-in) drawn with the row loading / loaded / missing. The "prose as a Code · 1 line card" state
      was NOT reproduced on this sequence; the test asserts it never appears.
- [x] K6. The sentinel now mounts in `(auth-pages)` and `(oauth-review)` (bare layouts, no Providers / AppShell).
      Guard `kind-leak-sentinel-every-route-group.test.ts`: every route group's layout reaches it — (popup) and the
      deliberately thin (lab) demo site skipped (both groups red before).
- [x] K7. Public page `/p/e/[type]/[id]`: the title in the h1, deck heading, `<title>` and OG / Twitter meta and the
      meta description read `kindTextLabel(displayTitle(…))` (`publicResourceText.ts`); the rich description body keeps
      its pipeline. Test 3/3 red before. `SearchErrorBlock`: its detail is the same show-data toggle as its sibling
      cards — NOT a deliberate debug view — so it takes `ToggledDataBody`; the error line reads a kind as its one-line
      form (7 red before).

## R8. Round 8 — every spelling of the key, one normalizer (2026-10-05)

Owner ruling: literal, `_`-escaped, markdown-escaped `\_\_kind`, backslash-escaped quotes `\"__kind\"`, zero-width
characters in the key, Python repr `'__kind'`, typographic quotes `“__kind”` and HTML entities `&quot;__kind&quot;` are
all a kind.

- [x] R8-1. ONE spelling normalizer in `json-kind-signal.ts`: `ALL_KIND_SPELLINGS` (+ `smart` / `entity` options),
      `hasKindKeyAnySpelling`, `normalizeKindSpellings` (every spelled region → canonical JSON, quoted source and whole
      JSON untouched) and the shared finder `firstSpelledKindRegion`. Text detectors (`markdownCarriesKind` →
      `textCarriesKind` → `valueCarriesKind`, `firstKindSlug`, the screen scan / judge `domLeaksKind`) read every
      spelling; converters (`snippetKindText`, `kindTextToMarkdown`, `kindTextPreview`, `inlineKindText` /
      `catalogProseText`, `kindTextLabel` / `conversationTitleText` / `publicResourceText`, `plainTitleFromMarkdown`,
      `kindCell`) normalize first; text callers (`GenericBody`, `ContextValueDisplay`, `ArtifactVersionBody`,
      `SettledOutputBody`) too. Prose: escaped / smart / entity / repr kinds read as their one-line label at the one
      prose leaf (`spelledKindsAsOneLine`, replaces `pythonKindsAsOneLine`, in `BasicMarkdownContent` + `KindTextGate`);
      a zero-width key is rewritten at the stream ingress (`ZeroWidthKindKey`, inside `MarkdownEscapedKindJson`, so the
      accumulator and the splitter both lift it — fence, standalone and prose). JSON contexts keep `hasKindKey`'s
      default: there those spellings are string VALUES, which `valueCarriesKind` reads.
- [x] R8-2. THE CLASS GUARD `kind-spelling-matrix.test.tsx` (in `pnpm test:render-matrix`): 8 spellings × (9 detectors
      + 10 converters + chat prose live char-by-char/reload judged by the DOM frame judge + content-fed RichContent) =
      168 cells; one line per spelling or consumer; self-tests prove a converter or detector that skips the normalizer
      turns it red. Against the pre-round-8 code 44 converter cells were red.
- [x] R8-3. Guard gaps: (a) read-only / disabled INPUT and TEXTAREA `value` is read by the judge and the sentinel
      (editable fields stay skipped — a person's own input); (b) `data-kind-source` is watched — removing it re-scans
      that subtree; (c) an iframe `srcdoc` string is parsed (DOMParser, never the frame's document) and its body read;
      (d) `TextSectionsWindow` Raw view marked `data-kind-source`; `StructuredAgentAnswerBlock` "Details" is not a
      labelled source, so a payload carrying a kind goes through `AnswerValueView`. Guard
      `kind-leak-sentinel-guard-gaps.test.ts` (13 of 21 red before).
- [x] R8-open. DONE 2026-10-05 (cells AND chips → `cellText`: kind object → `kindOneLine`, kind text in any spelling → `kindTextLabel`; guard `StructuredAgentAnswerBlock.kind-cells.test.tsx`, red then green). `StructuredAgentAnswerBlock` small-object table cells print `JSON.stringify(cell)` (a cell holding a kind
      object prints it raw) — not in this round's brief.

## R9. Round 9 — do no harm: bounded regions, keys-only zero-width, linear time (2026-10-05)

Owner rulings: (1) never hide or drop text, never alter characters outside the matched key/region, linear time with
a hard per-call budget on the hot path; (2) convert only REALISTIC spellings and their combinations — literal, `\u005f`,
markdown `\_\_kind`, backslash-escaped (one or more levels), Python repr, JavaScript object literal / Node console
form, zero-width inside the key, smart quotes (single HTML entities keep their round-8 conversion); (3) EXOTIC forms —
double entities `&amp;quot;`, `&#95;`, upper-case / padded entities, fullwidth quotes, bidi marks, invisible operators,
combining joiners in the key — are DETECTION ONLY: the sentinel and the judge report them (`hasExoticKindKey`), no
renderer converts them.

- [x] R9-1 (H-1). An unclosed region ends where its grammar breaks (`kindGrammar`: a word, or a newline inside a
      string, after a complete token; malformed JSON punctuation keeps its balanced reading): label, then every
      character after it. Prose leaf (`spelledKindsAsOneLine`), normalizer, `inlineKindText`, `findBrokenKindJsonRegions`
      (`kindTextToMarkdown`), `snippetKindText` (also: prose that only MENTIONS the key is never cut) and
      `PlainTextFallback`. Escaped 2–3 levels decode to a fixed point within the region. Guard
      `kind-never-hides-text.test.tsx` (10 spellings × 5 converters + reload + live): 48 red before.
- [x] R9-2 (H-2). Zero-width characters change only INSIDE a matched key (`withoutZeroWidthInKeys`); ZWJ emoji, soft
      hyphens and code-span content are untouched everywhere. Matrix case "a zero-width character OUTSIDE the key is
      never touched" (red before).
- [x] R9-3 (H-3). One linear scan (`scanKindSpellingRegions`): candidates from `kind` occurrences, forward-only brace
      cursor, quoted ranges once (binary search), windowed decode proportional to the region, `MAX_REGIONS_PER_CALL`
      budget, `mayHoldKindKey` pre-check, 16-entry per-text memo in `spelledKindsAsOneLine`. Measured (jest, M-series):
      600 escaped regions 5,285 ms → ~6 ms; 1 MB + one escaped region 108 ms → ~4 ms; plain 1 MB ~0.2 ms; repeated frame
      18.9 ms → memo hit. Guard `kind-spelling-performance.test.ts` (budgets 30 / 40 / 10 / 5 ms; 3 red before).
- [x] R9-4 (L-1). Realistic COMBINATIONS (escaped / repr / smart / markdown + zero-width, half-escaped `"\__kind"`,
      `{\"\\_\\_kind\"…}`, escaped ×2/×3, spaced colon, repr key + JSON values, entity-encoded repr) are one key regex;
      the key decides the region's decoders. The stream ingress reads markdown + zero-width as the lifted key.
      13 combinations × every matrix table.
- [x] R9-5 (L-2). JavaScript object literal (`{ __kind: 'x', … }`, key position, quoted value): `js` option in
      `ALL_KIND_SPELLINGS` — detector, slug, sentinel, judge, markdown gate; the prose leaf reads it as its label.
      JSON contexts keep the literal rule. Guard `kind-literal-only-callers.test.ts`.
- [x] R9-6 (L-3). Literal-only text callers moved to the normalizing detector: `response-canvas-target`,
      `message-kind-gate` (+ `message-kind-instances` extraction normalizes), `island-meta` `kindOf`, `ErrorPanel`,
      `AICodeEditor` (its labelled "Raw AI Response" `<pre>` is `data-kind-source`), `PlainTextFallback`. Grep census of
      the rest: accumulator / splitter lifts (JSON by definition), `conversationProposals` (machine envelopes),
      `shape-doctor` (canonical skill bodies), `stream-simulator` (studio tool), `rich-document` code-fence save (a ```ts
      fence may legitimately hold a JS literal) — literal by design. Guard: 16 red before.
- [x] R9-7 (L-4). A literal key in a cut-off prose object: reload converts it (label + text after), and the live
      accumulator demotes a bare-JSON region opened on a line that breaks into prose back to prose
      (`kindLineIsProse`), with `withTerminalEnvelope` leaving such a text block alone — live reads like reload (two
      blocks live, one on reload: same words). Guard rows "literal (L-4)" in `kind-never-hides-text`.
- [x] R9-8 (L-5). `BuildProgress` "Why" panel reads `reason` / `state.error` through `catalogProseText`.
- [x] R9-9. Matrix extended: COMBINATIONS through every table; FALSE_POSITIVES (prose mention, bare word, code spans,
      ZWJ / soft hyphen, prose braces, math) come out of the prose reader, normalizer, `inlineKindText` and
      `snippetKindText` exactly as written and render every word; every prose converter and render cell keeps the text
      around the kind; EXOTIC table asserts detection only. Before round 9: 146 of 630 red across the three guards.
- [ ] R9-open. A multi-line literal region that breaks into prose on a LATER line is still lifted live (the demotion
      covers a region opened on the breaking line only).

## R10. Round 10 — the free-text boundary (2026-10-05)

Owner ruling (supersedes the round 8–9 spelling rulings): free-text guessing caused harm — it dropped and reordered
people's words — and real AI output emits JSON. **R8-1, R8-2 (non-JSON rows), R9 ruling (2), R9-4 and R9-5 are
SUPERSEDED**: backslash-escaped quotes in prose, Python repr, JS literal, smart quotes and entities are no longer
converted anywhere; they join the exotic forms as DETECTION ONLY.

- [x] R10-1. Conversion boundary: `JSON_KIND_SPELLINGS` (literal, `\u005f`, markdown-escaped, zero-width in the key);
      `scanKindSpellingRegions` returns JSON families only (`families: "all"` for detection/as-written display);
      `normalizeKindSpellings`, `markdownCarriesKind`, the prose leaf (`spelledKindsAsOneLine`, now JSON regions that
      broke in prose only, no tail hiding) follow it. `textCarriesKind` parses a whole JSON text and reads its strings
      (string-held kinds in tool / workflow data). The prose leaf draws detection-only regions byte for byte
      (`detectionOnlyKindsAsWritten` escapes markdown punctuation inside them). Judge: `domLeaksKind` fails only on a
      real JSON kind on screen (`screenTextShowsJsonKind`); `domShowsDetectionOnlyKind` / `screenTextHoldsKind`
      (sentinel) still report every spelling.
- [x] R10-2. Grammar-bounded regions (C1): `findBrokenKindJsonRegions` (an opener owns a key only when its grammar
      reaches it; to the end only while validly open), `findEmbeddedKindJsonRegions` unclosed owners, `inlineKindText`
      fallback, `boundRegion` (malformed + unbalanced ends at its cut; balanced only when it parses minus trailing
      commas), the accumulator's `proseKindObjectStart` (`ownsKindKey`) and every bare-JSON region (opening line,
      later lines, fragment) demoted to text when its grammar breaks into prose (`regionBreaksIntoProse`, 16 KB
      budget) — closes R9-open. A `__kind` whose value is an object (a pasted schema) is not a kind.
- [x] R10-3. Guards: `kind-never-hides-text` round-10 tables (attacker inputs × prose leaf / inline / catalog /
      snippet / export / label + reload / live char-by-char, prose never inside a code card; 60 red before);
      `kind-spelling-matrix` detection-only tables (sentinel reports, judge passes, converters + labels + live +
      reload byte for byte, self-test).


## R11. Round 11 — freezes, reload harm, leaks (2026-10-05)

Independent attacker's repros; failing test first for each.

- [x] R11-F1. Render-path regexes made linear, byte-identical (differential fuzz, 0 diffs): math `[ … ]` heuristic
      (was cubic: `[` + 6 000 spaces 62 s), escaped `\[ … \]` / `\( … \)`, numbering display-math scan
      (`math-normalizer.ts`, `document-numbering.ts`); sweep stand-ins in `syntax/linear-scan.ts` — section / heading-id
      / unfinished heading-id tail (cubic), reference uses and bracketed tail (stream heal, per frame). Guard
      `components/markdown-core/__tests__/regex-linear-time.guard.test.ts`: 20 adversarial ~100 KB cases in a child
      process (hang = fail); old code 0.15 s – >25 s killed, new < 60 ms.
- [x] R11-F2. `scanKindSpellingRegions` reach budget (4 × text + 64 KB) for looking past broken regions' grammar breaks
      (was 23.5 s render at '{"a":[1,{"__kind":"x" 1 [ ' × 6 000). Guard rows `kind-*`.
- [ ] R11-F1-open. Sweep remainder still super-linear (quadratic on long whitespace / bracket runs; none cubic on the
      markdown core): `prose-prepare.ts:434,446`, `ConfigurableMarkdownContent.tsx:435,437,456`,
      `json-kind-signal.ts:54,55,1256,1257`, `kind-text-to-markdown.ts:226` + `noteUnreadableKinds` (balancedEnd per
      `{`), `plain-title.ts:57`, `task-source.ts:25`, `block-media-identity.ts:39`, `message-citations.ts:477`, tool
      renderers (`parseSearch.ts` — its sweep timed out, `shape.ts:246`, `ShellInline.tsx:149`), `markdown-headings.ts`,
      `decision-options.ts:23`, `PublicMessageOptionsMenu.tsx`, analyzer viewers, `agent-copy/export.ts`.
- [x] R11-H1. Reload swallow after an escaped kind paragraph: the splitter's bare-JSON step now asks the accumulator's
      own `bareRegionBreaksIntoProse` (moved to json-kind-signal, shared) — live ≡ reload.
- [x] R11-H2. A ```json body line ending inside a string no longer swallows the closing fence (reader-only line
      close in `extractCodeBlock`). Root: `@ai-matrx/content-ir` `FenceReader` carries JSON string state across lines —
      to fix in the package (aidream).
- [x] R11-H3. `nonJsonKindsAsCode` wraps only when safe (one paragraph, no HTML-block line, no backtick inside or
      touching, no pipe in a table, fence length unused in the paragraph); else left as written.
- [x] R11-L1. `RichContentInline` (table cells, inline leaves) applies `nonJsonKindsAsCode`.
- [x] R11-L2. A list / number / boolean / null `__kind` → `UNREADABLE_KIND_NOTE` in the prose leaf, inline and
      exports. Object-valued stays a shape (R10-2) — the brief's "object" case is NOT converted; needs a ruling.
- [ ] R11-L2b. Live draws such a region as the kind block's generic broken state ("No result returned"), reload as the
      one-line note: both never raw, words differ.
