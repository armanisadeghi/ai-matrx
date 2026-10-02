// features/agents/redux/execution-system/instance-ui-state/run-configuration-persist.ts
//
// THE RUN CONFIGURATION SURVIVES A REOPEN (table stakes — never lose what the
// person set). Tools, skills and MCP servers a person adds to ONE
// conversation (`builderAdvancedSettings.addedTools / addedSkills /
// addedMcpServers`) lived only in Redux: reopening the conversation from
// history showed Tools 0 / Skills 0 and the next turn ran without them (phone
// run PB-08 #2, 2026-10-01).
//
// Stored at `chat.conversation.metadata.run_configuration`, written through
// `mergeJsonColumn` (the guarded jsonb merge — never a bare spread), read back
// by `loadConversation`.
//
// Why a middleware and not each picker: six surfaces write these lists
// (RunToolPicker, RunSkillPicker, ShapeChipsRow, ComposerConnectorsPanel,
// AiWorkComposer, RagSearchExperience); a seventh would silently not persist.
// One choke point watches the state instead.
//
// Timing: the server rewrites the WHOLE `metadata` object from the copy it
// read at turn start (matrx-ai coordinator, flushed asynchronously at stream
// end), so a write during a turn can be overwritten. The middleware therefore
// writes only while the conversation is idle, and re-asserts after every
// completed turn (after TURN_SETTLE_MS) — the write reads first and is a no-op
// when the stored value already matches.

import type { Middleware } from "@reduxjs/toolkit";
import { mergeJsonColumn } from "@ai-matrx/data/db";
import type { ChatRootState } from "../../../../store/root-state";
import { supabase } from "@host/utils/supabase/client";
import { setInstanceStatus } from "../conversations/conversations.slice";

export const RUN_CONFIGURATION_KEY = "run_configuration";
const EDIT_DEBOUNCE_MS = 1500;
const TURN_SETTLE_MS = 4000;

export interface PersistedRunConfiguration {
  addedTools: string[];
  addedSkills: string[];
  addedMcpServers: string[];
}

const EMPTY: PersistedRunConfiguration = {
  addedTools: [],
  addedSkills: [],
  addedMcpServers: [],
};

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.length > 0)
    : [];
}

/** Read `metadata.run_configuration` off a conversation row; null when absent. */
export function parsePersistedRunConfiguration(
  metadata: unknown,
): PersistedRunConfiguration | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>)[RUN_CONFIGURATION_KEY];
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    addedTools: strings(r.added_tools),
    addedSkills: strings(r.added_skills),
    addedMcpServers: strings(r.added_mcp_servers),
  };
}

function toStored(config: PersistedRunConfiguration) {
  return {
    added_tools: config.addedTools,
    added_skills: config.addedSkills,
    added_mcp_servers: config.addedMcpServers,
  };
}

export function runConfigurationSignature(config: PersistedRunConfiguration): string {
  return JSON.stringify([
    [...config.addedTools].sort(),
    [...config.addedSkills].sort(),
    [...config.addedMcpServers].sort(),
  ]);
}

export function selectRunConfiguration(
  state: ChatRootState,
  conversationId: string,
): PersistedRunConfiguration {
  const s =
    state.instanceUIState?.byConversationId[conversationId]?.builderAdvancedSettings;
  if (!s) return EMPTY;
  return {
    addedTools: s.addedTools ?? [],
    addedSkills: s.addedSkills ?? [],
    addedMcpServers: s.addedMcpServers ?? [],
  };
}

type ConversationRow = { id: string; version: number; metadata: unknown };

/**
 * Write the configuration unless the row already holds it. Returns the
 * outcome so the caller can report it; never throws.
 */
