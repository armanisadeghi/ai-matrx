# Agent Execution Redux — Triggering Shortcuts (Consumption Side)

## Contents

- RULE ZERO — read the working example BEFORE you write the call site
- The mental model — two modes, pick the right one
- The Golden Rules (rules, not suggestions)
- The four trigger APIs
- REQUIRED — never paste raw shortcut UUIDs in app code
- REQUIRED — warm up known shortcuts on mount
- `applicationScope` — what to put in `scope`
- Resolution order (who wins on a variable)
- JSON-output shortcuts — `jsonExtraction` is mandatory at the call site
- Example A — non-direct (the easy case)
- Example B — direct (the structured-output case)
- Cleanup rules
- Common mistakes to avoid
- Where to read more

Everything in SKILL.md is about **extending** the system. This file is about **using** it — engaging a stored shortcut from product code.

A shortcut is a database row that already declares its agent, version pin, variable mappings, display mode, autoRun behavior, pre-execution gate, allowChat, default values, and how the result is rendered. The shortcut author has done the thinking. Your job at the call site is small: pass what you have, and stay out of the way.

## RULE ZERO — read the working example BEFORE you write the call site

Every new shortcut caller you build looks like one of two existing files. Open the matching example and read it end-to-end before you write a line of new code. Do not skim. Do not pattern-match from memory. Do not adapt an old non-shortcut hook call.

| Your situation | Read this file |
|---|---|
| Right-click context menu, replaces text inline, output is text | `features/context-menu-v3/` (`EditableContextMenu` / `NonEditableContextMenu`) |
| Mounted component, output is structured JSON / artifact / non-text | `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx` |

This is not optional. Every recurring bug in this section — `jsonExtraction` not flowing, `autoRun: false` misused, `onConversationCreated` skipped, instance leaks on unmount, raw UUIDs at the call site — is a bug that disappears the moment you read the working example first. If you can't articulate why your call site needs to look different from the example, you're probably wrong.

> **Receipts (real bugs that read-the-example would have prevented):** the Image Studio describe flow shipped without `jsonExtraction`. Streaming text arrived perfectly; the JSON extractor was never enabled, so `selectFirstExtractedObject` stayed empty and `waitForExtraction` timed out at 120s with a misleading "did not return structured JSON" error. The fix was a one-line copy from `AgentGenerator.tsx`. Cost: hours of debugging that a 60-second skim of the example would have saved.

## The mental model — two modes, pick the right one

Every shortcut runs in exactly one of two modes. Get this right and the rest is mechanical.

| Mode | When | What you do | Who renders |
|---|---|---|---|
| **Non-direct** (`displayMode` is anything except `direct` / `background`) | The shortcut produces a normal AI response — text, chat, structured markdown — that the system already knows how to display in an overlay (modal, sidebar, panel, chat-bubble, toast, …). | Trigger and stop. | The system's overlay handles input, streaming, completion, post-actions. |
| **Direct** (`displayMode: 'direct'`) | The output is something only the caller knows how to render — structured JSON, a custom artifact, an editor patch, a domain-specific UI. The reference example is `AgentGenerator` extracting agent-config JSON. | Trigger AND consume the stream yourself via the request/instance selectors. | Your component owns the entire UI — input fields, streaming display, result panel, save/regenerate buttons. |

Decision rule: if the shortcut just produces text and you want it to look a particular way, that's a non-direct shortcut with a different `displayMode`. **Do not** reach for `direct` mode to "control the layout" of normal text output. `direct` mode exists for non-text output.

## The Golden Rules (rules, not suggestions)

The shortcut author's row is the contract. Your job is to honor it.

