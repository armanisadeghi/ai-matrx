// features/agents/agent-sets/orchestrator/orchestratorService.ts
//
// The plumbing for "generate an orchestrator agent": copy the template, dump the
// selected agents, and inject the generated <agent> blocks into the orchestrator's
// <available_agents> section. Every method returns a ScopesRpcResult and NEVER
// throws. Running the description-generator agent itself is a THUNK (needs
// dispatch) — see ./thunks.ts. See features/agents/docs/AGENT_SETS.md.

"use client";

import { supabase } from "@/utils/supabase/client";
import {
  ok,
  err,
  mapPgError,
  mapPgErrorPair,
} from "@/features/scopes/service/rpcResult";
import type { ScopesRpcResult } from "@/features/scopes/types";
import type { Database } from "@/types/database.types";
import type { AgentDefinitionMessage } from "@/features/agents/types/agent-message-types";
import {
  AVAILABLE_AGENTS_CLOSE,
  AVAILABLE_AGENTS_OPEN,
  AVAILABLE_AGENTS_RE,
  MEMBER_CONFIG_COLUMNS,
  ORCHESTRATOR_TEMPLATE_ID,
} from "./constants";

type DefinitionUpdate = Database["agent"]["Tables"]["definition"]["Update"];

/** A member agent's config, as read to describe its role and list its I/O. */
export interface MemberConfigRow {
  id: string;
  name: string | null;
  description: string | null;
  messages: unknown;
  variable_definitions: unknown;
  output_schema: unknown;
}

/** The Agent Set Role Describer's per-member output. */
export interface DescribedMemberRole {
  id: string;
  roleTitle: string;
  gap: string;
}

/** Pull the `system` message's text out of a member's `messages` jsonb (best-effort). */
export function systemPromptOf(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  const sys = messages.find(
    (m): m is { role?: unknown; content?: unknown } =>
      !!m &&
      typeof m === "object" &&
      (m as { role?: unknown }).role === "system",
  );
  const content = sys?.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) =>
      b && typeof b === "object" && (b as { type?: unknown }).type === "text"
        ? String((b as { text?: unknown }).text ?? "")
        : "",
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** The declared input variable names for a member (from `variable_definitions`). */
export function inputNamesOf(variableDefinitions: unknown): string[] {
  if (!Array.isArray(variableDefinitions)) return [];
  return variableDefinitions
    .map((v) =>
      v && typeof v === "object"
        ? String((v as { name?: unknown }).name ?? "")
        : "",
    )
    .filter(Boolean);
}

/** A short label for a member's output shape: "Text" or "JSON { keyA, keyB }". */
export function outputLabelOf(outputSchema: unknown): string {
  if (!outputSchema || typeof outputSchema !== "object") return "Text";
  const s = outputSchema as {
    type?: unknown;
    properties?: unknown;
    items?: unknown;
  };
  const props =
    s.properties && typeof s.properties === "object"
      ? Object.keys(s.properties as Record<string, unknown>)
      : s.items &&
          typeof s.items === "object" &&
          (s.items as { properties?: unknown }).properties &&
          typeof (s.items as { properties?: unknown }).properties === "object"
        ? Object.keys(
            (s.items as { properties: Record<string, unknown> }).properties,
          )
        : [];
  if (props.length === 0) return "JSON";
  const shown = props.slice(0, 6).join(", ");
  return `JSON { ${shown}${props.length > 6 ? ", …" : ""} }`;
}

/**
 * Parse the Agent Set Role Describer's output into `{id,roleTitle,gap}` rows.
 * Robust to a stray code fence or surrounding prose: takes the first `[` … last
 * `]` span and JSON-parses it. Returns [] on anything unparseable (caller treats
 * as "no updates") — we never write a malformed role.
 */
