/**
 * THE PERSON'S CONTEXT RULES — their one home, and the only way to write it.
 *
 * Contract: common-docs systems/scopes-context/context-delivery/RULES.md §3.
 * A rule ("History pane open → off", "Note bundle → inline up to 20,000")
 * lives in `users.user_surface_state` (`feature = "context_rules"`), one row
 * per surface key. The SERVER reads those rows itself on every turn, so a rule
 * can never be forgotten by a later turn, another composer or another device.
 *
 * Failure classes this file exists to close:
 *   1. A send racing a write — `ensureContextRulesReady` (awaited by every
 *      send path) waits for every in-flight write before the request is built.
 *   2. Two quick changes landing out of order — writes are queued per row.
 *   3. Two TABS (or devices) each writing their own copy of the row — every
 *      write is a per-KEY merge into the row the server holds now
 *      (`mergeState` → `mergeJsonColumn`), never a whole-row upsert of this
 *      tab's copy, so tab B setting one value never erases tab A's rule.
 *   4. A table built from a stale copy — every send re-reads the saved rows
 *      before its request is built, so the table and the request reflect what
 *      the server will read; a tab coming back into focus re-reads them too.
 *   5. A failed write leaving the screen showing a rule the server never got —
 *      the rows are reloaded from the database and the failure is announced.
 *   6. No organization chosen — creating the row goes through the same
 *      hold-and-set gate a send uses: the person is asked, then it saves.
 */

import type { AppDispatch, AppThunk, RootState } from "@/lib/redux/store";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import {
  CONTEXT_RULES_FEATURE,
  type SavedContextRule,
  type SavedContextRuleRows,
} from "@ai-matrx/agents/context";
import { surfaceUserStateActions } from "@/features/surfaces/redux/userStateSlice";
import { surfaceUserStateService } from "@/features/surfaces/user-state/service";
import { requireUserId } from "@/utils/auth/getUserId";
import { toast } from "@/lib/toast";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";

const EMPTY_ROWS: SavedContextRuleRows = {};

/** The person's saved rows, as loaded (or optimistically written). */
export const selectSavedContextRuleRows = (state: RootState): SavedContextRuleRows =>
  (state.surfaceUserState?.byFeature[CONTEXT_RULES_FEATURE]?.rows as
    | SavedContextRuleRows
    | undefined) ?? EMPTY_ROWS;

/** True once the rows have been read from the database at least once. */
export const selectContextRulesLoaded = (state: RootState): boolean => {
  const f = state.surfaceUserState?.byFeature[CONTEXT_RULES_FEATURE];
  return f?.status === "ready" || (f?.fetchedAt ?? null) !== null;
};

/** A change to one row, applied to whatever that row holds. */
type RowPatch = (row: Record<string, unknown>) => Record<string, unknown>;

/** Per-row write chain: surfaceKey → the promise of its latest queued write. */
const rowChains = new Map<string, Promise<void>>();
/** Changes made on this screen that the server has not confirmed yet, per row, in order. */
const unconfirmed = new Map<string, RowPatch[]>();

function withUnconfirmed(surfaceKey: string, row: Record<string, unknown>): Record<string, unknown> {
  return (unconfirmed.get(surfaceKey) ?? []).reduce((acc, patch) => patch(acc), row);
}

/** Resolves once every queued write has settled (success or failure). */
export function awaitContextRuleWrites(): Promise<void> {
  return Promise.all([...rowChains.values()]).then(() => undefined);
}

/**
 * Re-read the saved rows from the database, keeping any change this screen
 * has not had confirmed yet on top. A failed read keeps what is shown and says
 * so in the console: the server reads its own rules regardless, and the
 * receipt reports any difference.
 */
let reloadInFlight: Promise<void> | null = null;

export function reloadContextRules(): AppThunk<Promise<void>> {
  return (dispatch) => {
    // Many composers may ask at once (a tab regaining focus): one read serves all.
    if (reloadInFlight) return reloadInFlight;
    reloadInFlight = (async () => {
      let rows: Record<string, Record<string, unknown>>;
      try {
        rows = await surfaceUserStateService.loadFeature(CONTEXT_RULES_FEATURE);
      } catch (error) {
        console.error("[context-rules] could not re-read the saved rules", error);
        return;
      }
      for (const key of unconfirmed.keys()) rows[key] = withUnconfirmed(key, rows[key] ?? {});
      dispatch(surfaceUserStateActions.featureReceived({ feature: CONTEXT_RULES_FEATURE, rows }));
    })().finally(() => {
      reloadInFlight = null;
    });
    return reloadInFlight;
  };
}

/**
 * Every send path awaits this before building its request: no write is still
 * on its way, and the rows are what the database holds NOW (another tab or
 * device may have changed them since this screen loaded).
 */