1. **Don't override what the shortcut already configures.** `displayMode`, `autoRun`, `allowChat`, `showVariablePanel`, `showPreExecutionGate`, `defaultUserInput`, `defaultVariables`, `hideReasoning`, `bypassGateSeconds` — all of these live on the shortcut row. Setting them in `config: {...}` says "this caller knows better than the shortcut author." That's almost never true. Override only when the call site has a structurally different requirement (and even then, ask whether the shortcut row is wrong instead).
2. **Don't fake a user input.** `userInput` (or `runtime.userInput`) represents text the user typed. If the user typed nothing, leave it `undefined`. Synthesizing `"Generate the agent please."` to coerce the system is lying to it.
3. **Don't force variables.** `variables: {...}` on trigger options bypasses scope mappings AND the user's variable panel. Use it only for genuinely pre-bound values the user can't change. Otherwise let the shortcut's `scopeMappings` resolve from `scope`, and let the user edit in the variable panel.
4. **Don't wrap data in strange strings.** Pass `scope: { selection: text }` with `text` raw. No `"Selection: " + text`. No markdown fences. No labels. The agent's prompt template handles framing — the call site delivers data clean.
5. **Just pass what you have.** Look at what your surface naturally exposes (the highlighted text, the file path, the document body, the cursor) and pass it under the standard key names. Don't speculate-fill; don't invent variants.
6. **Mappings are the shortcut author's contract.** A variable that doesn't bind is fixed by updating `scopeMappings` on the shortcut row, OR by aligning your surface's keys with the shared vocabulary — never by building wrappers/transforms in the caller. If you don't know the variables, you don't need them for non-direct mode (the shortcut + scope mappings + user panel handle it). If you've been told to create a shortcut for a direct-mode use case, you have the variable names — map them precisely and stop.
7. **NEVER set `autoRun: false` programmatically.** `autoRun: false` exists for exactly one reason: a user has to type into the variable panel or a pre-execution gate before the agent runs. There is no user inside a programmatic trigger. If you reach for `config: { autoRun: false }` from code, you are about to write extra orchestration (manually attach resources, manually `executeInstance`, manually wait for it) that is not your job and not the system's contract. Stop and ask: (a) should the shortcut row's `autoRun` be `true` and you're fighting it for no reason? (b) does the data you wanted to attach actually belong in `scope` / `runtime` / `variables`? (c) is the launcher genuinely missing a way to carry your payload (e.g. instance resources at create-time)? If it's (c), file the system gap — don't compensate at the call site by hijacking the user-input gate. Existing `autoRun: false` programmatic call sites in the codebase are tagged with `KNOWN ANTI-PATTERN` comments because they're blocked on a launcher-level fix; don't add more.

## The four trigger APIs

All four dispatch `launchAgentExecution` under the hood and return `Promise<{ conversationId, displayMode }>`.

| API | Where to use it | Shape |
|---|---|---|
| `useShortcutTrigger()` | React, generic | `const trigger = useShortcutTrigger(); await trigger(id, { scope, runtime?, sourceFeature?, jsonExtraction?, onConversationCreated? })` |
| `useShortcut(id)` | React, bound to a single shortcut | `const run = useShortcut(id); await run({ scope })` |
| `triggerShortcut(dispatch, args)` | Redux thunk / utility module / outside React | `await triggerShortcut(dispatch, { shortcutId, scope })` |
| `useAgentLauncher().launchShortcut(id, scope, opts)` | Used today by the v3 context menu and the code-editor flows | `const { launchShortcut } = useAgentLauncher(); await launchShortcut(id, applicationScope, opts)` |

> **TODO (Arman steer):** the codebase has both the dedicated trigger trio (`useShortcutTrigger` / `useShortcut` / `triggerShortcut`) and the broader `useAgentLauncher().launchShortcut`. All four hit `launchAgentExecution`. Consolidation hasn't shipped — for now both work. Insert the final steer here on which to prefer for new code.

## REQUIRED — never paste raw shortcut UUIDs in app code

If your component depends on a specific shortcut id, register it in `features/agents/constants/system-shortcuts.ts` and read it through `getSystemShortcut(key)`. A raw `"cfde5205-…"` literal in JSX or a hook call is forbidden.

