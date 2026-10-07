/**
 * agentBuilder — THE BUILDER TIER of an agent record (AGENT-CORE-PLAN B2).
 *
 * The agent builder edits a definition; chat only runs one. So the 22 edit
 * reducers, dirty tracking against the saved baseline, field history and
 * undo/redo live here, in the app, and never in `@ai-matrx/chat` (guard G2,
 * `check-chat-has-no-builder-tier`, is a hard ban since B2).
 *
 * ONE HOLDER: the record these reducers edit is the same `agentDefinition`
 * record chat's run reads (name, model, variables), so a saved edit reaches
 * the composer without a copy. The app composes these reducers onto that key
 * with `withAgentBuilderEdits` (lib/redux/rootReducer.ts); their action types
 * are `agentBuilder/*`.
 */
import { createSlice, type PayloadAction, type Reducer, type UnknownAction } from "@reduxjs/toolkit";
import isEqual from "lodash/isEqual";
import type {
  AgentDefinition,
  AgentDefinitionRecord,
  AgentDefinitionSliceState,
  FieldSnapshot,
  UndoEntry,
} from "@ai-matrx/chat/agents/types/agent-definition.types";
import {
  UNDO_MAX_ENTRIES,
  UNDO_MAX_BYTES,
  UNDO_COALESCE_MS,
} from "@ai-matrx/chat/agents/types/agent-definition.types";
import agentDefinitionReducer, {
  markAgentRecordClean,
} from "@ai-matrx/chat/agents/redux/agent-definition/slice";
import {
  addField,
  assignField,
  fieldFlagsSize,
  hasField,
  removeField,
} from "@ai-matrx/agents/field-flags";

// ---------------------------------------------------------------------------
// Undo/redo helpers
// ---------------------------------------------------------------------------

function estimateBytes(value: unknown): number {
  if (value == null) return 8;
  if (typeof value === "string") return value.length * 2;
  if (typeof value === "number" || typeof value === "boolean") return 8;
  try {
    return JSON.stringify(value).length * 2;
  } catch {
    return 1024;
  }
}

function totalStackBytes(stack: UndoEntry[]): number {
  let total = 0;
  for (const entry of stack) total += entry.byteEstimate;
  return total;
}

/**
 * Compresses the undo stack when it exceeds limits.
 * Strategy: keep the most recent entries and the oldest entry (for deep undo),
 * then thin out the middle by merging consecutive same-field entries and
 * dropping every other entry when still over budget.
 * This means 50 stored entries can represent 200+ logical user actions.
 */
function compressStack(stack: UndoEntry[]): UndoEntry[] {
  if (
    stack.length <= UNDO_MAX_ENTRIES &&
    totalStackBytes(stack) <= UNDO_MAX_BYTES
  ) {
    return stack;
  }

  const protectedHead = 1;
  const protectedTail = Math.min(20, Math.floor(stack.length * 0.4));

  if (stack.length <= protectedHead + protectedTail) return stack;

  const head = stack.slice(0, protectedHead);
  const tail = stack.slice(-protectedTail);
  let middle = stack.slice(protectedHead, stack.length - protectedTail);

  // Phase 1: merge consecutive same-field entries in the middle (keep the oldest value)
  const merged: UndoEntry[] = [];
  for (const entry of middle) {
    const prev = merged[merged.length - 1];
    if (prev && prev.field === entry.field) {
      continue; // drop the newer duplicate — prev already holds the older value
    }
    merged.push(entry);
  }
  middle = merged;

  // Phase 2: if still over count, drop every other entry from the middle
  let result = [...head, ...middle, ...tail];
  if (result.length > UNDO_MAX_ENTRIES) {
    const thinned: UndoEntry[] = [];
    for (let i = 0; i < middle.length; i++) {
      if (i % 2 === 0) thinned.push(middle[i]);
    }
    result = [...head, ...thinned, ...tail];
  }

  // Phase 3: if still over byte budget, drop from the oldest end of the middle
  while (
    result.length > protectedHead + protectedTail + 1 &&
    totalStackBytes(result) > UNDO_MAX_BYTES
  ) {
    result.splice(protectedHead, 1);
  }

  return result;
}

/**
 * Pushes an undo entry, coalescing rapid edits to the same field.
 * Clears the redo stack (standard undo/redo semantics).
 */
