// features/agents/agent-sets/orchestrator/orchestratorService.ts
//
// The plumbing for "generate an orchestrator agent": copy the template, dump the
// selected agents, and inject the generated <agent> blocks into the orchestrator's
// <available_agents> section. Every method returns a ScopesRpcResult and NEVER
// throws. Running the description-generator agent itself is a THUNK (needs
// dispatch) — see ./thunks.ts. See features/agents/docs/AGENT_SETS.md.

"use client";

import { supabase } from "@/utils/supabase/client";
import { ok, err, mapPgError, mapPgErrorPair } from "@/features/scopes/service/rpcResult";
import type { ScopesRpcResult } from "@/features/scopes/types";
import type { Database } from "@/types/database.types";
import type { AgentDefinitionMessage } from "@/features/agents/types/agent-message-types";
import {
  AVAILABLE_AGENTS_CLOSE,
  AVAILABLE_AGENTS_OPEN,
  AVAILABLE_AGENTS_RE,
  DUMP_COLUMNS,
  NAMER_DUMP_COLUMNS,
  ORCHESTRATOR_TEMPLATE_ID,
} from "./constants";

type DefinitionUpdate = Database["agent"]["Tables"]["definition"]["Update"];

/** A member row + config, as read for the "backfill missing identity" pass. */
export interface MemberConfigRow {
  id: string;
  name: string | null;
  description: string | null;
  messages: unknown;
  variable_definitions: unknown;
  output_schema: unknown;
}

/** The Agent Namer's per-agent output. */
export interface NamedAgent {
  id: string;
  name: string;
  description: string;
}