export function ensureContextRulesReady(conversationId: string): AppThunk<Promise<void>> {
  return async (dispatch) => {
    await awaitContextRuleWrites();
    await Promise.all([
      dispatch(reloadContextRules()),
      dispatch(ensureAgentContextLayer(conversationId)),
    ]);
  };
}

/**
 * The conversation's agent's context layer (Context Policies + kill switch)
 * is loaded — never resolved from a partial (list-fetched) record. A failed
 * read is logged and the request goes out with the layer unknown; the
 * server applies it regardless and the receipt reports any difference.
 */
export function ensureAgentContextLayer(conversationId: string): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const agentId = getState().conversations?.byConversationId[conversationId]?.agentId;
    if (!agentId) return;
    try {
      await (dispatch as AppDispatch)(fetchAgentExecutionMinimal(agentId)).unwrap();
    } catch (error) {
      console.error("[context-rules] could not load the agent's context policies", error);
    }
  };
}

function rulePatch(
  key: string,
  rule: Partial<Record<keyof SavedContextRule, SavedContextRule[keyof SavedContextRule] | undefined>> | null,
): RowPatch {
  return (current) => {
    const row: Record<string, unknown> = { ...current };
    if (rule === null) {
      delete row[key];
      return row;
    }
    const prior = row[key];
    const merged: Record<string, unknown> =
      prior && typeof prior === "object" && !Array.isArray(prior) ? { ...(prior as Record<string, unknown>) } : {};
    for (const [field, value] of Object.entries(rule)) {
      if (value === undefined) delete merged[field];
      else merged[field] = value;
    }
    if (Object.keys(merged).length === 0) delete row[key];
    else row[key] = merged;
    return row;
  };
}

/**
 * Set (or with `rule: null`, reset) the person's rule for one value.
 * Partial: `{ include: false }` leaves a saved limit alone. A field set to
 * `undefined` is removed from the rule. Only this key changes on the server.
 */
export function saveContextRule(args: {
  surfaceKey: string;
  key: string;
  rule: Partial<Record<keyof SavedContextRule, SavedContextRule[keyof SavedContextRule] | undefined>> | null;
}): AppThunk<Promise<void>> {
  return (dispatch, getState) => applyRowPatch(dispatch, getState, args.surfaceKey, rulePatch(args.key, args.rule));
}

/** Reset every rule on one surface row (the chip's "reset all"). */
export function resetContextRules(surfaceKey: string): AppThunk<Promise<void>> {
  return (dispatch, getState) => applyRowPatch(dispatch, getState, surfaceKey, () => ({}));
}

async function applyRowPatch(
  dispatch: Parameters<AppThunk>[0],
  getState: () => RootState,
  surfaceKey: string,
  patch: RowPatch,
): Promise<void> {
  // Optimistic: the screen shows the change at once.
  const shown = selectSavedContextRuleRows(getState())[surfaceKey] ?? {};
  dispatch(
    surfaceUserStateActions.rowSet({
      feature: CONTEXT_RULES_FEATURE,
      surfaceKey,
      state: patch(shown as Record<string, unknown>),
    }),
  );
  unconfirmed.set(surfaceKey, [...(unconfirmed.get(surfaceKey) ?? []), patch]);

  const previous = rowChains.get(surfaceKey) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const settle = () => {
        const list = unconfirmed.get(surfaceKey) ?? [];
        const rest = list.filter((p) => p !== patch);
        if (rest.length === 0) unconfirmed.delete(surfaceKey);
        else unconfirmed.set(surfaceKey, rest);
      };
      try {
        const saved = await surfaceUserStateService.mergeState(
          requireUserId(),
          CONTEXT_RULES_FEATURE,
          surfaceKey,
          patch,
        );
        settle();
        // The row as the server holds it now (another tab's rules included),
        // with this screen's still-queued changes on top.
        dispatch(
          surfaceUserStateActions.rowSet({
            feature: CONTEXT_RULES_FEATURE,
            surfaceKey,
            state: withUnconfirmed(surfaceKey, saved),
          }),
        );
      } catch (error) {
        settle();
        // "Not now" on the organization picker is an answer, not a failure:
        // nothing was saved, so show what is saved, without an error.
        if (!isOrganizationSelectionCancelled(error)) {
          console.error("[context-rules] save failed — reloading the saved rules", error);
          toast.error("Your context setting didn't save. Showing what's saved.");
        }
        await dispatch(reloadContextRules());
      }
    });
  rowChains.set(surfaceKey, next);
  void next.finally(() => {
    if (rowChains.get(surfaceKey) === next) rowChains.delete(surfaceKey);
  });
  await next;
}