function pushUndoEntry(
  record: AgentDefinitionRecord,
  field: keyof AgentDefinition,
  previousValue: AgentDefinition[keyof AgentDefinition],
): void {
  const now = Date.now();
  const bytes = estimateBytes(previousValue);
  const top = record._undoPast[record._undoPast.length - 1];

  if (top && top.field === field && now - top.timestamp < UNDO_COALESCE_MS) {
    // Coalesce: keep the original (older) value, just update the timestamp
    top.timestamp = now;
  } else {
    record._undoPast.push({
      field,
      value: previousValue,
      timestamp: now,
      byteEstimate: bytes,
    });
  }

  record._undoFuture = [];
  record._undoPast = compressStack(record._undoPast);
}

/**
 * Applies a user edit with dirty tracking, field history, and undo stack.
 * Captures the original value ONCE per field per clean cycle.
 * Does NOT add the field to _loadedFields — user edits are not "fetched".
 */
function applyFieldEdit<K extends keyof AgentDefinition>(
  record: AgentDefinitionRecord,
  field: K,
  value: AgentDefinition[K],
): void {
  const previousValue = record[field] as AgentDefinition[K];
  const wasDirty = hasField(record._dirtyFields, field);

  // Writing a clean field's own value back is not an edit: editors that echo
  // the current value (e.g. right after Discard) must not invent unsaved changes.
  if (!wasDirty && isEqual(value, previousValue)) return;

  if (!wasDirty) {
    (record._fieldHistory as FieldSnapshot)[field] = previousValue;
  }

  pushUndoEntry(record, field, previousValue);

  assignField(record, field, value);

  // Reconcile dirty state against the saved baseline. If the user edited the
  // field back to its original value, the record is no longer dirty on this
  // field — don't leave a stale "unsaved" flag behind. Deep equality is
  // required because most fields are objects/arrays.
  const baseline = record._fieldHistory[field];
  if (wasDirty && isEqual(value, baseline)) {
    removeField(record._dirtyFields, field);
    delete record._fieldHistory[field];
  } else {
    addField(record._dirtyFields, field);
  }
  record._dirty = fieldFlagsSize(record._dirtyFields) > 0;
}


// ---------------------------------------------------------------------------
// Slice — edits the one agentDefinition record (see withAgentBuilderEdits)
// ---------------------------------------------------------------------------

const initialState: AgentDefinitionSliceState = {
  agents: {},
  activeAgentId: null,
  status: "idle",
  error: null,
};

