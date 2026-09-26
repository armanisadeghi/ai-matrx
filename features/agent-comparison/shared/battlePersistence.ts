/**
 * battlePersistence — the ONE way a battle becomes (and stays) a saved record.
 *
 * A battle's identity is its saved comparison row (`agent.cmp_comparison_sets`)
 * and its columns are that row's entries. Before this module a battle only got
 * an identity when someone clicked Save, so a refresh or a shared link lost it.
 * Now every mode persists on its first Submit all and on every save, through
 * this helper, and the page's URL carries the id.
 *
 * What a mode stores is NOT decided here. Each mode builds its own set
 * metadata (what it holds constant) and its own entries (what varies per
 * column) because every mode moves its request, variables and settings
 * differently. This module only guarantees the write order and the naming.
 */

import { createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import {
  createComparisonSet,
  renameComparisonSet,
  replaceEntries,
  updateComparisonSetMetadata,
  type UpsertEntryInput,
} from "../service/comparisonSetsService";

export interface PersistBattleArgs {
  /** The battle already on screen, or null when it has never been saved. */
  setId: string | null;
  /** Name used only when the battle is created. */
  name: string;
  userId: string;
  metadata: Record<string, unknown>;
  entries: UpsertEntryInput[];
}

export interface PersistedBattle {
  id: string;
  name: string;
  created: boolean;
}

export async function persistBattleSnapshot({
  setId,
  name,
  userId,
  metadata,
  entries,
}: PersistBattleArgs): Promise<PersistedBattle> {
  if (setId) {
    await updateComparisonSetMetadata(setId, metadata);
    await replaceEntries(setId, entries);
    return { id: setId, name, created: false };
  }
  const set = await createComparisonSet({ name, userId, metadata });
  if (entries.length > 0) {
    await replaceEntries(set.id, entries);
  }
  return { id: set.id, name: set.name, created: true };
}

/**
 * A name a person can recognize in the saved list before they rename it:
 * "Quick Test Agent · Model battle · Sep 26, 10:14 PM".
 */
export function autoBattleName(
  modeLabel: string,
  agentName: string | null | undefined,
  now: Date = new Date(),
): string {
  const when = now.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const parts = [agentName?.trim(), modeLabel, when].filter(
    (p): p is string => Boolean(p),
  );
  return parts.join(" · ");
}

/** Human sentence for a failed save, safe to show in a toast. */
export function persistErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return String(err);
}

// =============================================================================
// Per-mode thunks — one factory, so no mode can drift on the write order
// =============================================================================

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

export interface BattlePersistenceConfig {
  /** Redux action-type prefix of the mode, e.g. "agentComparisonModel". */
  typePrefix: string;
  /** Shown in the automatic name, e.g. "Model battle". */
  modeLabel: string;
  selectActiveSetId: (state: RootState) => string | null;
  selectActiveSetName: (state: RootState) => string | null;
  /** The agent the battle is about, used for the automatic name (null for Open mode). */
  selectNamingAgentId: (state: RootState) => string | null;
  /** What this mode holds constant — its own shape, written to the set row. */
  buildMetadata: (state: RootState) => Record<string, unknown>;
  /** What varies per column — its own shape, written as entries. */
  buildEntries: (state: RootState) => UpsertEntryInput[];
  setActive: (
    payload: { id: string; name: string } | null,
  ) => PayloadAction<{ id: string; name: string } | null>;
}

/** Thrown when there is nothing to save; says so instead of writing an empty battle. */
export const NOTHING_TO_SAVE =
  "There is nothing to compare yet: add at least one configured column first.";

export function createBattlePersistence(config: BattlePersistenceConfig) {
  /**
   * Create the battle on first call, then keep its setup and columns current.
   * Refuses (throws) instead of writing a battle with no columns, and instead
   * of emptying a saved battle's columns.
   */
  const persist = createAsyncThunk<PersistedBattle, void, ThunkApi>(
    `${config.typePrefix}/persist`,
    async (_arg, { dispatch, getState }) => {
      const state = getState();
      const userId = selectUserId(state);
      if (!userId) throw new Error("Sign in to save this battle.");
      const entries = config.buildEntries(state);
      if (entries.length === 0) throw new Error(NOTHING_TO_SAVE);

      const setId = config.selectActiveSetId(state);
      const agentId = config.selectNamingAgentId(state);
      const agentName = agentId
        ? (state.agentDefinition.agents?.[agentId]?.name ?? null)
        : null;
      const result = await persistBattleSnapshot({
        setId,
        name: setId
          ? (config.selectActiveSetName(state) ?? config.modeLabel)
          : autoBattleName(config.modeLabel, agentName),
        userId,
        metadata: config.buildMetadata(state),
        entries,
      });
      if (result.created) {
        dispatch(config.setActive({ id: result.id, name: result.name }));
      }
      return result;
    },
  );

  const rename = createAsyncThunk<void, { name: string }, ThunkApi>(
    `${config.typePrefix}/rename`,
    async ({ name }, { dispatch, getState }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("A battle needs a name.");
      const setId = config.selectActiveSetId(getState());
      if (!setId) throw new Error("This battle has not been saved yet.");
      await renameComparisonSet(setId, trimmed);
      dispatch(config.setActive({ id: setId, name: trimmed }));
    },
  );

  return { persist, rename };
}

/**
 * Save the battle as part of Submit all. A failed save never blocks the run —
 * it comes back as a sentence the toolbar shows — except when the person
 * closed the organization picker, which means "not now" for the whole submit.
 */
export async function persistForRun(
  run: () => Promise<PersistedBattle>,
): Promise<{ cancelled: boolean; error: string | null }> {
  try {
    await run();
    return { cancelled: false, error: null };
  } catch (err) {
    if (isOrganizationSelectionCancelled(err)) {
      return { cancelled: true, error: null };
    }
    return { cancelled: false, error: persistErrorMessage(err) };
  }
}

/** What every mode's Submit all resolves with. */
export interface BattleSubmitResult {
  launched: number;
  failed: number;
  skipped: number;
  /** The person closed the organization picker; nothing ran. */
  cancelled?: boolean;
  /** The runs happened but the battle could not be saved — shown to the person. */
  persistError?: string | null;
}
