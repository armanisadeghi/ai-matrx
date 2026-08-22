# Smart Code Editor

Agent-system replacement for the legacy `features/code-editor/components/AICodeEditor*` chain.

Built on the agent execution system (`features/agents/redux/execution-system/`) — not the prompt execution system. Self-managed via Redux following the Smart pattern established by `SmartAgentInput` / `AgentRunner`.

---

## Why this exists

The prompt-execution system (`lib/redux/prompt-execution/`) is legacy. Every piece of AI-editing UX that lived in `useAICodeEditor` + `AICodeEditor` + `AICodeEditorModal` needed an agent-system equivalent. This directory is that equivalent — side-by-side with the legacy chain, zero behavior changes elsewhere. Migration of call sites (`PromptAppEditor`, `CreatePromptAppForm`, `CodeBlock`) is a separate future step.

---

## Pattern: Smart component + launch-owning modal

- **`SmartCodeEditor`** is the Smart component. It takes `conversationId` as a required prop and reads everything else from Redux. Subscribes to messages, streaming text, request status, `isExecuting`. Dispatches via `SmartAgentInput` (which calls `smartExecute` under the hood).

- **`SmartCodeEditorModal`** is the Dialog wrapper that owns the conversation lifecycle. On open, it registers the widget handle and dispatches `launchAgentExecution` to create the conversation. On close, it dispatches `destroyInstanceIfAllowed`. The inner `SmartCodeEditor` never sees the launch — it just attaches.

This split means you can embed `SmartCodeEditor` directly on any surface that already has a `conversationId` (e.g. an agent runner page) without going through the modal.

---

## Two edit channels — both converge on `applyCodeEdits`

| Channel | Trigger | Path |
|---|---|---|
| **Widget tool calls** (primary) | Agent issues `widget_text_patch`, `widget_text_replace`, etc. mid-stream | `tool_delegated` → `dispatchWidgetAction` → our `useCodeEditorWidgetHandle` handler → `applyCodeEdits` or direct `setCode` → `onCodeChange` |
| **SEARCH/REPLACE response** (fallback) | Agent outputs SEARCH/REPLACE blocks in its final text response | stream ends → `useSmartCodeEditor` parses `rawAIResponse` → `applyCodeEdits` → review stage → user clicks Apply |

Agents can use either. The widget-tool path is faster (no review stage; applies immediately). The fallback path is the legacy UX preserved.

---

## IDE context (`vsc_*` keys)

`useIdeContextSync` keeps the agent's `instanceContext` slice synced with the live editor state. The following context entries are populated on every render (keys omitted when empty):

| Context key | Source | Type |
|---|---|---|
| `vsc_active_file_content` | `code`, fenced | text |
| `vsc_active_file_language` | `language` | text |
| `vsc_active_file_path` | `filePath` (optional) | text |
| `vsc_selected_text` | `selection` (optional) | text |
| `vsc_diagnostics` | `diagnostics` (optional, pre-formatted) | text |
| `vsc_active_file` | `{path, language, content}` composite | json |

These match the server team's `IdeState.to_variables()` convention, so any agent that declares them as variables or reads them via `ctx_get` works unchanged. Missing optional inputs produce no key (not an empty string) — same semantics as the server's behavior.

---

## Files

```
agent-code-editor/
├── README.md                              (this file)
├── index.ts                               barrel
├── types.ts                               CodeEditorState, CodeContextInput, hook return
├── constants.ts                           VSC_CONTEXT_KEYS, surface key
├── utils/
│   ├── parseCodeEdits.ts                  SEARCH/REPLACE parser (copied verbatim)
│   ├── applyCodeEdits.ts                  fuzzy-match edit applier (copied verbatim)
│   ├── generateDiff.ts                    unified diff generator (copied verbatim)
│   ├── ideContextVariables.ts             buildIdeContextEntries(input) → setContextEntries payload
│   └── index.ts
├── hooks/
│   ├── useSmartCodeEditor.ts              the brain — state machine + response parse
│   ├── useCodeEditorWidgetHandle.ts       widget handle bound to code editor state
│   └── useIdeContextSync.ts               dispatches setContextEntries on change
└── components/
    ├── SmartCodeEditor.tsx                the Smart component
    ├── SmartCodeEditorModal.tsx           Dialog wrapper + launch lifecycle
    └── parts/
        ├── DiffView.tsx                   (copied from legacy, uses new util path)
        ├── ReviewStage.tsx                tabs: Diff | Original | Preview | Response
        ├── ProcessingOverlay.tsx          spinner + live streaming preview
        └── ErrorPanel.tsx                 two-column: formatted error + raw response
```

---

## Usage

### Basic — modal, drop-in replacement for `AICodeEditorModal`

```tsx
import { SmartCodeEditorModal } from "@/features/code-editor/agent-code-editor";

function MyApp() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("console.log('hi');\n");

  return (
    <>
      <Button onClick={() => setOpen(true)}>AI Edit</Button>
      <SmartCodeEditorModal
        open={open}
        onOpenChange={setOpen}
        currentCode={code}
        language="typescript"
        agents={[GENERIC_CODE_EDITOR_AGENT]} // mandate keys — never an agent UUID
        onCodeChange={setCode}
        title="AI Code Editor"
      />
    </>
  );
}
```

### Embedded — use `SmartCodeEditor` directly on a surface with an existing conversation

```tsx
import {
  SmartCodeEditor,
  useCodeEditorWidgetHandle,
} from "@/features/code-editor/agent-code-editor";

function MySurface({ conversationId, code, setCode }: Props) {
  // Register the widget handle yourself when embedding (the modal does
  // this for you; direct consumers need to do it explicitly).
  useCodeEditorWidgetHandle({ code, onCodeChange: setCode });

  return (
    <SmartCodeEditor
      conversationId={conversationId}
      currentCode={code}
      language="typescript"
      onCodeChange={setCode}
    />
  );
}
```

Note: when embedding directly, the widget handle must be registered BEFORE `launchAgentExecution` fires so the `widgetHandleId` can be passed on the invocation's `callbacks`. Most direct-embed surfaces own both, so sequencing is straightforward.

---

## Migration from `AICodeEditorModal`

1. Change the import: `@/features/code-editor/components/AICodeEditorModal` → `@/features/code-editor/agent-code-editor`.
2. Replace `promptKey` / `builtinId` with `agents` (a roster of `CodeEditorAgentConfig` — mandate keys from `agents.ts`, never agent UUIDs).
3. Remove `allowPromptSelection` — the agent system doesn't use prompt builtins; it uses specific agents.
4. Everything else (`currentCode`, `language`, `onCodeChange`, `title`) is identical.

Call sites to migrate eventually:
- `features/prompt-apps/components/PromptAppEditor.tsx:48,1238`
- `features/prompt-apps/components/CreatePromptAppForm.tsx:30,632`
- `features/code-editor/components/code-block/CodeBlock.tsx:21` (CodeBlock's dropdown)

Do NOT migrate these until the agent-based flow is validated against a real agent.

---

## Related

- [`features/agents/docs/WIDGET_HANDLE_SYSTEM.md`](../../agents/docs/WIDGET_HANDLE_SYSTEM.md) — the widget handle contract this editor consumes.
- [`features/agents/components/tools-management/CLIENT_SIDE_TOOLS.md`](../../agents/components/tools-management/CLIENT_SIDE_TOOLS.md) — `tool_delegated` protocol.
- [`features/agents/components/inputs/smart-input/SmartAgentInput.tsx`](../../agents/components/inputs/smart-input/SmartAgentInput.tsx) — Smart pattern reference.