export const agentBuilderSlice = createSlice({
  name: "agentBuilder",
  initialState,
  reducers: {
    // ── User field edits (trigger dirty) ─────────────────────────────────────

    /** Edit any single field by name. For scalars and simple values. */
    setAgentField(
      state,
      action: PayloadAction<{
        id: string;
        field: keyof AgentDefinition;
        value: AgentDefinition[keyof AgentDefinition];
      }>,
    ) {
      const { id, field, value } = action.payload;
      const record = state.agents[id];
      if (!record) return;
      applyFieldEdit(record, field, value as AgentDefinition[typeof field]);
    },

    // ── Dedicated actions for complex fields ──────────────────────────────────

    setAgentMessages(
      state,
      action: PayloadAction<{
        id: string;
        messages: AgentDefinition["messages"];
      }>,
    ) {
      const record = state.agents[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "messages", action.payload.messages);
    },

    setAgentSettings(
      state,
      action: PayloadAction<{
        id: string;
        settings: AgentDefinition["settings"];
      }>,
    ) {
      const record = state.agents[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "settings", action.payload.settings);
    },

    setAgentVariableDefinitions(
      state,
      action: PayloadAction<{
        id: string;
        variableDefinitions: AgentDefinition["variableDefinitions"];
      }>,
    ) {
      const record = state.agents[action.payload.id];
      if (!record) return;
      applyFieldEdit(
        record,
        "variableDefinitions",
        action.payload.variableDefinitions,
      );
    },

    /**
     * Bind or unbind a model control to a variable in ONE edit (one undo step):
     * the settings literal and the variable definitions move together.
     * See features/agents/utils/control-variables.ts.
     */
    setAgentControlBinding(
      state,
      action: PayloadAction<{
        id: string;
        settings: AgentDefinition["settings"];
        variableDefinitions: AgentDefinition["variableDefinitions"];
      }>,
    ) {
      const record = state.agents[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "settings", action.payload.settings);
      applyFieldEdit(
        record,
        "variableDefinitions",
        action.payload.variableDefinitions,
      );
    },

    setAgentContextPolicies(
      state,
      action: PayloadAction<{
        id: string;
        contextPolicies: AgentDefinition["contextPolicies"];
      }>,
    ) {
      const record = state.agents[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "contextPolicies", action.payload.contextPolicies);
    },

    setAgentTools(
      state,
      action: PayloadAction<{ id: string; tools: AgentDefinition["tools"] }>,
    ) {
      const record = state.agents[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "tools", action.payload.tools);
    },

    setAgentCustomTools(
      state,
      action: PayloadAction<{
        id: string;
        customTools: AgentDefinition["customTools"];
      }>,
    ) {
      const record = state.agents[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "customTools", action.payload.customTools);
    },

    setAgentMcpServers(
      state,
      action: PayloadAction<{
        id: string;
        mcpServers: AgentDefinition["mcpServers"];
      }>,
    ) {
      const record = state.agents[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "mcpServers", action.payload.mcpServers);
    },

    /**
     * Per-agent skill exposure config. The full SkillConfig object is
     * replaced atomically; the picker UI computes the next value and
     * dispatches once. Marked dirty so the next save flushes it through
     * to `agent.definition.skill_config`.
     */
    setAgentSkillConfig(
      state,
      action: PayloadAction<{
        id: string;
        skillConfig: AgentDefinition["skillConfig"];
      }>,
    ) {
      const record = state.agents[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "skillConfig", action.payload.skillConfig);
    },

    setAgentModelTiers(
      state,
      action: PayloadAction<{
        id: string;
        modelTiers: AgentDefinition["modelTiers"];
      }>,
    ) {
      const record = state.agents[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "modelTiers", action.payload.modelTiers);
    },

    setAgentOutputSchema(
      state,
      action: PayloadAction<{
        id: string;
        outputSchema: AgentDefinition["outputSchema"];
      }>,
    ) {
      const record = state.agents[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "outputSchema", action.payload.outputSchema);
    },

    /**
     * Model-gated UI flags (FE-only). The full UiGates object is replaced
     * atomically; the gate editor computes the next value and dispatches once.
     * Persisted to `agent.definition.ui_gates` — never sent to the server.
     */
    setAgentUiGates(
      state,
      action: PayloadAction<{
        id: string;
        uiGates: AgentDefinition["uiGates"];
      }>,
    ) {
      const record = state.agents[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "uiGates", action.payload.uiGates);
    },

    /**
     * Matrx Directives apply config. Replaced atomically by the Matrx Directives tab;
     * persisted to `agent.definition.matrx_actions`. Read by aidream's output-directive
     * dispatcher (full rebrand of the retired settings["output_apply"]).
     */
    setAgentMatrxDirectives(
      state,
      action: PayloadAction<{
        id: string;
        matrxDirectives: AgentDefinition["matrxDirectives"];
      }>,
    ) {
      const record = state.agents[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "matrxDirectives", action.payload.matrxDirectives);
    },

    // ── Dirty / history management ────────────────────────────────────────────

    /** Reset one field to its original value from _fieldHistory. */
    resetAgentField(
      state,
      action: PayloadAction<{ id: string; field: keyof AgentDefinition }>,
    ) {
      const { id, field } = action.payload;
      const record = state.agents[id];
      if (!record || !hasField(record._dirtyFields, field)) return;

      const original = record._fieldHistory[field];
      if (original !== undefined) {
        assignField(record, field, original);
      }
      removeField(record._dirtyFields, field);
      delete record._fieldHistory[field];
      record._dirty = fieldFlagsSize(record._dirtyFields) > 0;
    },

    /** Reset ALL dirty fields to their original values. No refetch needed. */
    resetAllAgentFields(state, action: PayloadAction<{ id: string }>) {
      const record = state.agents[action.payload.id];
      if (!record) return;
      (Object.keys(record._fieldHistory) as (keyof AgentDefinition)[]).forEach(
        (field) => {
          const original = record._fieldHistory[field];
          if (original !== undefined) {
            assignField(record, field, original);
          }
        },
      );
      markAgentRecordClean(record);
    },

    /** Called after a successful save. Current values become the new clean baseline. */
    markAgentSaved(state, action: PayloadAction<{ id: string }>) {
      const record = state.agents[action.payload.id];
      if (!record) return;
      markAgentRecordClean(record);
    },

    /**
     * A SINGLE field was written to the database (inline edits such as the
     * Agent Info Editor's name). Only that field becomes the clean baseline —
     * every other staged edit (e.g. an Output Schema kind binding applied in
     * Model Settings) must stay dirty so the main Save still persists it.
     * `markAgentSaved` here used to wipe every dirty flag, silently dropping
     * unrelated staged edits (feedback 222a2925).
     */
    markAgentFieldSaved(
      state,
      action: PayloadAction<{ id: string; field: keyof AgentDefinition }>,
    ) {
      const { id, field } = action.payload;
      const record = state.agents[id];
      if (!record) return;
      removeField(record._dirtyFields, field);
      delete record._fieldHistory[field];
      record._undoPast = record._undoPast.filter((e) => e.field !== field);
      record._undoFuture = record._undoFuture.filter((e) => e.field !== field);
      record._dirty = fieldFlagsSize(record._dirtyFields) > 0;
    },

    /** Save failed — restore from the snapshot taken before the optimistic write. */
    rollbackAgentOptimisticUpdate(
      state,
      action: PayloadAction<{ id: string; snapshot: FieldSnapshot }>,
    ) {
      const { id, snapshot } = action.payload;
      const record = state.agents[id];
      if (!record) return;
      (Object.keys(snapshot) as (keyof AgentDefinition)[]).forEach((field) => {
        const value = snapshot[field];
        if (value !== undefined) {
          assignField(record, field, value);
        }
      });
      record._dirty = fieldFlagsSize(record._dirtyFields) > 0;
    },

    // ── Undo / Redo ──────────────────────────────────────────────────────────

    /**
     * Pops the most recent entry from _undoPast, pushes current value to
     * _undoFuture, and restores the previous value. Also maintains dirty tracking.
     */
    undoAgentEdit(state, action: PayloadAction<{ id: string }>) {
      const record = state.agents[action.payload.id];
      if (!record || record._undoPast.length === 0) return;

      const entry = record._undoPast.pop();
      if (!entry) return;
      const currentValue = record[
        entry.field
      ] as AgentDefinition[keyof AgentDefinition];
      record._undoFuture.push({
        field: entry.field,
        value: currentValue,
        timestamp: Date.now(),
        byteEstimate: estimateBytes(currentValue),
      });

      assignField(record, entry.field, entry.value);

      // Recalculate dirty state: compare against _fieldHistory (the clean baseline)
      const originalValue = record._fieldHistory[entry.field];
      if (originalValue !== undefined && isEqual(entry.value, originalValue)) {
        removeField(record._dirtyFields, entry.field);
        delete record._fieldHistory[entry.field];
      } else if (!hasField(record._dirtyFields, entry.field)) {
        addField(record._dirtyFields, entry.field);
      }
      record._dirty = fieldFlagsSize(record._dirtyFields) > 0;
    },

    /**
     * Pops the most recent entry from _undoFuture, pushes current value to
     * _undoPast, and applies the redo value. Also maintains dirty tracking.
     */
    redoAgentEdit(state, action: PayloadAction<{ id: string }>) {
      const record = state.agents[action.payload.id];
      if (!record || record._undoFuture.length === 0) return;

      const entry = record._undoFuture.pop();
      if (!entry) return;
      const currentValue = record[
        entry.field
      ] as AgentDefinition[keyof AgentDefinition];
      record._undoPast.push({
        field: entry.field,
        value: currentValue,
        timestamp: Date.now(),
        byteEstimate: estimateBytes(currentValue),
      });

      assignField(record, entry.field, entry.value);

      addField(record._dirtyFields, entry.field);
      record._dirty = true;
    },

    /** Clears the undo/redo stacks without affecting the current state. */
    clearAgentUndoHistory(state, action: PayloadAction<{ id: string }>) {
      const record = state.agents[action.payload.id];
      if (!record) return;
      record._undoPast = [];
      record._undoFuture = [];
    },

  },
});

