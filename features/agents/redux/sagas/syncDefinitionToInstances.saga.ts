/**
 * syncDefinitionToInstances — Builder Definition Sync Saga
 *
 * Problem it solves:
 *   When the agent builder is open, the user edits the agent definition
 *   (variables, settings) while an execution instance already exists in Redux.
 *   Because instances snapshot agent data at creation time, definition edits
 *   are invisible to the running instance until a full page refresh.
 *
 * Solution:
 *   Watch for the two dedicated actions that mutate definition fields relevant
 *   to the instance UI, debounce them to avoid flooding on rapid edits, then
 *   atomically patch the affected slices in every live instance for that agent.
 *
 * Design rules — this saga intentionally does NOT watch:
 *   - setAgentMessages     — fires on every keystroke; instance UI doesn't render messages
 *   - setAgentField        — generic catch-all; mostly ignored. EXCEPTION: the
 *                            model swap (field "modelId") flows through it and
 *                            IS watched (handleModelChanged) so the instance
 *                            base model stays in sync with the agent.
 *   - upsertAgent          — full server refresh; next startNewConversation re-snapshots
 *   - mergePartialAgent    — same reason as upsertAgent
 *   - setAgentTools / setAgentContextPolicies / etc. — not rendered by instance UI
 *
 * Performance:
 *   In production the loop iterates over active instances; for any agent that
 *   isn't currently open in the builder the match count is zero and no puts
 *   are dispatched. In the builder there is exactly one matching instance.
 *
 * Pattern note:
 *   This saga is the canonical example of cross-slice sync in this codebase.
 *   When adding similar sync requirements for other features:
 *     1. Add a targeted "update only X" reducer to the destination slice
 *     2. Watch the narrowest possible set of source action types
 *     3. Debounce if the source can fire on rapid user input
 *     4. Select state inside the handler (after debounce) for freshness
 *     5. Fork the watcher from rootSaga
 */

import { selectAgentById } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { debounce, put, select, takeEvery } from "redux-saga/effects";
import type { ChatRootState } from "@ai-matrx/chat/store/root-state";
import {
  mergePartialAgent,
  upsertAgent,
} from "@ai-matrx/chat/agents/redux/agent-definition/slice";
import { updateInstanceDefinitions } from "@ai-matrx/chat/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { updateBaseSettings } from "@ai-matrx/chat/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import { buildInstanceBaseSettings } from "@ai-matrx/chat/agents/redux/execution-system/instance-model-overrides/base-settings";
import { updateBaseInputCapabilities } from "@ai-matrx/chat/agents/redux/execution-system/instance-input-capabilities/instance-input-capabilities.slice";

import {
  setAgentVariableDefinitions, setAgentSettings, setAgentField, setAgentUiGates, setAgentControlBinding, undoAgentEdit, redoAgentEdit, resetAgentField, resetAllAgentFields,
} from "@/features/agents/redux/agent-builder.slice";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * How long to wait after the last action before propagating to instances.
 * 300 ms is fast enough to feel live but absorbs rapid typing in variable
 * name / description fields without flooding the store.
 */
const DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function* handleVariableDefinitionsChanged(
  action: ReturnType<typeof setAgentVariableDefinitions>,
): Generator {
  const { id: agentId, variableDefinitions } = action.payload;

  // Read state after the debounce window — guaranteed to be the latest value.
  const state = (yield select()) as ChatRootState;
  const allIds = state.conversations.allConversationIds;
  const byId = state.conversations.byConversationId;

  for (const conversationId of allIds) {
    if (byId[conversationId]?.agentId === agentId) {
      yield put(
        updateInstanceDefinitions({
          conversationId,
          definitions: variableDefinitions ?? [],
        }),
      );
    }
  }
}

function* handleSettingsChanged(
  action: ReturnType<typeof setAgentSettings>,
): Generator {
  const { id: agentId, settings } = action.payload;

  const state = (yield select()) as ChatRootState;
  // updateBaseSettings REPLACES baseSettings wholesale, so re-fold the current
  // model to preserve the override delta guard.
  const agent = selectAgentById(state, agentId);
  const modelId = agent?.modelId;
  const allIds = state.conversations.allConversationIds;
  const byId = state.conversations.byConversationId;

  for (const conversationId of allIds) {
    if (byId[conversationId]?.agentId === agentId) {
      yield put(
        updateBaseSettings({
          conversationId,
          baseSettings: buildInstanceBaseSettings(settings, modelId),
        }),
      );
    }
  }
}

/**
 * The model lives on `agent.modelId` (separate from settings) and changes via
 * `setAgentField({ field: "modelId" })`. Keep each live instance's base model
 * in sync so the override delta guard stays correct after a builder model swap.
 */