```ts
// features/agents/constants/system-shortcuts.ts
export const SYSTEM_SHORTCUTS = {
  "agent-generator-01": {
    label: "AI Agent Generator — v1",
    id: "cfde5205-598f-41d5-a627-6774846f5879",
    feature: "agent-generator",
    description: "Turns a plain-English description into a structured agent JSON.",
    // temporaryConfigs is migration debt — every key here is a TODO to drain
    // by moving the config onto the shortcut row.
    temporaryConfigs: {
      jsonExtraction: { enabled: true, fuzzyOnFinalize: true, maxResults: 5 },
    },
  },
} as const satisfies Record<string, SystemShortcutEntry>;
```

```tsx
import { getSystemShortcut } from "@/features/agents/constants/system-shortcuts";
const SHORTCUT = getSystemShortcut("agent-generator-01");
await trigger(SHORTCUT.id, { scope: { selection } });
```

The registry gives you stable refactor-friendly identity, a label for logs/debug UI, the owning feature for telemetry, and a marker for migration debt. New entries belong in the DB first; the registry references them by UUID.

**Boy-scout rule.** If you find a raw shortcut UUID in any file you're editing — even a feature-local `constants.ts`, even one written yesterday — migrate it to `system-shortcuts.ts` in the same change. Don't leave a TODO. Don't tell yourself it's "out of scope." A raw UUID literal is technical debt that compounds: the next agent who copy-pastes the call site has now spread the violation further. Fix it where you find it.

## REQUIRED — warm up known shortcuts on mount

Any component that depends on a specific shortcut id must call `ensureShortcutLoaded` on mount and surface a load-failure state in the UI. The launch thunk also calls it internally as a safety net, but doing it on mount means:

- The user never clicks "Generate" only to have it explode 200ms later.
- Your component can honestly render `Loading generator configuration…` and `Generator unavailable: <message>` instead of a fake-ready button.
- The fetch is single-flight and idempotent — calling it from N mounted components results in one HTTP call.

```tsx
import { ensureShortcutLoaded } from "@/features/agents/redux/agent-shortcuts/thunks";

const dispatch = useAppDispatch();
const shortcut = useAppSelector(
  (state) => state.agentShortcut.shortcuts[SHORTCUT.id] ?? null,
);
const [shortcutLoadError, setShortcutLoadError] = useState<string | null>(null);
const shortcutReady = shortcut !== null;

useEffect(() => {
  if (shortcutReady) return;
  let cancelled = false;
  setShortcutLoadError(null);
  dispatch(ensureShortcutLoaded(SHORTCUT.id))
    .unwrap()
    .catch((err) => {
      if (cancelled) return;
      setShortcutLoadError(err instanceof Error ? err.message : "Failed to load");
    });
  return () => {
    cancelled = true;
  };
}, [shortcutReady, dispatch]);

// Disable the trigger until shortcutReady. Render a banner on shortcutLoadError.
```

## `applicationScope` — what to put in `scope`

