/**
 * THE PERSON'S CONTEXT RULES — their one home, and the only way to write it.
 *
 * Contract: common-docs systems/scopes-context/context-delivery/RULES.md §3.
 * A rule ("History pane open → off", "Note bundle → inline up to 20,000")
 * lives in `users.user_surface_state` (`feature = "context_rules"`), one row
 * per surface key. The SERVER reads those rows itself on every turn, so a rule
 * can never be forgotten by a later turn, another composer or another device.
 *
 * Three failure classes this file exists to close:
 *   1. A send racing a write — `ensureContextRulesReady` (awaited by every
 *      send path) waits for every in-flight write before the request is built.
 *   2. Two quick changes landing out of order — writes are queued per row and
 *      each write sends the row's LATEST state, so the last change always wins.
 *   3. A failed write leaving the screen showing a rule the server never got —
 *      the rows are reloaded from the database and the failure is announced.
 */

import type { AppThunk, RootState } from "@/lib/redux/store";
import {
  CONTEXT_RULES_FEATURE,
  type SavedContextRule,
  type SavedContextRuleRows,
} from "@ai-matrx/agents/context";
import {
  ensureSurfaceFeatureLoaded,
  surfaceUserStateActions,
} from "@/features/surfaces/redux/userStateSlice";
import { surfaceUserStateService } from "@/features/surfaces/user-state/service";
import { requireUserId } from "@/utils/auth/getUserId";
import { toast } from "@/lib/toast";

const EMPTY_ROWS: SavedContextRuleRows = {};

/** The person's saved rows, as loaded (or optimistically written). */
export const selectSavedContextRuleRows = (state: RootState): SavedContextRuleRows =>
  (state.surfaceUserState.byFeature[CONTEXT_RULES_FEATURE]?.rows as
    | SavedContextRuleRows
    | undefined) ?? EMPTY_ROWS;

/** True once the rows have been read from the database at least once. */
export const selectContextRulesLoaded = (state: RootState): boolean => {
  const f = state.surfaceUserState.byFeature[CONTEXT_RULES_FEATURE];
  return f?.status === "ready" || (f?.fetchedAt ?? null) !== null;
};

/** Per-row write chain: surfaceKey → the promise of its latest queued write. */
const rowChains = new Map<string, Promise<void>>();

/** Resolves once every queued write has settled (success or failure). */
export function awaitContextRuleWrites(): Promise<void> {
  return Promise.all([...rowChains.values()]).then(() => undefined);
}

/**
 * Every send path awaits this before building its request: the rules are
 * loaded and no write is still on its way to the database.
 */
export function ensureContextRulesReady(): AppThunk<Promise<void>> {
  return async (dispatch) => {
    await awaitContextRuleWrites();
    await dispatch(ensureSurfaceFeatureLoaded(CONTEXT_RULES_FEATURE));
  };
}

/**
 * Set (or with `rule: null`, reset) the person's rule for one value.
 * Partial: `{ include: false }` leaves a saved limit alone. A field set to
 * `undefined` is removed from the rule.
 */
export function saveContextRule(args: {
  surfaceKey: string;
  key: string;
  rule: Partial<Record<keyof SavedContextRule, SavedContextRule[keyof SavedContextRule] | undefined>> | null;
}): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { surfaceKey, key, rule } = args;
    const rows = selectSavedContextRuleRows(getState());
    const row: Record<string, SavedContextRule> = { ...(rows[surfaceKey] ?? {}) };
    if (rule === null) {
      delete row[key];
    } else {
      const merged: Record<string, unknown> = { ...(row[key] ?? {}) };
      for (const [field, value] of Object.entries(rule)) {
        if (value === undefined) delete merged[field];
        else merged[field] = value;
      }
      if (Object.keys(merged).length === 0) delete row[key];
      else row[key] = merged as SavedContextRule;
    }
    dispatch(
      surfaceUserStateActions.rowSet({
        feature: CONTEXT_RULES_FEATURE,
        surfaceKey,
        state: row,
      }),
    );
    queueRowWrite(dispatch, getState, surfaceKey);
    await rowChains.get(surfaceKey);
  };
}

/** Reset every rule on one surface row (the chip's "reset all"). */
export function resetContextRules(surfaceKey: string): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    dispatch(
      surfaceUserStateActions.rowSet({
        feature: CONTEXT_RULES_FEATURE,
        surfaceKey,
        state: {},
      }),
    );
    queueRowWrite(dispatch, getState, surfaceKey);
    await rowChains.get(surfaceKey);
  };
}

function queueRowWrite(
  dispatch: Parameters<AppThunk>[0],
  getState: () => RootState,
  surfaceKey: string,
): void {
  const previous = rowChains.get(surfaceKey) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      // The row's state AT WRITE TIME — coalesces every change queued behind
      // an in-flight write, so the database always ends on the last change.
      const latest = selectSavedContextRuleRows(getState())[surfaceKey] ?? {};
      try {
        await surfaceUserStateService.save(
          requireUserId(),
          CONTEXT_RULES_FEATURE,
          surfaceKey,
          latest as Record<string, unknown>,
        );
      } catch (error) {
        console.error("[context-rules] save failed — reloading the saved rules", error);
        toast.error("Your context setting didn't save. Showing what's saved.");
        await dispatch(ensureSurfaceFeatureLoaded(CONTEXT_RULES_FEATURE, true));
      }
    });
  rowChains.set(surfaceKey, next);
  void next.finally(() => {
    if (rowChains.get(surfaceKey) === next) rowChains.delete(surfaceKey);
  });
}
