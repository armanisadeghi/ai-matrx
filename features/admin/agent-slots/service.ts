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
import type { JsonObject } from "@/types/json";

/** Slot/exemplar rows are platform rows owned by the system org. */
const SYSTEM_ORGANIZATION_ID = "39c38960-d30c-4840-b0c1-c9960de95582";

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

// ── Test bench (exemplars + candidate runs) ──────────────────────────────────

export type SlotExemplarRow = Database["agent"]["Tables"]["slot_exemplar"]["Row"];

export async function fetchSlotExemplars(slotId: string): Promise<SlotExemplarRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_exemplar")
    .select("*")
    .eq("slot_id", slotId)
    .is("deleted_at", null)
    .order("position")
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function createSlotExemplar(input: {
  slotId: string;
  label: string;
  variables: JsonObject;
  userInput?: string | null;
}): Promise<SlotExemplarRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("slot_exemplar")
    .insert({
      slot_id: input.slotId,
      label: input.label,
      variables: input.variables,
      user_input: input.userInput ?? null,
      source: "manual",
      visibility: "internal",
      organization_id: SYSTEM_ORGANIZATION_ID,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSlotExemplar(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("agent")
    .from("slot_exemplar")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Candidate spec for a bench run — empty object re-runs the current default. */
export interface SlotTestCandidate {
  agent_id?: string;
  agent_version_id?: string;
  config_overrides?: Record<string, unknown>;
}

/** Response of aidream POST /agent-slots/{slot_key}/test. Mirrors
 * SlotTestResult (aidream agent_slots/testing.py); replace with the
 * OpenAPI-generated alias on the next `pnpm sync-types` after deploy. */
export interface SlotTestResponse {
  slot_key: string;
  agent_id: string;
  is_version: boolean;
  provenance: string;
  output: string;
  artifact: Record<string, unknown> | null;
  structural: {
    checked: boolean;
    ok: boolean | null;
    errors: string[];
    output_kind: string | null;
    missing_required_keys: string[];
    degraded_reason: string | null;
  };
  usage: Record<string, unknown>;
  model_id: string | null;
  duration_ms: number;
  error: string | null;
}

function backendBaseUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL_PROD || "";
  return base.replace(/\/$/, "");
}

export async function runSlotTest(
  slotKey: string,
  request: {
    exemplarId?: string;
    variables?: Record<string, unknown>;
    userInput?: string;
    candidate: SlotTestCandidate;
  },
): Promise<SlotTestResponse> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  const res = await fetch(
    `${backendBaseUrl()}/agent-slots/${encodeURIComponent(slotKey)}/test`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        exemplar_id: request.exemplarId,
        variables: request.variables,
        user_input: request.userInput,
        candidate: request.candidate,
      }),
    },
  );
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { detail?: unknown };
      detail = body.detail ? ` — ${JSON.stringify(body.detail)}` : "";
    } catch {
      // non-JSON body
    }
    throw new Error(`slot test ${res.status}${detail}`);
  }
  return (await res.json()) as SlotTestResponse;
}
