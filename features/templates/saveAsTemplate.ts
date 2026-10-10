// features/templates/saveAsTemplate.ts — "Save as template": a person's own setup becomes a
// template their organization can install.
//
// THE DOORS (no second path): `custom.template_from_tables(org, table_ids, include_rows, rows)`
// drafts the spec from the tables (fields, relations, views, forms, seed rows); the agents that read
// those tables become the template's agents, each variable keeping its merge-field binding with the
// table and row swapped for template-local handles (table token, seed row index); the spec is
// compiled by @ai-matrx/records' `templateDeclaration` and declared through
// `custom.template_declare('org', …)` — the organization's own template, beside the platform's.
//
// Moved from the retired kits Save dialog (Kits → Template merge, 2026-10-05). Pure parts are
// exported for the guard test; the doors take a client.

import { storeDoors } from "@ai-matrx/records/core";
import { templateDeclaration } from "@ai-matrx/records/templates";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SetupAgent {
  id: string;
  name: string;
  variables: Array<{ name: string; binding: Record<string, unknown> }>;
}

interface DraftTable {
  token: string;
  name: string;
  rows?: Array<{ key: string }>;
}

export interface SaveDraft {
  spec: Record<string, unknown> & { tables: DraftTable[] };
}

/** An installed agent copy is named "<name> 2", "<name> 3"…; the template carries the base name. */
export function baseAgentName(name: string): string {
  const base = name.replace(/\s+\d+$/, "").trim();
  return base || name;
}

/** Every table id an agent's merge-field bindings read. */
export function tablesReadBy(agents: SetupAgent[]): string[] {
  const ids = new Set<string>();
  for (const a of agents) for (const v of a.variables) if (typeof v.binding.table_id === "string" && v.binding.table_id) ids.add(v.binding.table_id);
  return [...ids];
}

/** A seed row's key in a drafted spec: `row-<first 8 hex of the record id>` (custom.template_from_tables). */
export function rowKeyOf(recordId: string): string {
  return `row-${recordId.replace(/-/g, "").slice(0, 8)}`;
}

/**
 * The installed binding → the template's binding: table id → token, record id → seed row index.
 * Null (with why) when it cannot be carried: a table outside the template, or a row not seeded.
 */
export function templateBindingOf(
  binding: Record<string, unknown>,
  tableToken: Record<string, string>,
  tables: DraftTable[],
): { binding: Record<string, unknown> } | { why: string } {
  const token = tableToken[String(binding.table_id ?? "")];
  if (!token) return { why: "it reads a table outside this template" };
  const semantic = String(binding.semantic_type ?? "collection");
  const out: Record<string, unknown> = { semantic, table: token };
  if (typeof binding.record_id === "string" && semantic !== "collection") {
    const rows = tables.find((t) => t.token === token)?.rows ?? [];
    const index = rows.findIndex((r) => r.key === rowKeyOf(binding.record_id as string));
    if (index < 0) return { why: "it reads one row, and the template carries no rows" };
    out.rowIndex = index;
  }
  for (const k of ["transform", "limit", "sort", "match", "missing"] as const) if (binding[k] !== undefined) out[k] = binding[k];
  if (typeof binding.field_key === "string") out.field = binding.field_key;
  return { binding: out };
}

export interface SaveChoices {
  name: string;
  describes: string;
  agents: SetupAgent[];
  /** Table id → its name, to find each table's token in the draft (tokens are made from names). */
  tableNames: Record<string, string>;
}