export const {
  setAgentField,
  setAgentMessages,
  setAgentSettings,
  setAgentVariableDefinitions,
  setAgentControlBinding,
  setAgentContextPolicies,
  setAgentTools,
  setAgentCustomTools,
  setAgentMcpServers,
  setAgentSkillConfig,
  setAgentModelTiers,
  setAgentOutputSchema,
  setAgentUiGates,
  setAgentMatrxDirectives,
  resetAgentField,
  resetAllAgentFields,
  markAgentSaved,
  markAgentFieldSaved,
  rollbackAgentOptimisticUpdate,
  undoAgentEdit,
  redoAgentEdit,
  clearAgentUndoHistory,
} = agentBuilderSlice.actions;

const BUILDER_PREFIX = `${agentBuilderSlice.name}/`;

/**
 * Composes the builder's edit reducers onto chat's `agentDefinition` reducer:
 * chat's reducer runs first for every action, then an `agentBuilder/*` action
 * is applied to the same state. One holder, two owners of different verbs.
 */
export function withAgentBuilderEdits(
  base: Reducer<AgentDefinitionSliceState>,
): Reducer<AgentDefinitionSliceState> {
  return (state, action: UnknownAction) => {
    const next = base(state, action);
    return action.type.startsWith(BUILDER_PREFIX)
      ? agentBuilderSlice.reducer(next, action)
      : next;
  };
}

/** chat's agentDefinition reducer with the builder's edits composed on — the app's reducer for that key. */
export const agentDefinitionWithBuilderReducer = withAgentBuilderEdits(agentDefinitionReducer);
