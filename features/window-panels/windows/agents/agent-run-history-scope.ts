/**
 * Runtime scope builder for the `matrx-user/agent-run-history` surface.
 *
 * The window's raw state is a Redux conversation-list cache plus two pieces of
 * component state; the manifest declares a roster, a version grouping, a load
 * state, and one selected run. That derivation lives here rather than inline
 * in the window (the `features/tool-registry/mcp-admin/mcp-servers-scope.ts`
 * pattern) because it is real mapping work: rows are projected to a stable
 * snake_case shape, the version grouping is recomputed, and the transcript
 * carries a deliberate three-way distinction between "not loaded", "loaded and
 * empty", and "loaded with messages".
 *
 * EVERYTHING HERE IS SYNCHRONOUS AND MUST STAY THAT WAY. `getScope` is polled
 * every 400ms for as long as a Surface Context window is open, so a fetch in
 * here would hammer the database behind a panel that looks idle. Every input
 * below is already in the store because the window rendered it.
 *
 * Everything returns through `createAgentRunHistoryScope` so the manifest's
 * required/optional key contract is type-enforced — a UI cannot lie.
 */

import {
  createAgentRunHistoryScope,
  type AgentRunHistoryRow,
  type AgentRunHistoryTranscriptEntry,
  type AgentRunHistoryVersionSummary,
} from "@/features/surfaces/manifests/agent-run-history.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type {
  ConversationListItem,
  ConversationListLoadStatus,
} from "@/features/agents/redux/conversation-list/conversation-list.types";
import {
  extractFlatText,
  selectConversationMessages,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import type { RootState } from "@/lib/redux/store";

/**
 * What the sidebar knows, handed UP to the window's provider.
 *
 * The roster lives in `RunHistorySidebar` (it owns the canonical-agent
 * resolution and the fetch effect), while `agent_id` / the selection live in
 * the window. Lifting the roster into the window would duplicate the selector
 * subscription and remount the sidebar; giving the sidebar its OWN
 * `SurfaceRuntimeProvider` would be worse still — the deepest registered
 * runtime wins WHOLESALE, so a child provider would replace the window's scope
 * entirely and silently drop the selection. So the sidebar publishes a
 * FRAGMENT into a ref the window holds, and the window remains the single
 * publisher of this surface.
 *
 * `null` means "no agent picked / nothing fetched", which is why the builder
 * omits every roster key rather than emitting empty ones: an agent must be
 * able to tell "not looked" from "looked, and this agent has never run".
 */
export interface AgentRunHistorySnapshot {
  /** The parent id the roster is actually fetched under. */
  canonicalAgentId: string;
  status: ConversationListLoadStatus;
  error: string | null;
  fetchedAt: string | null;
  conversations: ConversationListItem[];
  /** Newest version first — the sidebar's own grouping, already computed. */
  versionGroups: readonly { versionNumber: number; count: number }[];
}

/** Roster-row projection — mirrors the row the sidebar renders. */
export function toRunHistoryRow(c: ConversationListItem): AgentRunHistoryRow {
  return {
    conversation_id: c.conversationId,
    title: c.title,
    status: c.status,
    updated_at: c.updatedAt,
    created_at: c.createdAt,
    message_count: c.messageCount,
    agent_version_number: c.agentVersionNumber,
    last_model_id: c.lastModelId,
    origin_class: c.originClass,
    source_app: c.sourceApp,
    source_feature: c.sourceFeature,
    is_favorite: c.isFavorite,
    excluded_from_kg: c.excludeFromKg,
  };
}

/**
 * Flatten the open run's transcript, or report that it has not loaded.
 *
 * The three-way answer matters more here than on most surfaces, because the
 * pane renders an empty transcript identically whether the run is empty or
 * still loading:
 *
 *   - `undefined` → not loaded. The roster row says this run HAS messages but
 *     the message store has none for it yet, so the key is OMITTED.
 *   - `[]`        → loaded, and this run genuinely has no messages.
 *   - entries     → loaded.
 *
 * Both facts are already in hand and neither costs a fetch: the roster row's
 * `message_count` is the server's count, and the store either holds the
 * messages or does not.
 *
 * Raw `content` blocks and tool-call payloads are dropped on purpose — see the
 * manifest header. A single tool result can be megabytes, and this runs on a
 * 400ms poll.
 */
export function readSelectedRunTranscript(
  state: RootState,
  conversationId: string | null,
  rowMessageCount: number | undefined,
): AgentRunHistoryTranscriptEntry[] | undefined {
  if (!conversationId) return undefined;

  const messages = selectConversationMessages(conversationId)(state);
  if (messages.length > 0) {
    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: extractFlatText(m),
    }));
  }

  // Nothing in the store. Only call that "loaded, and empty" when the roster
  // agrees the run has no messages; otherwise it is still on its way.
  if (rowMessageCount === 0) return [];
  return undefined;
}

/**
 * Build the live payload. Sampled on the Surface Context poll and at Run time,
 * never on mount — `history` is read from a ref so the sample is always
 * current.
 */
export function buildAgentRunHistoryScope(input: {
  agentId: string | null;
  agentName: string | null;
  selectedConversationId: string | null;
  history: AgentRunHistorySnapshot | null;
  /** Transcript for the open run, already resolved through the reader above. */
  transcript: AgentRunHistoryTranscriptEntry[] | undefined;
}): SurfaceScopePayload {
  const { agentId, agentName, selectedConversationId, history, transcript } =
    input;

  // No agent picked: the window is open and honest about knowing nothing.
  if (!agentId || !history) {
    return createAgentRunHistoryScope({
      agent_id: agentId ?? undefined,
      agent_name: agentName ?? undefined,
      selected_conversation_id: selectedConversationId ?? undefined,
    });
  }

  const { conversations, status, error, fetchedAt, versionGroups } = history;
  const loaded = status === "succeeded" || status === "failed";

  const rows = conversations.map(toRunHistoryRow);
  const versions: AgentRunHistoryVersionSummary[] = versionGroups.map((g) => ({
    version_number: g.versionNumber,
    conversation_count: g.count,
  }));

  // Newest first is the sidebar's own ordering within a version, but the
  // roster spans versions — take the max rather than trusting position.
  let latestRunAt: string | undefined;
  for (const c of conversations) {
    if (!latestRunAt || c.updatedAt > latestRunAt) latestRunAt = c.updatedAt;
  }

  const selectedRow = selectedConversationId
    ? conversations.find((c) => c.conversationId === selectedConversationId)
    : undefined;

  return createAgentRunHistoryScope({
    // ── Agent under review ────────────────────────────────────────────────
    agent_id: agentId,
    agent_name: agentName ?? undefined,
    canonical_agent_id: history.canonicalAgentId,

    // ── Run index. Omitted — never `[]` — while the fetch is unresolved, so
    //    "still loading" never reads as "this agent has never run".
    conversation_count: loaded ? conversations.length : undefined,
    run_history: loaded ? rows : undefined,
    run_versions: loaded ? versions : undefined,
    latest_run_at: latestRunAt,

    // ── History load state ────────────────────────────────────────────────
    history_load_status: status,
    history_load_error: error ?? undefined,
    history_fetched_at: fetchedAt ?? undefined,

    // ── Selected run ──────────────────────────────────────────────────────
    selected_conversation_id: selectedConversationId ?? undefined,
    selected_run: selectedRow ? toRunHistoryRow(selectedRow) : undefined,
    selected_run_status: selectedRow?.status,
    selected_run_message_count: selectedRow?.messageCount,
    selected_run_transcript: transcript,
  });
}