/** The spec to declare, and what could not be carried (said in review, never dropped silently). */
export function buildTemplateSpec(
  draft: SaveDraft,
  choices: SaveChoices,
  stamp: string,
): { spec: Record<string, unknown>; left: string[] } {
  const tables = draft.spec.tables;
  const tableToken: Record<string, string> = {};
  for (const [id, name] of Object.entries(choices.tableNames)) {
    const t = tables.find((x) => x.name === name);
    if (t) tableToken[id] = t.token;
  }
  const left: string[] = [];
  const keys = new Set<string>();
  const extraAgents = choices.agents.map((src) => {
    const a = { ...src, name: baseAgentName(src.name) };
    let key = a.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "agent";
    while (keys.has(key)) key = `${key}_2`;
    keys.add(key);
    const variables: Array<{ name: string; describes: string; binding: Record<string, unknown> }> = [];
    for (const v of a.variables) {
      const b = templateBindingOf(v.binding, tableToken, tables);
      if ("why" in b) left.push(`${a.name} — ${v.name.replace(/_/g, " ")}: ${b.why}`);
      else variables.push({ name: v.name, describes: v.name.replace(/_/g, " "), binding: b.binding });
    }
    return {
      key,
      platformAgent: { id: a.id, name: a.name },
      agentReason: `${a.name} reads these tables in ${choices.name}.`,
      name: a.name,
      variables,
    };
  });
  const base = String(draft.spec.catalogueId ?? "ORG");
  // The first agent is the template's own agent (the plan copies it first); the rest are its
  // extra agents. A setup with no agent is a template of tables only.
  const [first, ...rest] = extraAgents;
  const agent = first
    ? {
        platformAgent: first.platformAgent,
        name: first.name,
        variables: first.variables.map((v) => ({ name: v.name, table: String(v.binding.table), describes: v.describes, binding: v.binding })),
      }
    : null;
  return {
    spec: {
      ...draft.spec,
      catalogueId: `${base}-${stamp}`.slice(0, 64),
      vertical: choices.name,
      useCase: choices.describes,
      agent,
      extraAgents: rest,
    },
    left,
  };
}

// ─── the doors ──────────────────────────────────────────────────────────────

/** The agents' merge-field bindings, read as the person. */
export async function readSetupAgents(client: SupabaseClient, ids: string[]): Promise<SetupAgent[]> {
  if (!ids.length) return [];
  const { data, error } = await client.schema("agent").from("definition").select("id, name, variable_definitions").in("id", ids);
  if (error) throw new Error(`The agents could not be read: ${error.message}`);
  return (data ?? []).map((row: { id: string; name: string; variable_definitions: unknown }) => ({
    id: row.id,
    name: row.name,
    variables: (Array.isArray(row.variable_definitions) ? (row.variable_definitions as Array<Record<string, unknown>>) : [])
      .filter((d) => (d?.binding as { kind?: unknown } | undefined)?.kind === "merge_field")
      .map((d) => ({ name: String(d.name ?? ""), binding: d.binding as Record<string, unknown> })),
  }));
}

/** The organization's live agents that read any of these tables (the template carries them all). */
export async function agentsReading(client: SupabaseClient, organizationId: string, tableIds: string[]): Promise<SetupAgent[]> {
  const { data, error } = await client
    .schema("agent")
    .from("definition")
    .select("id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .eq("is_archived", false)
    .or(tableIds.map((t) => `variable_definitions.cs.${JSON.stringify([{ binding: { table_id: t } }])}`).join(","));
  if (error) throw new Error(`The agents that read these tables could not be found: ${error.message}`);
  return readSetupAgents(client, (data ?? []).map((r: { id: string }) => r.id));
}

export interface SavedTemplate {
  templateId: string;
  catalogueId: string;
  left: string[];
}

/** Draft, build and declare the organization's own template. */
export async function saveAsTemplate(
  client: SupabaseClient,
  organizationId: string,
  choices: SaveChoices & { tableIds: string[]; includeRows: boolean; rowsPerTable: number },
): Promise<SavedTemplate> {
  const drafted = await storeDoors(client).templateFromTables({
    organizationId,
    tableIds: choices.tableIds,
    includeRows: choices.includeRows,
    rowsPerTable: choices.rowsPerTable,
  });
  if (drafted.error) throw new Error(drafted.error.message);
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(8, 14);
  const { spec, left } = buildTemplateSpec(drafted.data as unknown as SaveDraft, choices, stamp);
  let declaration: Record<string, unknown>;
  try {
    declaration = templateDeclaration(spec as never, organizationId) as unknown as Record<string, unknown>;
  } catch (err) {
    throw new Error(`The template could not be built: ${err instanceof Error ? err.message : String(err)}`);
  }
  const declared = await storeDoors(client).templateDeclare("org", declaration);
  if (declared.error) throw new Error(declared.error.message);
  const answer = declared.data as unknown as { template_id: string; catalogue_id: string };
  return { templateId: answer.template_id, catalogueId: answer.catalogue_id, left };
}
