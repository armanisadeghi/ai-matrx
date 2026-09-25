// features/kits/snapshot.ts — reading a person's setup for "Save as kit".
//
// Everything is read AS THE PERSON through the same doors the rest of the app uses:
// the agent row (RLS), the record store (`@ai-matrx/records` client for the
// organization they SET), and the organization's workflow definitions (readAllRows —
// a list treated as complete is never a bare select).

import type { RecordsClient } from "@ai-matrx/records/core";
import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { KIT_SAVE } from "./constants";
import {
  mergeFieldBindings,
  tablesToInclude,
  workflowReferences,
  type SnapshotField,
  type SnapshotWorkflow,
} from "./serialize";

export interface AgentFacts {
  id: string;
  name: string;
  description: string | null;
  organizationId: string | null;
  visibility: string | null;
  createdBy: string | null;
  variableDefinitions: unknown;
}

export async function readAgentFacts(agentId: string): Promise<AgentFacts> {
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("id, name, description, organization_id, visibility, created_by, variable_definitions")
    .eq("id", agentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`The agent could not be read: ${error.message}`);
  if (!data) throw new Error("That agent was not found, or you may not open it.");
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    organizationId: data.organization_id,
    visibility: data.visibility as string | null,
    createdBy: data.created_by,
    variableDefinitions: data.variable_definitions,
  };
}

async function readFields(client: RecordsClient, tableId: string): Promise<SnapshotField[]> {
  const fields = await client.fields({ table_id: tableId });
  if (!fields.ok) throw new Error(`The columns of a table could not be read: ${fields.error.message}`);
  const out: SnapshotField[] = [];
  for (const f of fields.data) {
    // The stored Field document carries `parity_type`; the typed shape does not name it.
    const doc = f as unknown as Record<string, unknown>;
    const spec: SnapshotField = {
      key: f.key,
      label: f.label,
      type: String(f.type),
      parity_type: typeof doc.parity_type === "string" ? doc.parity_type : null,
      format: f.format,
      config: f.config,
      required: f.required,
      multi: f.multi,
      sort: f.sort,
      unit: f.unit,
      relation_target: f.relation_target,
    };
    if (String(f.type) === "list" || spec.parity_type === "select" || spec.parity_type === "multi_select") {
      const options = await client.fieldOptions({ field_id: f.id });
      if (options.ok) {
        spec.options = options.data
          .map((o) => {
            const d = o.data as Record<string, unknown>;
            const word = d.title ?? d.name ?? d.label ?? d.value;
            return typeof word === "string" ? word : null;
          })
          .filter((x): x is string => !!x);
      }
    }
    out.push(spec);
  }
  return out;
}

export interface DetectedTable {
  id: string;
  name: string;
  description: string;
  fields: SnapshotField[];
  /** Rows available (up to the cap + 1, to know whether there are more). */
  rows: { id: string; document: Record<string, unknown> }[];
  /** True when the table holds more rows than the cap. */
  capped: boolean;
  /** Why it is in the kit: read by a binding, or pointed at by one of those tables. */
  reason: "binding" | "related";
}

export interface Detected {
  agent: AgentFacts;
  bindings: ReturnType<typeof mergeFieldBindings>;
  tables: DetectedTable[];
  workflows: SnapshotWorkflow[];
}

/** Everything the save flow shows, read once when an agent is picked. */
export async function detectSetup(client: RecordsClient, organizationId: string, agentId: string): Promise<Detected> {
  const agent = await readAgentFacts(agentId);
  const bindings = mergeFieldBindings(agent.variableDefinitions);

  const fieldsByTable: Record<string, SnapshotField[]> = {};
  for (const b of bindings) {
    if (!fieldsByTable[b.binding.table_id]) fieldsByTable[b.binding.table_id] = await readFields(client, b.binding.table_id);
  }
  // App-kept tables (a choice list, the "Kit installs" ledger, a feature's own table)
  // are the app's, not the person's data — they are never offered as kit tables.
  const kept = new Set<string>();
  const facts = await client.tableFacts();
  if (facts.ok && facts.data) {
    for (const f of facts.data) {
      if ((f as unknown as Record<string, unknown>).kept_by_the_app === true) kept.add(f.table_id);
    }
  }
  const ids = tablesToInclude(bindings, fieldsByTable).filter((id) => !kept.has(id));
  const direct = new Set(bindings.map((b) => b.binding.table_id));

  const tables: DetectedTable[] = [];
  for (const id of ids) {
    const fields = fieldsByTable[id] ?? (await readFields(client, id));
    const head = await client.recordRead({ record_id: id });
    if (!head.ok) throw new Error(`A table the agent reads could not be opened: ${head.error.message}`);
    const doc = head.data.document as Record<string, unknown>;
    const rows = await client.list({ table_id: id, limit: KIT_SAVE.seedRowCap + 1 });
    if (!rows.ok) throw new Error(`The rows of "${String(doc.name ?? "a table")}" could not be read: ${rows.error.message}`);
    const clean = rows.data.rows.map((r) => {
      const d: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r.document)) if (!k.startsWith("_")) d[k] = v;
      return { id: r.id, document: d };
    });
    tables.push({
      id,
      name: typeof doc.name === "string" && doc.name ? doc.name : "Untitled table",
      description: typeof doc.description === "string"
        ? doc.description.replace(/\n\nInstalled by the ".*" kit \(install [0-9a-f-]+\)\.$/, "")
        : "",
      fields,
      rows: clean.slice(0, KIT_SAVE.seedRowCap),
      capped: clean.length > KIT_SAVE.seedRowCap,
      reason: direct.has(id) ? "binding" : "related",
    });
  }

  // Workflows in this organization that name the agent or one of the tables.
  const refIds = [agentId, ...ids];
  const defs = await readAllRows(
    ({ from, to }) =>
      supabase
        .schema("workflow")
        .from("definition")
        .select("id, name, description, nodes, edges, channels, variables, entry_nodes", { count: "exact" })
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .range(from, to),
    { label: "workflow.definition (kit save)" },
  );
  const workflows: SnapshotWorkflow[] = defs
    .map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description ?? "",
      definition: {
        nodes: w.nodes ?? [],
        edges: w.edges ?? [],
        channels: w.channels ?? [],
        variables: w.variables ?? [],
        entry_nodes: w.entry_nodes ?? [],
      },
    }))
    .filter((w) => workflowReferences(w.definition, refIds));

  return { agent, bindings, tables, workflows };
}

/** Whether the organization's other members may fork this agent (agx_duplicate_agent needs viewer). */
export function agentForkableByOrg(agent: AgentFacts, organizationId: string): { ok: boolean; why: string | null } {
  if (agent.organizationId !== organizationId) {
    return { ok: false, why: "This agent lives in a different organization, so people here may not be able to copy it when they install the kit." };
  }
  if (agent.visibility === "personal") {
    return { ok: false, why: "This agent is private to you, so other people in the organization cannot copy it when they install the kit." };
  }
  return { ok: true, why: null };
}

