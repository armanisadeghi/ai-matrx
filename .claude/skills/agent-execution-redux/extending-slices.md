# Agent Execution Redux — Extending the Slices

## Process

1. **Identify the slice.** Use the "where does new state belong?" table in SKILL.md. If it's per-instance and ephemeral, it's Layer 3. If it's permanent agent data, it's Layer 1.

2. **Check what exists.** Read the slice file and its selectors. The capability often already exists.

3. **If it exists, wire into it.** Do not re-derive, re-fetch, or store locally.

4. **If it doesn't exist, extend the correct slice:**
   - Add the field to the interface (in the types file or inline).
   - Add a default in the `init*` action.
   - Add a setter action.
   - Add a selector (primitive → plain function; derived array/object → `createSelector`).
   - Export from the barrel `index.ts`.

5. **Verify the addition is general-purpose.** Any component, modal, panel, or shortcut should be able to use it — not just yours.

## Concrete example: adding variable display layout

**Scenario:** Multiple variable display components exist (form, stepper, stacked, minimal). You need to control which one renders for a given instance.

**Wrong:** `useState('form')` in the component.

**Right:**

1. This is per-instance display configuration → `instanceUIState`.
2. Check the slice: `expandedVariableId` exists (tracks focused variable), but no layout variant.
3. Extend:

```typescript
// In the InstanceUIState interface (types file):
variableDisplayLayout: "form" | "stepper" | "stacked" | "minimal";

// In initInstanceUIState action (slice):
variableDisplayLayout: action.payload.variableDisplayLayout ?? "form",

// New action:
setVariableDisplayLayout(state, action: PayloadAction<{
  conversationId: string;
  layout: "form" | "stepper" | "stacked" | "minimal";
}>) {
  const entry = state.byConversationId[action.payload.conversationId];
  if (entry) entry.variableDisplayLayout = action.payload.layout;
},

// New selector:
export const selectVariableDisplayLayout =
  (conversationId: string) => (state: RootState) =>
    state.instanceUIState.byConversationId[conversationId]?.variableDisplayLayout;
```

4. **What the whole system gains:**
   - Shortcuts can pre-select layout via `initInstanceUIState`.
   - `expandedVariableId` already controls focus — combine with layout for "open in stepper mode with this variable focused."
   - Every modal, panel, and chat-bubble gets this for free.
