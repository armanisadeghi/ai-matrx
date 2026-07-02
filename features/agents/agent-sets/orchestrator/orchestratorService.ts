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
  ORCHESTRATOR_TEMPLATE_ID,
} from "./constants";

type DefinitionUpdate = Database["agent"]["Tables"]["definition"]["Update"];

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
      if (memberIds.length === 0) return err("invalid", "No agents selected");
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
      if (sysIdx === -1) return err("invalid", "Orchestrator has no system message");
      const sys = messages[sysIdx];
      const textIdx = sys.content.findIndex((b) => b.type === "text");
      if (textIdx === -1) return err("invalid", "Orchestrator system message has no text");
      const textBlock = sys.content[textIdx];
      if (textBlock.type !== "text") return err("invalid", "Unexpected content block");
      if (!AVAILABLE_AGENTS_RE.test(textBlock.text)) {
        return err(
          "invalid",
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