function* handleModelChanged(
  action: ReturnType<typeof setAgentField>,
): Generator {
  if (action.payload.field !== "modelId") return;
  const agentId = action.payload.id;

  const state = (yield select()) as ChatRootState;
  const agent = selectAgentById(state, agentId);
  const allIds = state.conversations.allConversationIds;
  const byId = state.conversations.byConversationId;

  for (const conversationId of allIds) {
    if (byId[conversationId]?.agentId === agentId) {
      yield put(
        updateBaseSettings({
          conversationId,
          baseSettings: buildInstanceBaseSettings(
            agent?.settings,
            agent?.modelId,
          ),
        }),
      );
    }
  }
}

/**
 * Edits that change settings and/or variable definitions WITHOUT going through
 * the two dedicated actions above: binding a control to a run input (and
 * back), undo / redo, field resets, and a generic setAgentField on either
 * field. Each re-reads the record after the debounce and re-syncs BOTH the
 * live instance's variable definitions and its base settings — before this,
 * unbinding Quality left the builder's test run offering a "Quality" input the
 * agent no longer had.
 */
const RESYNC_FIELDS = new Set(["settings", "variableDefinitions"]);

export function* handleDefinitionResync(action: {
  type: string;
  payload: { id: string; field?: string };
}): Generator {
  if (
    action.type === setAgentField.type &&
    !RESYNC_FIELDS.has(String(action.payload.field))
  ) {
    return;
  }
  const agentId = action.payload.id;
  const state = (yield select()) as ChatRootState;
  const agent = selectAgentById(state, agentId);
  if (!agent) return;
  const allIds = state.conversations.allConversationIds;
  const byId = state.conversations.byConversationId;

  for (const conversationId of allIds) {
    if (byId[conversationId]?.agentId !== agentId) continue;
    yield put(
      updateInstanceDefinitions({
        conversationId,
        definitions: agent.variableDefinitions ?? [],
      }),
    );
    yield put(
      updateBaseSettings({
        conversationId,
        baseSettings: buildInstanceBaseSettings(agent.settings, agent.modelId),
      }),
    );
  }
}

function* handleUiGatesChanged(
  action: ReturnType<typeof setAgentUiGates>,
): Generator {
  const { id: agentId, uiGates } = action.payload;
  const state = (yield select()) as ChatRootState;
  const allIds = state.conversations.allConversationIds;
  const byId = state.conversations.byConversationId;

  for (const conversationId of allIds) {
    if (byId[conversationId]?.agentId === agentId) {
      yield put(
        updateBaseInputCapabilities({
          conversationId,
          base: uiGates ?? {},
        }),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Watcher — forked from rootSaga
// ---------------------------------------------------------------------------

/**
 * An instance can be minted from a list-only agent record (no settings yet),
 * so its base lacks the agent's CLASS pin. When the agent's settings arrive,
 * give every instance still on the agent's own model that class — the server
 * already runs it (settings.offering_id), and the picker/pill must name it.
 * Only fills a missing pin; never touches an instance's own overrides.
 */
function* handleAgentSettingsLoaded(action: {
  type: string;
  payload: { id: string };
}): Generator {
  const agentId = action.payload.id;
  const state = (yield select()) as ChatRootState;
  const agent = selectAgentById(state, agentId);
  const pin = (agent?.settings as { offering_id?: unknown } | undefined)?.offering_id;
  if (!agent?.modelId || typeof pin !== "string" || !pin) return;
  const byId = state.conversations.byConversationId;
  for (const conversationId of state.conversations.allConversationIds) {
    if (byId[conversationId]?.agentId !== agentId) continue;
    const entry = state.instanceModelOverrides?.byConversationId?.[conversationId];
    const base = entry?.baseSettings;
    if (!base || base.model !== agent.modelId || base.offering_id) continue;
    yield put(
      updateBaseSettings({
        conversationId,
        baseSettings: { ...base, offering_id: pin },
      }),
    );
  }
}

export function* watchDefinitionChanges(): Generator {
  yield takeEvery([mergePartialAgent.type, upsertAgent.type], handleAgentSettingsLoaded);
  yield debounce(
    DEBOUNCE_MS,
    setAgentVariableDefinitions.type,
    handleVariableDefinitionsChanged,
  );
  yield debounce(DEBOUNCE_MS, setAgentSettings.type, handleSettingsChanged);
  yield debounce(DEBOUNCE_MS, setAgentUiGates.type, handleUiGatesChanged);
  // setAgentField is a generic catch-all (normally NOT watched), but a model
  // swap flows through it and must keep the instance base model in sync. The
  // handler early-returns for every non-model field, so this is cheap.
  yield takeEvery(setAgentField.type, handleModelChanged);
  yield debounce(
    DEBOUNCE_MS,
    [
      setAgentControlBinding.type,
      undoAgentEdit.type,
      redoAgentEdit.type,
      resetAgentField.type,
      resetAllAgentFields.type,
      setAgentField.type,
    ],
    handleDefinitionResync,
  );
}