export async function persistRunConfiguration(
  conversationId: string,
  config: PersistedRunConfiguration,
): Promise<"saved" | "unchanged" | "not_found" | "conflict" | "error"> {
  const wanted = runConfigurationSignature(config);
  let unchanged = false;
  const result = await mergeJsonColumn<ConversationRow>({
    fetchCurrent: () =>
      supabase
        .schema("chat")
        .from("conversation")
        .select("id,version,metadata")
        .eq("id", conversationId)
        .maybeSingle(),
    readColumn: (row) => row.metadata,
    merge: (current) => {
      const stored = parsePersistedRunConfiguration(current);
      unchanged =
        (stored ? runConfigurationSignature(stored) : runConfigurationSignature(EMPTY)) ===
        wanted;
      return { ...current, [RUN_CONFIGURATION_KEY]: toStored(config) };
    },
    applyUpdate: ({ value, expectedVersion, nextVersion }) =>
      supabase
        .schema("chat")
        .from("conversation")
        .update({ metadata: value as never, version: nextVersion })
        .eq("id", conversationId)
        .eq("version", expectedVersion)
        .select("id,version,metadata")
        .maybeSingle(),
  });
  if (result.status === "saved") return unchanged ? "unchanged" : "saved";
  if (result.status === "error") {
    console.error(
      `[run-configuration] could not save the tools/skills added to conversation ${conversationId} — they will not be restored on reopen`,
      result.error,
    );
  } else if (result.status === "conflict") {
    console.error(
      `[run-configuration] save for conversation ${conversationId} lost every version race — retrying after the next turn`,
    );
  }
  return result.status;
}

/** Conversations whose stored configuration may lag Redux. */
function isPersistable(state: ChatRootState, conversationId: string): boolean {
  const record = state.conversations?.byConversationId[conversationId];
  if (!record || record.cacheOnly || record.isEphemeral) return false;
  return !(
    record.status === "running" ||
    record.status === "streaming" ||
    record.status === "paused"
  );
}

/**
 * Seed the "already stored" signature for a conversation just read from the
 * database, so restoring it does not cost a write.
 */
const storedSignature = new Map<string, string>();
export function markRunConfigurationStored(
  conversationId: string,
  config: PersistedRunConfiguration,
): void {
  storedSignature.set(conversationId, runConfigurationSignature(config));
}

export const runConfigurationPersistMiddleware: Middleware<object, ChatRootState> = (store) => {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const lastSeen = new Map<string, string>();
  let lastUiState: unknown = undefined;

  const schedule = (conversationId: string, delay: number) => {
    const existing = timers.get(conversationId);
    if (existing) clearTimeout(existing);
    timers.set(
      conversationId,
      setTimeout(() => {
        timers.delete(conversationId);
        const state = store.getState();
        if (!isPersistable(state, conversationId)) return;
        const config = selectRunConfiguration(state, conversationId);
        const sig = runConfigurationSignature(config);
        // Nothing was ever added and nothing was ever stored: no write.
        if (!storedSignature.has(conversationId) && sig === runConfigurationSignature(EMPTY)) {
          return;
        }
        void persistRunConfiguration(conversationId, config).then((outcome) => {
          if (outcome === "saved" || outcome === "unchanged") {
            storedSignature.set(conversationId, sig);
          }
        });
      }, delay),
    );
  };

  return (next) => (action) => {
    const result = next(action);
    const state = store.getState();

    if (setInstanceStatus.match(action) && action.payload.status === "complete") {
      const id = action.payload.conversationId;
      const sig = runConfigurationSignature(selectRunConfiguration(state, id));
      // A turn just ended: re-assert after the server's own metadata flush.
      if (storedSignature.has(id) || sig !== runConfigurationSignature(EMPTY)) {
        schedule(id, TURN_SETTLE_MS);
      }
    }

    const uiState = state.instanceUIState?.byConversationId;
    if (uiState === lastUiState) return result;
    lastUiState = uiState;
    if (!uiState) return result;

    for (const id of Object.keys(uiState)) {
      const sig = runConfigurationSignature(selectRunConfiguration(state, id));
      const prior = lastSeen.get(id);
      lastSeen.set(id, sig);
      if (prior === undefined || prior === sig) continue;
      if (storedSignature.get(id) === sig) continue;
      if (isPersistable(state, id)) schedule(id, EDIT_DEBOUNCE_MS);
      // Not persistable yet (no row, or a turn in flight): the turn-complete
      // trigger above picks it up.
    }
    return result;
  };
};