export function parseRoleDescriberOutput(raw: string): DescribedMemberRole[] {
  const t = (raw ?? "").trim();
  if (!t) return [];
  const first = t.indexOf("[");
  const last = t.lastIndexOf("]");
  if (first === -1 || last === -1 || last < first) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(t.slice(first, last + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: DescribedMemberRole[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const roleTitle =
      typeof r.role_title === "string" ? r.role_title.trim() : "";
    const gap = typeof r.gap === "string" ? r.gap.trim() : "";
    if (id) out.push({ id, roleTitle, gap });
  }
  return out;
}

/** One member's fully-resolved listing entry — role/gap plus declared I/O. */
export interface AvailableAgentEntry {
  id: string;
  roleTitle: string;
  gap: string;
  inputs: string[];
  output: string;
}

/**
 * Build the orchestrator's `<available_agents>` INNER content deterministically
 * from each member's resolved role/gap + declared inputs/outputs. One clean
 * `<agent id>` block per member, no duplicated id, no LLM prose. The role/gap have
 * already been made correct by the Role Describer; here we only format them.
 */
export function buildAvailableAgentsBlock(
  entries: AvailableAgentEntry[],
): string {
  return entries
    .map((e) => {
      const inputs = e.inputs.length ? e.inputs.join(", ") : "none";
      return [
        `<agent id="${e.id}">`,
        `  Role: ${e.roleTitle || "(unspecified)"}`,
        `  Fills: ${e.gap || "(unspecified)"}`,
        `  Inputs: ${inputs}`,
        `  Output: ${e.output}`,
        `</agent>`,
      ].join("\n");
    })
    .join("\n");
}

export const orchestratorService = {
  /** Copy the "Agent Orchestrator" template into a new agent owned by the caller. */
  async createFromTemplate(): Promise<ScopesRpcResult<{ agentId: string }>> {
    try {
      const res = await fetch(
        `/api/agents/templates/${ORCHESTRATOR_TEMPLATE_ID}/use`,
        {
          method: "POST",
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return err(
          "internal",
          body.error ?? `Template create failed (HTTP ${res.status})`,
        );
      }
      const body = (await res.json()) as { agentId?: string };
      if (!body.agentId)
        return err("internal", "Template create returned no agent id");
      return ok({ agentId: body.agentId });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /**
   * Read each member agent's config — identity, system prompt (`messages`),
   * declared inputs, and output shape — to both describe its set role and list
   * its I/O in `<available_agents>`.
   */
  async fetchMemberConfigs(
    memberIds: string[],
  ): Promise<ScopesRpcResult<MemberConfigRow[]>> {
    try {
      if (memberIds.length === 0) return ok([]);
      const { data, error } = await supabase
        .schema("agent")
        .from("definition")
        .select(MEMBER_CONFIG_COLUMNS)
        .in("id", memberIds);
      if (error) return err(...mapPgErrorPair(error));
      return ok(
        (Array.isArray(data) ? data : []) as unknown as MemberConfigRow[],
      );
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /** Cheap check: does this agent's system prompt have an <available_agents> section? */
  async hasAvailableAgentsSection(
    agentId: string,
  ): Promise<ScopesRpcResult<boolean>> {
    try {
      const { data, error } = await supabase
        .schema("agent")
        .from("definition")
        .select("messages")
        .eq("id", agentId)
        .single();
      if (error) return err(...mapPgErrorPair(error));
      const messages = (data?.messages ??
        []) as unknown as AgentDefinitionMessage[];
      const sys = messages.find((m) => m.role === "system");
      const text = sys?.content.find((b) => b.type === "text");
      const has =
        text?.type === "text" && AVAILABLE_AGENTS_RE.test(text.text ?? "");
      return ok(Boolean(has));
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /**
   * Ensure the orchestrator's system prompt HAS an `<available_agents>` section
   * so "Sync agent listings" can fill it. Idempotent — a no-op when the marker
   * already exists. Otherwise appends a labelled EMPTY section to the end of the
   * system message (Sync fills it later). LOUD if there is no system message.
   */
  async ensureAvailableAgentsSection(
    orchestratorId: string,
  ): Promise<ScopesRpcResult<null>> {
    try {
      const { data, error } = await supabase
        .schema("agent")
        .from("definition")
        .select("messages")
        .eq("id", orchestratorId)
        .single();
      if (error) return err(...mapPgErrorPair(error));

      const messages = (data?.messages ??
        []) as unknown as AgentDefinitionMessage[];
      const sysIdx = messages.findIndex((m) => m.role === "system");
      if (sysIdx === -1) {
        return err(
          "invalid_argument",
          "This agent has no system message to add the section to.",
        );
      }
      const sys = messages[sysIdx];
      const textIdx = sys.content.findIndex((b) => b.type === "text");
      if (textIdx === -1) {
        return err(
          "invalid_argument",
          "This agent's system message has no text to add the section to.",
        );
      }
      const textBlock = sys.content[textIdx];
      if (textBlock.type !== "text")
        return err("invalid_argument", "Unexpected content block");
      if (typeof textBlock.text !== "string")
        return err("invalid_argument", "This agent's system text is missing");
      // Already has it → nothing to do (idempotent).
      if (AVAILABLE_AGENTS_RE.test(textBlock.text)) return ok(null);

      const appended =
        `${textBlock.text.trimEnd()}\n\n` +
        `Your specialist agents are listed below and kept in sync with your set:\n\n` +
        `${AVAILABLE_AGENTS_OPEN}\n${AVAILABLE_AGENTS_CLOSE}`;
      const newContent = sys.content.map((b, i) =>
        i === textIdx ? { ...b, text: appended } : b,
      );
      const newMessages = messages.map((m, i) =>
        i === sysIdx ? { ...m, content: newContent } : m,
      );

      const { error: upErr } = await supabase
        .schema("agent")
        .from("definition")
        .update({
          messages: newMessages as DefinitionUpdate["messages"],
        } as DefinitionUpdate)
        .eq("id", orchestratorId);
      if (upErr) return err(...mapPgErrorPair(upErr));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /** Rename an agent (used to name the generated orchestrator). */
  async rename(agentId: string, name: string): Promise<ScopesRpcResult<null>> {
    try {
      const { error } = await supabase
        .schema("agent")
        .from("definition")
        .update({ name } as DefinitionUpdate)
        .eq("id", agentId);
      if (error) return err(...mapPgErrorPair(error));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /**
   * Replace the generated orchestrator's messages with the supervisor system
   * prompt + a neutral task user template (dropping the template's planner
   * messages) so it CALLS its member tools at run time. Keeps the
   * `<available_agents>` marker for "Sync agent listings".
   */
  async setOrchestratorMessages(
    agentId: string,
    systemText: string,
    userText: string,
  ): Promise<ScopesRpcResult<null>> {
    try {
      const messages: AgentDefinitionMessage[] = [
        { role: "system", content: [{ type: "text", text: systemText }] },
        { role: "user", content: [{ type: "text", text: userText }] },
      ];
      const { error } = await supabase
        .schema("agent")
        .from("definition")
        .update({
          messages: messages as DefinitionUpdate["messages"],
        } as DefinitionUpdate)
        .eq("id", agentId);
      if (error) return err(...mapPgErrorPair(error));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /**
   * Replace the orchestrator's <available_agents> block with `agentBlocks`. LOUD
   * failure if the marker is absent — we never write a malformed prompt.
   */
  async injectAvailableAgents(
    orchestratorId: string,
    agentBlocks: string,
  ): Promise<ScopesRpcResult<null>> {
    try {
      const { data, error } = await supabase
        .schema("agent")
        .from("definition")
        .select("messages")
        .eq("id", orchestratorId)
        .single();
      if (error) return err(...mapPgErrorPair(error));

      const messages = (data?.messages ??
        []) as unknown as AgentDefinitionMessage[];
      const sysIdx = messages.findIndex((m) => m.role === "system");
      if (sysIdx === -1)
        return err("invalid_argument", "Orchestrator has no system message");
      const sys = messages[sysIdx];
      const textIdx = sys.content.findIndex((b) => b.type === "text");
      if (textIdx === -1)
        return err(
          "invalid_argument",
          "Orchestrator system message has no text",
        );
      const textBlock = sys.content[textIdx];
      if (textBlock.type !== "text")
        return err("invalid_argument", "Unexpected content block");
      if (typeof textBlock.text !== "string")
        return err("invalid_argument", "Orchestrator system text is missing");
      if (!AVAILABLE_AGENTS_RE.test(textBlock.text)) {
        return err(
          "invalid_argument",
          "This agent's prompt has no <available_agents> section to fill",
        );
      }

      // Use a FUNCTION replacer — a string replacement would interpret `$&`/`$1`/`$$`
      // patterns inside the generated XML (which often contains `$`), corrupting it.
      const replacement = `${AVAILABLE_AGENTS_OPEN}\n${agentBlocks}\n${AVAILABLE_AGENTS_CLOSE}`;
      const newText = textBlock.text.replace(
        AVAILABLE_AGENTS_RE,
        () => replacement,
      );
      const newContent = sys.content.map((b, i) =>
        i === textIdx ? { ...b, text: newText } : b,
      );
      const newMessages = messages.map((m, i) =>
        i === sysIdx ? { ...m, content: newContent } : m,
      );

      const { error: upErr } = await supabase
        .schema("agent")
        .from("definition")
        .update({
          messages: newMessages as DefinitionUpdate["messages"],
        } as DefinitionUpdate)
        .eq("id", orchestratorId);
      if (upErr) return err(...mapPgErrorPair(upErr));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },
};
