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
 *   - setAgentTools / setAgentContextSlots / etc. — not rendered by instance UI
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

import { debounce, put, select, takeEvery } from "redux-saga/effects";
import type { RootState } from "@/lib/redux/rootReducer";
import {
  setAgentVariableDefinitions,
  setAgentSettings,
  setAgentField,
} from "../../agent-definition/slice";
import { updateInstanceDefinitions } from "../instance-variable-values/instance-variable-values.slice";
import { updateBaseSettings } from "../instance-model-overrides/instance-model-overrides.slice";
import { buildInstanceBaseSettings } from "../instance-model-overrides/base-settings";

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
  const state = (yield select()) as RootState;
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

  const state = (yield select()) as RootState;
  // updateBaseSettings REPLACES baseSettings wholesale, so we must re-fold the
  // agent's current model — otherwise editing any setting silently drops
  // `model` from the instance base and defeats the override delta guard.
  const modelId = state.agentDefinition.agents?.[agentId]?.modelId;
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

  const state = (yield select()) as RootState;
  const agent = state.agentDefinition.agents?.[agentId];
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

// ---------------------------------------------------------------------------
// Watcher — forked from rootSaga
// ---------------------------------------------------------------------------

export function* watchDefinitionChanges(): Generator {
  yield debounce(
    DEBOUNCE_MS,
    setAgentVariableDefinitions.type,
    handleVariableDefinitionsChanged,
  );
  yield debounce(DEBOUNCE_MS, setAgentSettings.type, handleSettingsChanged);
  // setAgentField is a generic catch-all (normally NOT watched), but a model
  // swap flows through it and must keep the instance base model in sync. The
  // handler early-returns for every non-model field, so this is cheap.
  yield takeEvery(setAgentField.type, handleModelChanged);
}
