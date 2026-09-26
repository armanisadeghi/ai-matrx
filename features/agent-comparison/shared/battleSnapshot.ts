/**
 * battleSnapshot — the whole battle on screen, as data.
 *
 * One read of the mounted mode's state that Alchemy (copy, prepare for AI,
 * downloads, destinations) turns into text, JSON, a table or a payload. It
 * describes each column by what THAT mode varies — the model in Model mode,
 * the system prompt in System Prompt mode, the column's own request in
 * Request Mod — because the modes are different experiments and a summary
 * that flattened them would hide the one thing each battle is testing.
 *
 * Blind sessions: while a blind run is unrevealed, every identifying fact
 * (model, settings, prompt, tools, agent per column, metrics) is withheld and
 * columns are labelled anonymously, exactly as the page shows them.
 */

import type { RootState } from "@/lib/redux/store";
import {
  extractFlatText,
  selectConversationMessages,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import {
  selectLatestAnswerText,
  selectLatestError,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  addUsageTotals,
  getUserRequestResult,
  type MutableTotals,
} from "@/features/agents/components/run-controls/panels/shared";
import type { ActiveRequest } from "@/features/agents/types/request.types";
import { selectResolvedVariables } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { RESPONSE_FEEDBACK_METRICS } from "./feedbackMetrics";
import { columnRequestToSave } from "../modes/request-mod/columnRequest";
import { blindAnonLabel } from "./blind";
import { battleUrl, type BattleModeId } from "./battleRoutes";
import {
  selectActiveBattleColumns,
  type BattleColumnDescriptor,
} from "./activeBattleColumns";

export const MODE_LABELS: Record<BattleModeId, string> = {
  open: "Open battle",
  variations: "Variations battle",
  model: "Model battle",
  tuning: "Tuning battle",
  settings: "Settings battle",
  tools: "Tools battle",
  "system-prompt": "System prompt battle",
  "request-mod": "Request mod battle",
  conversation: "Conversation battle",
};

/** What each mode varies per column, in words. */
const VARIED_AXIS: Record<BattleModeId, string> = {
  open: "the agent (and its version) in each column, each with its own request",
  variations: "the whole agent definition, edited per column",
  model: "only the model",
  tuning: "the model and its settings",
  settings: "the model settings (model, temperature, reasoning, limits)",
  tools: "the tools the agent can use",
  "system-prompt": "the system prompt",
  "request-mod": "the request (message and variables) sent to the same agent",
  conversation:
    "only what happens after the fork: each column continues its own copy of one conversation",
};

export interface BattleColumnSnapshot {
  label: string;
  /** What this column varies — absent while blind. */
  variant?: Record<string, unknown>;
  /** The request this column received, when it has its own (Open, Request Mod). */
  own_request?: { message: string; variables?: Record<string, unknown> };
  status: string;
  answer: string;
  transcript: { role: string; text: string }[];
  error?: string;
  failed?: boolean;
  feedback?: {
    rating: "up" | "down" | null;
    overall: number | null;
    rank: number | null;
    scores: Record<string, number>;
    note: string | null;
  };
  metrics?: {
    rounds: number;
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
    cost_usd: number | null;
    server_seconds: number | null;
    ttft_ms: number | null;
  };
}

export interface BattleSnapshot {
  mode: BattleModeId;
  mode_label: string;
  varies: string;
  battle: { id: string; name: string; url: string | null } | null;
  agent?: { id: string; name: string; version: string };
  /** Conversation mode: the conversation every column was forked from. */
  forked_from?: { conversation_id: string; title: string };
  shared_request?: { message: string; variables: Record<string, unknown> };
  blind: { active: boolean; revealed: boolean };
  columns: BattleColumnSnapshot[];
  rubric: { id: string; label: string; hint: string }[];
}

function agentName(state: RootState, id: string | null | undefined): string {
  if (!id) return "No agent";
  return state.agentDefinition.agents?.[id]?.name ?? "Unknown agent";
}

function versionLabel(v: "current" | number | null | undefined): string {
  if (v == null || v === "current") return "current";
  return `v${v}`;
}

function modelLabel(state: RootState, modelId: unknown): string | null {
  if (typeof modelId !== "string" || !modelId) return null;
  const row =
    state.modelRegistry?.entities?.[modelId] ??
    state.modelRegistry?.identityById?.[modelId];
  return row?.common_name || row?.name || modelId;
}

/**
 * Every model id the mounted battle names, so the Alchemy control can load
 * their names before anyone copies — a payload that says
 * "b32f2079-…" instead of "Gemini 3.8 Flash" tells an AI nothing.
 */
export function battleModelIds(state: RootState): string[] {
  const mode = state.agentComparison.mountedMode;
  if (!mode) return [];
  const ids = new Set<string>();
  for (const col of selectActiveBattleColumns(state)) {
    const o = state.instanceModelOverrides.byConversationId[col.conversationId];
    for (const v of [o?.overrides.model, o?.baseSettings.model]) {
      if (typeof v === "string" && v) ids.add(v);
    }
  }
  const synthetic =
    mode === "system-prompt"
      ? state.agentComparisonSystemPrompt.columns
      : mode === "tools"
        ? state.agentComparisonTools.columns
        : mode === "tuning"
          ? state.agentComparisonTuning.columns
          : mode === "variations"
            ? state.agentComparisonVariations.columns
            : [];
  for (const c of synthetic) {
    const id = state.agentDefinition.agents?.[c.syntheticAgentId]?.modelId;
    if (id) ids.add(id);
  }
  return [...ids];
}

function systemText(state: RootState, agentId: string): string {
  const agent = state.agentDefinition.agents?.[agentId];
  const sys = agent?.messages?.find((m) => m.role === "system");
  const block = (sys?.content as Array<{ type?: string; text?: string }> | undefined)?.find(
    (b) => b?.type === "text",
  );
  return block?.text ?? "";
}

function draftOf(
  state: RootState,
  conversationId: string | null,
): { message: string; variables: Record<string, unknown> } {
  if (!conversationId) return { message: "", variables: {} };
  return {
    message: state.instanceUserInput.byConversationId[conversationId]?.text ?? "",
    // What the run uses: the person's values over scope values over defaults.
    variables: selectResolvedVariables(conversationId)(state),
  };
}

function firstUserText(state: RootState, conversationId: string): string {
  const first = selectConversationMessages(conversationId)(state).find(
    (m) => m.role === "user",
  );
  return first ? extractFlatText(first) : "";
}

/** Per-mode: the facts that make THIS column different from its siblings. */
function describeVariant(
  state: RootState,
  mode: BattleModeId,
  col: BattleColumnDescriptor,
): Record<string, unknown> | undefined {
  const overrides =
    state.instanceModelOverrides.byConversationId[col.conversationId];
  switch (mode) {
    case "model": {
      const model = overrides?.overrides.model ?? overrides?.baseSettings.model;
      return {
        model: modelLabel(state, model) ?? "the agent's default model",
      };
    }
    case "settings": {
      const o = overrides?.overrides ?? {};
      return {
        model:
          modelLabel(state, o.model ?? overrides?.baseSettings.model) ??
          "the agent's default model",
        overrides: o,
      };
    }
    case "system-prompt":
    case "tools":
    case "tuning":
    case "variations": {
      const slice =
        mode === "system-prompt"
          ? state.agentComparisonSystemPrompt
          : mode === "tools"
            ? state.agentComparisonTools
            : mode === "tuning"
              ? state.agentComparisonTuning
              : state.agentComparisonVariations;
      const column = slice.columns.find((c) => c.columnId === col.columnId);
      const synthetic = column
        ? state.agentDefinition.agents?.[column.syntheticAgentId]
        : undefined;
      if (!column || !synthetic) return undefined;
      if (mode === "system-prompt") {
        return { system_prompt: systemText(state, column.syntheticAgentId) };
      }
      if (mode === "tools") {
        return {
          tools: synthetic.tools,
          custom_tools: synthetic.customTools.map((t) => t.name),
          mcp_servers: synthetic.mcpServers,
        };
      }
      if (mode === "tuning") {
        return {
          model: modelLabel(state, synthetic.modelId) ?? synthetic.modelId,
          settings: synthetic.settings,
        };
      }
      return {
        model: modelLabel(state, synthetic.modelId) ?? synthetic.modelId,
        settings: synthetic.settings,
        system_prompt: systemText(state, column.syntheticAgentId),
        tools: synthetic.tools,
        paused:
          "paused" in column ? Boolean((column as { paused?: boolean }).paused) : false,
      };
    }
    case "open":
      return {
        agent: agentName(state, col.agentId),
        version: versionLabel(col.agentVersion),
      };
    case "request-mod":
    case "conversation":
      return undefined;
  }
}

function columnMetrics(
  state: RootState,
  conversationId: string,
): BattleColumnSnapshot["metrics"] {
  const ids = state.activeRequests.byConversationId[conversationId] ?? [];
  const requests = ids
    .map((id) => state.activeRequests.byRequestId[id])
    .filter((r): r is ActiveRequest => Boolean(r));
  const totals: MutableTotals = {
    input: 0,
    output: 0,
    cached: 0,
    total: 0,
    cost: 0,
    requests: 0,
  };
  let seconds = 0;
  for (const req of requests) {
    const result = getUserRequestResult(req);
    if (!result) continue;
    addUsageTotals(totals, result.total_usage?.total);
    seconds += result.timing_stats?.total_duration ?? 0;
  }
  const last = requests[requests.length - 1];
  return {
    rounds: requests.length,
    input_tokens: totals.input || null,
    output_tokens: totals.output || null,
    total_tokens: totals.total || null,
    cost_usd: totals.cost || null,
    server_seconds: seconds || null,
    ttft_ms: last?.clientMetrics?.ttftMs ?? null,
  };
}

/** Read the mounted battle. Null when no battle page is on screen. */
export function buildBattleSnapshot(state: RootState): BattleSnapshot | null {
  const mode = state.agentComparison.mountedMode;
  if (!mode) return null;
  const blind = state.agentComparison.blind;
  const identity = !blind.active || blind.revealed;
  const columns = selectActiveBattleColumns(state);

  const lockedSlice =
    mode === "open" || mode === "conversation"
      ? null
      : mode === "model"
        ? state.agentComparisonModel
        : mode === "settings"
          ? state.agentComparisonSettings
          : mode === "tools"
            ? state.agentComparisonTools
            : mode === "tuning"
              ? state.agentComparisonTuning
              : mode === "system-prompt"
                ? state.agentComparisonSystemPrompt
                : mode === "variations"
                  ? state.agentComparisonVariations
                  : state.agentComparisonRequestMod;

  const unlockedSlice =
    mode === "conversation"
      ? state.agentComparisonConversation
      : state.agentComparison;
  const setId = lockedSlice ? lockedSlice.activeSetId : unlockedSlice.activeSetId;
  const setName = lockedSlice ? lockedSlice.activeSetName : unlockedSlice.activeSetName;

  let agent: BattleSnapshot["agent"];
  if (lockedSlice) {
    const locked = lockedSlice.locked as {
      agentId?: string | null;
      sourceAgentId?: string | null;
      agentVersion: "current" | number | null;
    };
    const id = locked.agentId ?? locked.sourceAgentId ?? null;
    if (id) {
      agent = {
        id,
        name: agentName(state, id),
        version: versionLabel(locked.agentVersion),
      };
    }
  }

  const inputConversationId =
    lockedSlice && "inputConversationId" in lockedSlice
      ? (lockedSlice as { inputConversationId: string | null }).inputConversationId
      : null;
  const source = mode === "conversation" ? state.agentComparisonConversation.source : null;
  const shared_request = inputConversationId
    ? draftOf(state, inputConversationId)
    : undefined;

  const snapshotColumns: BattleColumnSnapshot[] = columns.map((col) => {
    const messages = selectConversationMessages(col.conversationId)(state);
    const transcript = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, text: extractFlatText(m) }))
      .filter((m) => m.text.trim());
    // A reloaded battle has no live request, so the latest-answer selector is
    // empty; the transcript still holds the answer.
    const lastAssistant = [...transcript]
      .reverse()
      .find((m) => m.role === "assistant" && m.text.trim());
    const answer =
      selectLatestAnswerText(col.conversationId)(state) ||
      lastAssistant?.text ||
      "";
    const error = selectLatestError(col.conversationId)(state);
    const fb = state.agentComparison.feedbackByConversation[col.conversationId];
    const label = identity
      ? (col.label?.trim() || agentName(state, col.agentId))
      : blindAnonLabel(col.columnId, blind.order);

    let own_request: BattleColumnSnapshot["own_request"];
    if (mode === "request-mod") {
      const rm = state.agentComparisonRequestMod.columns.find(
        (c) => c.columnId === col.columnId,
      );
      const request = rm ? columnRequestToSave(state, rm) : null;
      own_request = request?.user_message.trim()
        ? { message: request.user_message, variables: request.variables }
        : { message: firstUserText(state, col.conversationId) };
    } else if (mode === "open") {
      own_request = { message: firstUserText(state, col.conversationId) };
    }

    return {
      label,
      ...(identity ? { variant: describeVariant(state, mode, col) } : {}),
      ...(own_request ? { own_request } : {}),
      status: messages.length === 0 && !answer ? "not run" : "ran",
      answer,
      transcript,
      ...(error
        ? identity
          ? { error: error.message }
          : { failed: true }
        : {}),
      ...(fb
        ? {
            feedback: {
              rating: fb.rating,
              overall: fb.overall,
              rank: fb.rank,
              scores: fb.scores,
              note: fb.comment,
            },
          }
        : {}),
      ...(identity ? { metrics: columnMetrics(state, col.conversationId) } : {}),
    };
  });

  return {
    mode,
    mode_label: MODE_LABELS[mode],
    varies: VARIED_AXIS[mode],
    battle: setId
      ? { id: setId, name: setName ?? MODE_LABELS[mode], url: battleUrl(mode, setId) }
      : null,
    ...(agent ? { agent } : {}),
    ...(source
      ? {
          forked_from: {
            conversation_id: source.conversationId,
            title: source.title ?? "Untitled chat",
          },
        }
      : {}),
    ...(shared_request ? { shared_request } : {}),
    blind: { active: blind.active, revealed: blind.revealed },
    columns: snapshotColumns,
    rubric: RESPONSE_FEEDBACK_METRICS.map((m) => ({
      id: m.id,
      label: m.label,
      hint: m.hint,
    })),
  };
}

