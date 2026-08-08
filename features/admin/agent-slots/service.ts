"use client";

/**
 * Agent Slots admin service — direct supabase reads/writes on
 * agent.slot_definition / agent.slot_binding.
 *
 * Cross-repo system-of-record:
 * /Users/armanisadeghi/code/common-docs/systems/agent-slots/FEATURE.md
 *
 * Writes ride RLS: super admins hold editor on system-org rows via
 * iam.has_access (verified live 2026-08-07) — no bespoke RPC layer.
 */

import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";

export type SlotDefinitionRow = Database["agent"]["Tables"]["slot_definition"]["Row"];
export type SlotBindingRow = Database["agent"]["Tables"]["slot_binding"]["Row"];
export type SlotDefinitionUpdate = Database["agent"]["Tables"]["slot_definition"]["Update"];

export interface SlotAgentInfo {
  id: string;
  name: string;
  /** Current master version counter (agent.definition.version). */
  version: number | null;
  isArchived: boolean;
  /** 'builtin' = system agent. Anything else pinned as a slot DEFAULT is a
   * defect — surface it loudly in the console. */
  agentType: string | null;
}

export interface SlotVersionInfo {
  id: string;
  agentId: string | null;
  versionNumber: number;
  name: string | null;
}

export interface SlotConsoleData {
  slots: SlotDefinitionRow[];
  /** agent.definition rows referenced by any slot default or binding. */
  agentsById: Record<string, SlotAgentInfo>;
  /** agent.definition_version rows referenced by any pinned default/binding. */
  versionsById: Record<string, SlotVersionInfo>;
  bindingsBySlotId: Record<string, SlotBindingRow[]>;
}

export async function fetchSlotConsoleData(): Promise<SlotConsoleData> {
  const supabase = createClient();

  const [slotsRes, bindingsRes] = await Promise.all([
    supabase
      .schema("agent")
      .from("slot_definition")
      .select("*")
      .is("deleted_at", null)
      .order("slot_key"),
    supabase
      .schema("agent")
      .from("slot_binding")
      .select("*")
      .is("deleted_at", null)
      .order("created_at"),
  ]);
  if (slotsRes.error) throw slotsRes.error;
  if (bindingsRes.error) throw bindingsRes.error;
  const slots = slotsRes.data ?? [];
  const bindings = bindingsRes.data ?? [];

  const agentIds = new Set<string>();
  const versionIds = new Set<string>();
  for (const slot of slots) {
    if (slot.default_agent_id) agentIds.add(slot.default_agent_id);
    if (slot.default_agent_version_id) versionIds.add(slot.default_agent_version_id);
  }
  for (const binding of bindings) {
    if (binding.agent_id) agentIds.add(binding.agent_id);
    if (binding.agent_version_id) versionIds.add(binding.agent_version_id);
  }

  const versionsById: Record<string, SlotVersionInfo> = {};
  if (versionIds.size > 0) {
    const { data, error } = await supabase
      .schema("agent")
      .from("definition_version")
      .select("id, agent_id, version_number, name")
      .in("id", [...versionIds]);
    if (error) throw error;
    for (const row of data ?? []) {
      versionsById[row.id] = {
        id: row.id,
        agentId: row.agent_id,
        versionNumber: row.version_number,
        name: row.name,
      };
      if (row.agent_id) agentIds.add(row.agent_id);
    }
  }

  const agentsById: Record<string, SlotAgentInfo> = {};
  if (agentIds.size > 0) {
    const { data, error } = await supabase
      .schema("agent")
      .from("definition")
      .select("id, name, version, is_archived, agent_type")
      .in("id", [...agentIds]);
    if (error) throw error;
    for (const row of data ?? []) {
      agentsById[row.id] = {
        id: row.id,
        name: row.name ?? row.id,
        version: row.version,
        isArchived: Boolean(row.is_archived),
        agentType: row.agent_type,
      };
    }
  }

  const bindingsBySlotId: Record<string, SlotBindingRow[]> = {};
  for (const binding of bindings) {
    (bindingsBySlotId[binding.slot_id] ??= []).push(binding);
  }

  return { slots, agentsById, versionsById, bindingsBySlotId };
}

export async function updateSlotDefinition(
  slotId: string,
  patch: Pick<
    SlotDefinitionUpdate,
    | "default_agent_id"
    | "default_agent_version_id"
    | "use_latest"
    | "is_enabled"
    | "label"
    | "description"
  >,
): Promise<SlotDefinitionRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_definition")
    .update(patch)
    .eq("id", slotId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Version history for one agent — for picking a pin. */
export async function fetchAgentVersions(agentId: string): Promise<SlotVersionInfo[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("definition_version")
    .select("id, agent_id, version_number, name")
    .eq("agent_id", agentId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    agentId: row.agent_id,
    versionNumber: row.version_number,
    name: row.name,
  }));
}

/** Picker option shape. Options come from the canonical Redux agent slice
 * (`selectBuiltinAgents`) — NEVER from a raw table query. See FEATURE.md. */
export interface SlotAgentOption {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
}