Standard keys (use these names whenever your surface has them — don't invent variants like `selectedText` or `fullText`):

| Key | Meaning |
|---|---|
| `selection` | Highlighted text |
| `content` | Full document / buffer |
| `context` | Arbitrary object — flattened onto the instance as context entries |
| `text_before` / `text_after` | Text surrounding the selection or cursor |
| `cursor_position` | `{ line, column }` |
| `file_path`, `file_name`, `language` | Editor surface info |

Custom keys work — the shortcut author can map them via `scopeMappings`. The shortcut decides which keys it needs; your job is to deliver the ones your surface naturally has.

## Resolution order (who wins on a variable)

When two layers have a value for the same variable:

1. Agent's declared `defaultValue` on the variable
2. Shortcut's `defaultVariables` / `defaultContextSlotValues`
3. Your `scope`, run through the shortcut's `scopeMappings`
4. `runtime.userInput` and pre-execution gate text
5. **User edits in the variable panel** — final winner

`variables: {...}` on trigger options bypasses 3 and 4 entirely. Use sparingly.

## JSON-output shortcuts — `jsonExtraction` is mandatory at the call site

If the shortcut produces structured JSON for the caller to consume — every `displayMode: 'direct'` shortcut, plus any programmatic non-direct caller that needs `selectFirstExtractedObject` / `selectJsonExtractionComplete` — the trigger site **must** pass `jsonExtraction` from the registry's `temporaryConfigs`:

```ts
const SHORTCUT = getSystemShortcut("agent-generator-01");
await trigger(SHORTCUT.id, {
  scope,
  jsonExtraction: SHORTCUT.temporaryConfigs?.jsonExtraction, // ← REQUIRED
  onConversationCreated: setConversationId,
});
```

**What happens if you skip it** — `process-stream.ts` (`features/agents/redux/execution-system/active-requests/process-stream.ts`) skips the `StreamingJsonTracker` entirely. No extracted objects are ever written to the `activeRequests` slice. `selectJsonExtractionComplete(requestId)` stays `false` forever. Streaming text still flows perfectly into `selectLatestAccumulatedText` — you'll watch the JSON arrive on screen — while every extraction selector and any `waitForExtraction` polling stays dead. The default 120s polling timeout will then trip with a misleading error like "agent did not return structured JSON" even though it absolutely did.

This is migration debt. The config belongs on the shortcut row (a future `shortcut.jsonExtraction` column) so the call site never has to know the agent's output shape. Until that lands, the registry's `temporaryConfigs.jsonExtraction` is the single source of truth — not feature-local constants files, not inline literals at the call site. Any new JSON-output entry in `system-shortcuts.ts` MUST include this; any caller of such an entry MUST forward it.

## Example A — non-direct (the easy case)

Wrap a surface in `EditableContextMenu` (or `NonEditableContextMenu` for read-only regions). The system handles selection capture, scope assembly, overlay rendering, streaming, and completion. The caller declares which surface this is and what scope data it has — that's it.

```tsx
<EditableContextMenu
  sourceFeature="notes"
  contextData={{ content: noteBody, context: noteTitle }}
  onTextReplace={(t) => setNoteBody(t)}
>
  <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
</EditableContextMenu>
```

Every shortcut whose `enabledFeatures` includes the `notes` (or `general`) context appears in the right-click menu. Click → shortcut fires → result lands in whatever overlay the shortcut's `displayMode` says. The caller never subscribes to anything.

The single-button form is the same idea:

```tsx
const runExplain = useShortcut("863b28c4-…"); // ← actually use getSystemShortcut(...)
return (
  <button onClick={() => runExplain({ scope: { selection: text } })}>
    Explain
  </button>
);
```

## Example B — direct (the structured-output case)

When the shortcut emits non-text output (JSON, an artifact, a domain-specific blob), the shortcut row sets `displayMode: 'direct'` and the caller component owns the entire UI. The reference implementation is `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx`. Read it before building a new direct-mode caller — it's small, complete, and crash-proof.

The minimum shape:

```tsx
const SHORTCUT = getSystemShortcut("agent-generator-01");

function MyDirectModeCaller() {
  const dispatch = useAppDispatch();
  const trigger = useShortcutTrigger();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [selection, setSelection] = useState("");

  // Warm-up + load-fail UI: see "REQUIRED — warm up known shortcuts" above.

  // Streaming selectors keyed off conversationId / requestId
  const streamingText = useAppSelector(
    conversationId ? selectLatestAccumulatedText(conversationId) : () => "",
  );
  const requestId = useAppSelector(
    conversationId ? selectLatestRequestId(conversationId) : () => undefined,
  );
  const extracted = useAppSelector(
    requestId ? selectFirstExtractedObject(requestId) : () => null,
  );

  const handleRun = async () => {
    if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    setConversationId(null);

    await trigger(SHORTCUT.id, {
      scope: { selection },                         // pass it raw
      runtime: { userInput: undefined },            // nothing typed → undefined
      jsonExtraction: SHORTCUT.temporaryConfigs?.jsonExtraction,
      sourceFeature: "agent-generator",             // identify the surface
      onConversationCreated: (id) => setConversationId(id), // see below
    });
  };

  // Direct-mode owners destroy their instance on unmount.
  useEffect(
    () => () => {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    },
    [],
  );

  // ...render input UI, streamingText, extracted, post-complete actions
}
```

Three things make the direct-mode pattern work:

- **`displayMode: 'direct'` on the shortcut row** — no overlay opens; the caller component is the surface.
- **`onConversationCreated` callback** — the conversation id lands in local state IMMEDIATELY, before the stream starts. If you `await` the trigger and only `setConversationId(result.conversationId)` afterwards, the streaming UI sits dead for the entire 30–60s stream. Use the callback.
- **`destroyInstanceIfAllowed` on unmount AND on re-trigger** — direct-mode callers own the instance lifecycle. Skip this and stale text from run #1 leaks into run #2 selectors.

## Cleanup rules

| Mode | Who destroys the instance |
|---|---|
| Non-direct | The overlay system. Caller does nothing. |
| Direct | The caller, on unmount and on re-trigger. Use `destroyInstanceIfAllowed(conversationId)`. |

## Common mistakes to avoid

- **Writing the call site from memory or by adapting an old hook call.** → Read the matching working example FIRST. See Rule Zero.
- **Pasting a shortcut UUID literal into JSX, a hook call, or a feature-local constants file.** → Use `getSystemShortcut(...)`. If you find one that already exists, migrate it in the same change (boy-scout rule).
- **Setting `config: { autoRun: false }` from code.** → Hard anti-pattern. autoRun:false gates user input; programmatic triggers have no user. See Golden Rule #7. If you genuinely can't avoid it (legacy launcher gap around resource attachment), tag the call site with `KNOWN ANTI-PATTERN` so the next reader knows it's debt, not a template.
- **Skipping `jsonExtraction` because "the shortcut already has it configured."** → It doesn't, until the row carries it. Forward `SHORTCUT.temporaryConfigs?.jsonExtraction` from the registry. Without this, JSON-output shortcuts silently never extract.
- **Synthesizing `userInput: "Please generate it"` because the user didn't type anything.** → Leave it `undefined`.
- **Setting `config: { displayMode: 'modal-full' }` on the trigger "to be safe."** → The shortcut row already configures display. Trust it.
- **Pre-formatting `scope.selection` with labels, prefixes, or markdown wrappers.** → Pass raw text.
- **`await trigger(...)` and only setting `conversationId` after the await resolves.** → Use `onConversationCreated` so streaming UI mounts before the stream starts.
- **Reaching for `direct` mode to style normal text output.** → That's a non-direct shortcut with a different `displayMode` — pick one of `modal-full`, `sidebar`, `panel`, `chat-bubble`, etc.
- **Inventing variants of standard scope keys (`selectedText`, `bodyText`, `fullContent`).** → Use `selection`, `content`, `text_before`, etc.
- **Building wrappers in the caller because a variable didn't bind.** → Fix the shortcut's `scopeMappings` instead.
- **Skipping `ensureShortcutLoaded` because "the launch thunk does it anyway."** → It does, as a safety net — but the caller still needs the load-fail UI state on mount.

## Where to read more

- `features/agents/TRIGGER-SHORTCUTS.md` — quick reference, mostly aligned with this section
- `features/agent-shortcuts/FEATURE.md` — data model, scope-mapping contract, display modes, configuration axes
- `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx` — direct-mode reference implementation (read this before building a new direct caller)
- `features/context-menu-v3/` (`EditableContextMenu` / `NonEditableContextMenu`) — non-direct context-menu mount pattern
- `features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts` — the orchestrator all four trigger APIs dispatch through