// =============================================================================
// Renderers — markdown for people, rows for sheets
// =============================================================================

function fmtVariant(v: Record<string, unknown> | undefined): string {
  if (!v) return "";
  return Object.entries(v)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([k, value]) => {
      const text =
        typeof value === "string" ? value : JSON.stringify(value, null, 0);
      return `- **${k.replace(/_/g, " ")}:** ${text}`;
    })
    .join("\n");
}

export function battleMarkdown(
  snap: BattleSnapshot,
  opts: { answers?: boolean; scores?: boolean; setup?: boolean } = {},
): string {
  const { answers = true, scores = true, setup = true } = opts;
  const out: string[] = [];
  out.push(`# ${snap.battle?.name ?? snap.mode_label}`);
  out.push(`${snap.mode_label} — varies ${snap.varies}.`);
  if (snap.blind.active && !snap.blind.revealed) {
    out.push("_Blind comparison: column identities and metrics are hidden until revealed._");
  }
  if (setup) {
    if (snap.agent) out.push(`**Agent:** ${snap.agent.name} (${snap.agent.version})`);
    if (snap.forked_from) out.push(`**Forked from:** ${snap.forked_from.title}`);
    if (snap.shared_request) {
      out.push("## Shared request");
      out.push(snap.shared_request.message || "_(no typed message)_");
      const vars = Object.entries(snap.shared_request.variables);
      if (vars.length > 0) {
        out.push(vars.map(([k, v]) => `- **${k}:** ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n"));
      }
    }
  }
  snap.columns.forEach((c, i) => {
    out.push(`## ${i + 1}. ${c.label}`);
    if (setup && c.variant) out.push(fmtVariant(c.variant));
    if (setup && c.own_request) out.push(`**Request:** ${c.own_request.message || "_(none)_"}`);
    if (scores && c.feedback) {
      const f = c.feedback;
      const parts = [
        f.rank != null ? `rank ${f.rank}` : null,
        f.overall != null ? `overall ${f.overall}/5` : null,
        f.rating ? `thumbs ${f.rating}` : null,
        ...Object.entries(f.scores).map(([k, v]) => `${k} ${v}/5`),
      ].filter(Boolean);
      if (parts.length > 0) out.push(`**Your scores:** ${parts.join(", ")}`);
      if (f.note) out.push(`**Your note:** ${f.note}`);
    }
    if (scores && c.metrics && c.metrics.rounds > 0) {
      const m = c.metrics;
      out.push(
        `**Run:** ${m.total_tokens ?? "—"} tokens, ${m.cost_usd != null ? `$${m.cost_usd.toFixed(4)}` : "—"}, ${m.server_seconds != null ? `${m.server_seconds.toFixed(1)}s` : "—"}`,
      );
    }
    if (c.error) out.push(`**Error:** ${c.error}`);
    if (c.failed) out.push("**This column's run failed.**");
    if (answers) out.push(c.answer ? `### Answer\n\n${c.answer}` : "_No answer yet._");
  });
  return out.join("\n\n");
}

/** One row per column — the scores and run numbers, for CSV and Sheets. */
export function battleRows(snap: BattleSnapshot): Array<Record<string, unknown>> {
  return snap.columns.map((c, i) => {
    const row: Record<string, unknown> = {
      column: i + 1,
      label: c.label,
      status: c.status,
      rank: c.feedback?.rank ?? null,
      overall: c.feedback?.overall ?? null,
      thumbs: c.feedback?.rating ?? null,
    };
    for (const metric of snap.rubric) {
      row[metric.label] = c.feedback?.scores?.[metric.id] ?? null;
    }
    if (c.metrics) {
      row.total_tokens = c.metrics.total_tokens;
      row.cost_usd = c.metrics.cost_usd;
      row.server_seconds = c.metrics.server_seconds;
      row.ttft_ms = c.metrics.ttft_ms;
    }
    if (c.variant) row.variant = JSON.stringify(c.variant);
    row.answer = c.answer;
    return row;
  });
}
