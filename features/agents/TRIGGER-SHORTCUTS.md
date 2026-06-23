# Triggering Agent Shortcuts — Quick Reference

The shortcut system is the canonical way to run an agent from application code,
UI, or automations. It replaces the legacy "run this prompt by id" paths.

**Every agent shortcut is defined once** (category, agent, variable mappings,
context-slot mappings, defaults, display mode, pre-execution gate, LLM
overrides, …) and then triggered from anywhere with its ID plus optional
runtime scope data.

## Where the context menu is live today

Mount points for `UnifiedAgentContextMenu`:

| Surface | File |
|---|---|
| Notes editor | `features/notes/components/NoteEditor.tsx` (4 menus — title, body, block, side rail) |
| Monaco code editor | `features/code-editor/components/CodeEditorContextMenu.tsx` |
| Agent builder — system instructions | `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx` |
| Agent builder — message item | `features/agents/components/builder/message-builders/MessageItem.tsx` |
| **Demo / hub** | `app/(dev)/demos/context-menu/page.tsx` → route `/ssr/context-menu` |
| **Demo / diagnostic lab** | `app/(dev)/demos/context-menu/lab/page.tsx` → route `/ssr/context-menu/lab` |
| **Demo / scenario matrix** | `app/(dev)/demos/context-menu/scenarios/page.tsx` → route `/ssr/context-menu/scenarios` |
| **Demo / page registry (edit to add new test pages)** | `app/(dev)/demos/context-menu/_registry.ts` |

Right-click anywhere inside the bordered panels on the demo page and the menu
should render. The debug page prints the live shortcut / category / content-block
state straight out of Redux — useful when a shortcut is missing from the menu.

## From a React component — `useShortcutTrigger()`

```tsx
import { useShortcutTrigger } from "@/features/agents/hooks/useShortcutTrigger";

function ExplainButton({ selectedText }: { selectedText: string }) {
  const trigger = useShortcutTrigger();
  return (
    <button
      onClick={() => trigger("863b28c4-bb94-400f-8e23-b6cf50486537", {
        scope: { selection: selectedText },
      })}
    >
      Explain
    </button>
  );
}
```

That's it. Six lines including the import.

## Pre-bound to a specific shortcut — `useShortcut(id)`

When a component always triggers the same shortcut, bind the ID once:

```tsx
import { useShortcut } from "@/features/agents/hooks/useShortcutTrigger";

function ExplainButton({ selectedText }: { selectedText: string }) {
  const runExplain = useShortcut("863b28c4-bb94-400f-8e23-b6cf50486537");
  return (
    <button onClick={() => runExplain({ scope: { selection: selectedText } })}>
      Explain
    </button>
  );
}
```

## From a Redux thunk / utility — `triggerShortcut(dispatch, args)`

Outside the React tree (thunks, keyboard-shortcut registries, services), use
the helper — you already have `dispatch`:

```ts
import { triggerShortcut } from "@/features/agents/utils/trigger-shortcut";

// inside a thunk
await triggerShortcut(dispatch, {
  shortcutId: "863b28c4-bb94-400f-8e23-b6cf50486537",
  scope: { selection, content, file_path },
});
```

From a non-thunk module (rare), grab the store:

```ts
import { getStore } from "@/lib/redux/store";
import { triggerShortcut } from "@/features/agents/utils/trigger-shortcut";

await triggerShortcut(getStore()!.dispatch, {
  shortcutId,
  scope: { selection },
});
```

## What `scope` is

`scope` is your UI's snapshot at trigger time. The standard keys are:

| Key | Meaning |
|---|---|
| `selection` | Highlighted text |
| `content` | Full document / buffer |
| `context` | Arbitrary object — flattened onto the instance as context entries |
| `text_before` | Text before the cursor / selection |
| `text_after` | Text after the cursor / selection |
| `cursor_position` | `{ line, column }` or similar |
| `file_path`, `file_name`, `language` | Editor surface info |

Custom keys work too — set whatever the shortcut author expects. The
shortcut's **Scope → Variable Mappings** and **Scope → Context Slot Mappings**
dictate how each key is routed to the agent.

## The resolution order (so you know what you're overriding)

1. Agent's declared `defaultValue` on variables / context slot declarations
2. Shortcut's **Default Variable Values** / **Default Context Slot Values**
3. Shortcut's scope → variable / scope → context-slot mappings applied against
   the `scope` you pass in
4. Runtime user edits (variable panel) and the pre-execution gate text, if
   enabled

Scope values always win over the first two; the user always wins over
everything else.

## Full option reference

Both the hook and the helper accept the same shape:

```ts
{
  scope?: { /* UI scope data */ },       // default: {}
  surfaceKey?: string,                    // default: "shortcut:<id>"
  sourceFeature?: SourceFeature,          // default: "programmatic"
  config?: Partial<AgentExecutionConfig>, // override persisted config
  runtime?: AgentExecutionRuntime,        // widgetHandleId, originalText, userInput
  extra?: Partial<ManagedAgentOptions>,   // escape hatch
}
```

For anything beyond shortcut triggering — launching the same agent in a
managed lifecycle, running the chat endpoint directly, manual instance
creation — use the richer `useAgentLauncher()` hook.

## Return value

Both APIs return `Promise<{ conversationId, displayMode }>`. That's enough to
subscribe to the conversation for streaming, open a specific overlay, or
branch on the display mode.

```ts
const { conversationId } = await trigger(shortcutId, { scope });
// e.g. subscribe to messages:
const messages = useAppSelector(state => selectInstanceMessages(state, conversationId));
```
