/**
 * Conversation-mode thunks — save, reopen, and clear a conversation battle.
 *
 * A conversation battle is one SOURCE conversation and N durable server forks
 * of it. Every fork is already a real conversation, so saving the battle only
 * records which forks belong to it (entries) and which conversation they were
 * forked from (set metadata). Nothing is copied, re-sent, or re-forked on
 * reopen: each fork is loaded exactly as it is in chat history.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { destroyInstance } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import {
  loadComparisonSet,
  type UpsertEntryInput,
} from "@/features/agent-comparison/service/comparisonSetsService";
import { createBattlePersistence } from "@/features/agent-comparison/shared/battlePersistence";
import {
  resetConversationBattle,
  setActiveConversationSet,
  setConversationBattleSource,
  setConversationForks,
} from "./slice";
import type { ConversationBattleFork } from "../types";

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PersistedForkMeta {
  label: string;
}

interface ConversationSetMetadata {
  mode: "conversation";
  source: { conversation_id: string; title: string | null; agent_id: string | null } | null;
}

/** The agent a fork answers with: its own record, else the source's. */
function forkAgentId(state: RootState, conversationId: string): string | null {
  const own = state.conversations.byConversationId[conversationId]?.agentId;
  if (own && UUID.test(own)) return own;
  const fallback = state.agentComparisonConversation.source?.agentId;
  return fallback && UUID.test(fallback) ? fallback : null;
}

function buildEntries(state: RootState): UpsertEntryInput[] {
  const forks = state.agentComparisonConversation.forks;
  const missing = forks.filter((f) => !forkAgentId(state, f.conversationId));
  if (missing.length > 0) {
    // Every saved column names its agent (the entries table requires it).
    // Refuse by name instead of saving a battle that silently drops a fork.
    throw new Error(
      `${missing.map((f) => f.label).join(", ")} has no agent on record yet, so the battle cannot be saved. Reload the fork and save again.`,
    );
  }
  return forks.map((fork, idx) => ({
    conversationId: fork.conversationId,
    displayOrder: idx,
    agentId: forkAgentId(state, fork.conversationId) as string,
    agentVersion: null,
    agentVersionSnapshotId: null,
    metadata: { label: fork.label } satisfies PersistedForkMeta,
  }));
}

function buildMetadata(state: RootState): Record<string, unknown> {
  const source = state.agentComparisonConversation.source;
  const meta: ConversationSetMetadata = {
    mode: "conversation",
    source: source
      ? {
          conversation_id: source.conversationId,
          title: source.title ?? null,
          agent_id: source.agentId ?? null,
        }
      : null,
  };
  return meta as unknown as Record<string, unknown>;
}

const conversationPersistence = createBattlePersistence({
  typePrefix: "agentComparisonConversation",
  modeLabel: "Conversation battle",
  selectActiveSetId: (state) => state.agentComparisonConversation.activeSetId,
  selectActiveSetName: (state) =>
    state.agentComparisonConversation.activeSetName,
  selectNamingAgentId: (state) =>
    state.agentComparisonConversation.source?.agentId ?? null,
  buildMetadata,
  buildEntries,
  setActive: setActiveConversationSet,
});

/** Create this battle on first call; afterwards keep its forks current. */
export const persistConversationBattle = conversationPersistence.persist;
export const renameConversationBattle = conversationPersistence.rename;

/** Empty the page. The forks stay in chat history; a saved battle stays saved. */
export const clearConversationBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonConversation/clear",
  async (_arg, { dispatch, getState }) => {
    for (const fork of getState().agentComparisonConversation.forks) {
      dispatch(destroyInstance(fork.conversationId));
    }
    dispatch(resetConversationBattle());
  },
);

/**
 * Reopen a saved conversation battle: its source, and every fork loaded from
 * the server as it is now. A fork that cannot be loaded keeps its column with
 * the error and a retry, exactly like a freshly created fork.
 */
export const loadConversationBattleSet = createAsyncThunk<
  void,
  { setId: string },
  ThunkApi
>(
  "agentComparisonConversation/loadSet",
  async ({ setId }, { dispatch }) => {
    await dispatch(clearConversationBattle()).unwrap();

    const { set, entries } = await loadComparisonSet(setId);
    const meta = (set.metadata ?? {}) as Partial<ConversationSetMetadata>;
    if (meta.mode !== "conversation") {
      throw new Error(
        `"${set.name}" is not a conversation battle (mode=${String(meta.mode ?? "?")}).`,
      );
    }

    if (meta.source) {
      dispatch(
        setConversationBattleSource({
          conversationId: meta.source.conversation_id,
          title: meta.source.title,
          updatedAt: set.updated_at,
          agentId: meta.source.agent_id,
        }),
      );
    }

    const forks: ConversationBattleFork[] = [];
    for (const entry of entries) {
      const label =
        (entry.metadata as Partial<PersistedForkMeta> | null)?.label ??
        `Fork ${forks.length + 1}`;
      const fork: ConversationBattleFork = {
        columnId: crypto.randomUUID(),
        conversationId: entry.conversation_id,
        label,
      };
      try {
        await dispatch(
          loadConversation({
            conversationId: entry.conversation_id,
            expectMaterialized: true,
          }),
        ).unwrap();
      } catch (err) {
        fork.loadError = err instanceof Error ? err.message : String(err);
      }
      forks.push(fork);
    }

    // Next fork continues the numbering the saved forks used.
    const highest = forks.reduce((max, f) => {
      const n = Number(/(\d+)$/.exec(f.label)?.[1] ?? 0);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);
    dispatch(setConversationForks({ forks, nextForkNumber: highest + 1 }));
    dispatch(setActiveConversationSet({ id: set.id, name: set.name }));
  },
);