/** True when a member field is blank and should be backfilled (never overwrite an author's value). */
export function isBlankIdentity(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

/**
 * Parse the Agent Namer's output into `{id,name,description}` rows. Robust to a
 * stray code fence or surrounding prose: takes the first `[` … last `]` span and
 * JSON-parses it. Returns [] on anything unparseable (caller treats as "no
 * updates") — we never write a malformed identity.
 */
export function parseNamerOutput(raw: string): NamedAgent[] {
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
  const out: NamedAgent[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const description =
      typeof r.description === "string" ? r.description.trim() : "";
    if (id) out.push({ id, name, description });
  }
  return out;
}

/**
 * Pull just the <agent> blocks out of the generator's raw output, robust to:
 * prose before/after, one or more markdown fences, an <agents> wrapper (with or
 * without attributes), and stray <available_agents> tags in the model output.
 * The result is what goes INSIDE the orchestrator's <available_agents> section.
 */
export function extractAgentBlocks(raw: string): string {
  const t = (raw ?? "").trim();
  let out = t;

  // 1) Prefer the inner content of an <agents ...> wrapper if present.
  const wrapped = t.match(/<agents\b[^>]*>\s*([\s\S]*?)<\/agents>/i);
  if (wrapped?.[1]) {
    out = wrapped[1].trim();
  } else {
    // 2) Else take the span from the first <agent to the last </agent> — this
    //    ignores any prose / code fences the model wrapped around the blocks.
    const first = t.search(/<agent\b/i);
    const lastClose = t.toLowerCase().lastIndexOf("</agent>");
    if (first !== -1 && lastClose !== -1 && lastClose >= first) {
      out = t.slice(first, lastClose + "</agent>".length).trim();
    } else {
      // 3) Fallback: unwrap a single fenced block.
      const fence = t.match(/```(?:[a-z]+)?\s*([\s\S]*?)\s*```/i);
      if (fence?.[1]) out = fence[1].trim();
    }
  }

  // Never let the model's own <available_agents> tags leak in — they'd break the
  // injection marker on re-sync.
  return out.replace(/<\/?available_agents\b[^>]*>/gi, "").trim();
}

export const orchestratorService = {
  /** Copy the "Agent Orchestrator" template into a new agent owned by the caller. */
  async createFromTemplate(): Promise<ScopesRpcResult<{ agentId: string }>> {
    try {
      const res = await fetch(`/api/agents/templates/${ORCHESTRATOR_TEMPLATE_ID}/use`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return err("internal", body.error ?? `Template create failed (HTTP ${res.status})`);
      }
      const body = (await res.json()) as { agentId?: string };
      if (!body.agentId) return err("internal", "Template create returned no agent id");
      return ok({ agentId: body.agentId });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /** JSON dump of the selected agents' {id,name,description,output_schema,variable_definitions}. */
  async fetchAgentDump(memberIds: string[]): Promise<ScopesRpcResult<string>> {
    try {
      if (memberIds.length === 0) return err("invalid_argument", "No agents selected");
      const { data, error } = await supabase
        .schema("agent")
        .from("definition")
        .select(DUMP_COLUMNS)
        .in("id", memberIds);
      if (error) return err(...mapPgErrorPair(error));
      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) return err("internal", "None of the selected agents were readable");
      return ok(JSON.stringify(rows, null, 2));
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /**
   * Read the member rows' identity + config for the "backfill missing name/
   * description" pass. Includes the system prompt so the namer has real signal.
   */
  async fetchMemberConfigs(
    memberIds: string[],
  ): Promise<ScopesRpcResult<MemberConfigRow[]>> {
    try {
      if (memberIds.length === 0) return ok([]);
      const { data, error } = await supabase
        .schema("agent")
        .from("definition")
        .select(NAMER_DUMP_COLUMNS)
        .in("id", memberIds);
      if (error) return err(...mapPgErrorPair(error));
      return ok((Array.isArray(data) ? data : []) as unknown as MemberConfigRow[]);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /**
   * Write a generated name/description to a member — ONLY the fields passed. The
   * caller decides per-field (blank-only) so an author's existing value is never
   * touched. No-op (ok) when `patch` is empty. RLS may reject a member the caller
   * can't edit (e.g. a shared, foreign-org agent); that surfaces as an error the
   * backfill loop tolerates per-member.
   */
  async updateAgentIdentity(
    agentId: string,
    patch: { name?: string; description?: string },
  ): Promise<ScopesRpcResult<null>> {
    try {
      if (patch.name === undefined && patch.description === undefined) {
        return ok(null);
      }
      const { error } = await supabase
        .schema("agent")
        .from("definition")
        .update(patch as DefinitionUpdate)
        .eq("id", agentId);
      if (error) return err(...mapPgErrorPair(error));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /** Cheap check: does this agent's system prompt have an <available_agents> section? */
  async hasAvailableAgentsSection(agentId: string): Promise<ScopesRpcResult<boolean>> {
    try {
      const { data, error } = await supabase
        .schema("agent")
        .from("definition")
        .select("messages")
        .eq("id", agentId)
        .single();
      if (error) return err(...mapPgErrorPair(error));
      const messages = (data?.messages ?? []) as unknown as AgentDefinitionMessage[];
      const sys = messages.find((m) => m.role === "system");
      const text = sys?.content.find((b) => b.type === "text");
      const has = text?.type === "text" && AVAILABLE_AGENTS_RE.test(text.text);
      return ok(Boolean(has));
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
        .update({ messages: messages as DefinitionUpdate["messages"] } as DefinitionUpdate)
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

      const messages = (data?.messages ?? []) as unknown as AgentDefinitionMessage[];
      const sysIdx = messages.findIndex((m) => m.role === "system");
      if (sysIdx === -1) return err("invalid_argument", "Orchestrator has no system message");
      const sys = messages[sysIdx];
      const textIdx = sys.content.findIndex((b) => b.type === "text");
      if (textIdx === -1) return err("invalid_argument", "Orchestrator system message has no text");
      const textBlock = sys.content[textIdx];
      if (textBlock.type !== "text") return err("invalid_argument", "Unexpected content block");
      if (!AVAILABLE_AGENTS_RE.test(textBlock.text)) {
        return err(
          "invalid_argument",
          "This agent's prompt has no <available_agents> section to fill",
        );
      }

      // Use a FUNCTION replacer — a string replacement would interpret `$&`/`$1`/`$$`
      // patterns inside the generated XML (which often contains `$`), corrupting it.
      const replacement = `${AVAILABLE_AGENTS_OPEN}\n${agentBlocks}\n${AVAILABLE_AGENTS_CLOSE}`;
      const newText = textBlock.text.replace(AVAILABLE_AGENTS_RE, () => replacement);
      const newContent = sys.content.map((b, i) =>
        i === textIdx ? { ...b, text: newText } : b,
      );
      const newMessages = messages.map((m, i) =>
        i === sysIdx ? { ...m, content: newContent } : m,
      );

      const { error: upErr } = await supabase
        .schema("agent")
        .from("definition")
        .update({ messages: newMessages as DefinitionUpdate["messages"] } as DefinitionUpdate)
        .eq("id", orchestratorId);
      if (upErr) return err(...mapPgErrorPair(upErr));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },
};
