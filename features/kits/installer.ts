// features/kits/installer.ts — installing a kit, step by step, under the person.
//
// THE ORDER (PLAN.md § P2 + the owner's contract change, 2026-09-25):
//   0. the install record FIRST — a row in the organization's "Kit installs" table
//   1. each table            → `declareTable` (@ai-matrx/records/core)
//   2. each table's examples → `recordWriteMany` (one statement per table)
//   3. each agent            → `agx_duplicate_agent` via the `duplicateAgent` thunk (the ONE fork),
//                              then renamed/tagged from the manifest
//   4. each agent's bindings → the merge-field binding written onto the copy's variable
//   5. each workflow         → aidream `POST /workflows` through `callApi`
//   6. the install marked installed
//
// Every id a step creates is written to the install record BEFORE the next step
// starts, so a re-run RESUMES from recorded ids. Nothing is ever matched by name:
// a person's own same-named table is never adopted.
//
// Everything runs in the browser, as the person, in the organization they SET —
// the caller passes that id; nothing here picks one.

import { createRecordsClient, declareTable, type RecordsClient } from "@ai-matrx/records/core";
import type { NewFieldSpec } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { createClient } from "@/utils/supabase/client";
import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import type { AppDispatch } from "@/lib/redux/store";
import { duplicateAgent } from "@/features/agents/redux/agent-definition/thunks";
import { callApi } from "@/lib/api/call-api";
import type { components } from "@/types/python-generated/api-types";
import { deleteWorkflow } from "@/features/workflow-runtime/browse/service";
import { KIT_INSTALLS_TABLE, KIT_ROUTES, KIT_WORD } from "./constants";
import type {
  InstallStepView,
  KitBinding,
  KitInstallRecord,
  KitInstallSteps,
  KitManifest,
  MergeFieldBinding,
} from "./types";

// ─── the records client ─────────────────────────────────────────────────────

export function kitRecordsClient(organizationId: string, userId: string | null): RecordsClient {
  return createRecordsClient({
    dataSource: recordsDataSource(createClient()),
    actor: personActor(userId),
    organizationId,
  });
}

class InstallError extends Error {}

function refusal(what: string, message: string, hint?: string): InstallError {
  return new InstallError(`${what}: ${message}${hint ? ` (${hint})` : ""}`);
}

// ─── the ledger: "Kit installs" ─────────────────────────────────────────────

const LEDGER_FIELDS: NewFieldSpec[] = [
  { key: "kit_key", label: "Kit", type: "text", sort: 10 },
  { key: "kit_version", label: "Version", type: "number", sort: 20 },
  { key: "status", label: "Status", type: "text", sort: 30 },
  { key: "steps", label: "What it created", type: "long_text", sort: 40 },
  { key: "error", label: "Last problem", type: "long_text", sort: 50 },
];

/** The organization's install ledger, if it has one. Found by its reserved slug and its `kit_key` column. */
export async function findLedger(client: RecordsClient): Promise<string | null> {
  const tables = await client.tableList();
  if (!tables.ok) throw refusal("Could not list this organization's tables", tables.error.message, tables.error.hint);
  const ledger = tables.data.find((t) => t.slug === KIT_INSTALLS_TABLE.slug);
  return ledger ? ledger.id : null;
}

async function ensureLedger(client: RecordsClient): Promise<string> {
  const found = await findLedger(client);
  if (found) return found;
  const made = await declareTable(client, {
    name: KIT_INSTALLS_TABLE.name,
    slug: KIT_INSTALLS_TABLE.slug,
    labelSingular: "Kit install",
    labelPlural: KIT_INSTALLS_TABLE.name,
    titleField: "kit_key",
    fields: LEDGER_FIELDS,
  });
  if (!made.ok) throw refusal(`Could not make the "${KIT_INSTALLS_TABLE.name}" table`, made.error.message, made.error.hint);
  await client.recordUpdate({
    record_id: made.data,
    patch: {
      description: `Where this organization records each ${KIT_WORD.oneLower} it installed and exactly what that install created, so a re-run finishes it and a removal takes back only what it made.`,
    },
  });
  return made.data;
}

function parseSteps(raw: unknown): KitInstallSteps {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as KitInstallSteps) : {};
  } catch {
    console.error("[kits] an install record's steps are not JSON — treated as empty", raw);
    return {};
  }
}

/** The live (not removed) install of this kit in this organization, or null. */
export async function readInstall(
  client: RecordsClient,
  organizationId: string,
  kitKey: string,
): Promise<KitInstallRecord | null> {
  const ledger = await findLedger(client);
  if (!ledger) return null;
  const read = await client.list({ table_id: ledger, filter: { kit_key: kitKey }, limit: 50 });
  if (!read.ok) throw refusal("Could not read the install record", read.error.message, read.error.hint);
  const live = read.data.rows.find((r) => r.document.status !== "removed");
  if (!live) return null;
  const doc = live.document;
  return {
    id: live.id,
    kit_key: kitKey,
    kit_version: typeof doc.kit_version === "number" ? doc.kit_version : Number(doc.kit_version) || 1,
    organization_id: organizationId,
    status: (typeof doc.status === "string" ? doc.status : "installing") as KitInstallRecord["status"],
    steps: parseSteps(doc.steps),
    error: typeof doc.error === "string" && doc.error ? doc.error : null,
    ledger_table_id: ledger,
  };
}

async function saveInstall(client: RecordsClient, install: KitInstallRecord): Promise<void> {
  const saved = await client.recordUpdate({
    record_id: install.id,
    patch: {
      status: install.status,
      steps: JSON.stringify(install.steps),
      error: install.error ?? "",
    },
  });
  if (!saved.ok) throw refusal("Could not update the install record", saved.error.message, saved.error.hint);
}

// ─── the plan: which steps an install has ───────────────────────────────────

export function planSteps(manifest: KitManifest): InstallStepView[] {
  const steps: InstallStepView[] = [
    { id: "ledger", label: "Record the install", state: "pending" },
  ];
  for (const t of manifest.tables) {
    steps.push({ id: `table:${t.key}`, label: `Create the "${t.name}" table`, state: "pending" });
    if (t.records.length > 0) {
      steps.push({
        id: `records:${t.key}`,
        label: `Add ${t.records.length} example ${t.records.length === 1 ? "row" : "rows"} to "${t.name}"`,
        state: "pending",
      });
    }
  }
  for (const a of manifest.agents) {
    steps.push({ id: `agent:${a.key}`, label: `Copy the agent as "${a.name}"`, state: "pending" });
    if (a.bindings.length > 0) {
      const vars = a.bindings.map((b) => `{{${b.variable}}}`).join(", ");
      steps.push({ id: `bind:${a.key}`, label: `Connect ${vars} to your data`, state: "pending" });
    }
  }
  for (const w of manifest.workflows) {
    steps.push({ id: `workflow:${w.key}`, label: `Create the "${w.name}" workflow`, state: "pending" });
  }
  steps.push({ id: "finish", label: "Finish", state: "pending" });
  return steps;
}

/** What a recorded install has already done, as step states + doors. */
export function stepsFromInstall(manifest: KitManifest, install: KitInstallRecord | null): InstallStepView[] {
  const plan = planSteps(manifest);
  if (!install) return plan;
  const s = install.steps;
  return plan.map((step) => {
    const [kind, key] = step.id.split(":");
    switch (kind) {
      case "ledger":
        return { ...step, state: "done" };
      case "table": {
        const id = key ? s.tables?.[key] : undefined;
        return id
          ? { ...step, state: "done", links: [{ label: "Open table", href: KIT_ROUTES.table(id) }] }
          : step;
      }
      case "records": {
        const ids = key ? s.records?.[key] : undefined;
        return ids ? { ...step, state: "done", detail: `${ids.length} added` } : step;
      }
      case "agent": {
        const id = key ? s.agents?.[key] : undefined;
        return id
          ? { ...step, state: "done", links: [{ label: "Open agent", href: KIT_ROUTES.agent(id) }] }
          : step;
      }
      case "bind":
        return key && s.bindings?.[key] ? { ...step, state: "done" } : step;
      case "workflow": {
        const id = key ? s.workflows?.[key] : undefined;
        return id
          ? { ...step, state: "done", links: [{ label: "Open workflow", href: KIT_ROUTES.workflow(id) }] }
          : step;
      }
      case "finish":
        return install.status === "installed" ? { ...step, state: "done" } : step;
      default:
        return step;
    }
  });
}

// ─── value resolution ───────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A seed value that points at a row of another kit table: `{table_key, record_index}`. */
function resolveSeedValue(value: unknown, steps: KitInstallSteps): unknown {
  if (Array.isArray(value)) return value.map((v) => resolveSeedValue(v, steps));
  if (isRecord(value) && typeof value.table_key === "string" && typeof value.record_index === "number") {
    const id = steps.records?.[value.table_key]?.[value.record_index];
    if (!id) {
      throw new InstallError(
        `An example row points at row ${value.record_index + 1} of the kit's "${value.table_key}" table, which was not created.`,
      );
    }
    return id;
  }
  return value;
}

export function resolveBinding(binding: KitBinding, steps: KitInstallSteps): MergeFieldBinding {
  const { table_key, record_index, ...rest } = binding;
  const tableId = steps.tables?.[table_key];
  if (!tableId) throw new InstallError(`The binding names the kit's "${table_key}" table, which was not created.`);
  const out: MergeFieldBinding = { ...rest, table_id: tableId };
  if (typeof record_index === "number") {
    const recordId = steps.records?.[table_key]?.[record_index];
    if (!recordId) {
      throw new InstallError(`The binding names row ${record_index + 1} of "${table_key}", which was not created.`);
    }
    out.record_id = recordId;
  }
  return out;
}

/** `{{table:<key>}}` / `{{agent:<key>}}` → the ids this install created. */
function resolvePlaceholders(definition: unknown, steps: KitInstallSteps): unknown {
  const text = JSON.stringify(definition ?? {});
  const replaced = text.replace(/\{\{(table|agent|workflow):([a-zA-Z0-9_\-]+)\}\}/g, (_m, kind: string, key: string) => {
    const bag = kind === "table" ? steps.tables : kind === "agent" ? steps.agents : steps.workflows;
    const id = bag?.[key];
    if (!id) throw new InstallError(`The workflow names the kit's ${kind} "${key}", which was not created.`);
    return id;
  });
  return JSON.parse(replaced) as unknown;
}

function fieldSpecs(manifest: KitManifest, tableKey: string, steps: KitInstallSteps): NewFieldSpec[] {
  const table = manifest.tables.find((t) => t.key === tableKey)!;
  return table.fields.map((f, i) => {
    const spec: NewFieldSpec = {
      key: f.key,
      label: f.label,
      type: f.type as NewFieldSpec["type"],
      sort: f.sort ?? (i + 1) * 10,
      required: f.required ?? false,
    };
    if (f.multi) spec.multi = true;
    if (f.config) spec.config = f.config;
    if (f.options) spec.options = f.options;
    if (f.allowedTypes) spec.allowedTypes = f.allowedTypes;
    if (f.unit) spec.unit = f.unit;
    if (f.kind) spec.kind = f.kind;
    if (f.relation_table_key) {
      const target = steps.tables?.[f.relation_table_key];
      if (!target) {
        throw new InstallError(
          `The "${f.label}" column points at the kit's "${f.relation_table_key}" table, which has to be created first.`,
        );
      }
      spec.relationTarget = target;
    }
    return spec;
  });
}

// ─── the run ────────────────────────────────────────────────────────────────

export interface InstallContext {
  client: RecordsClient;
  dispatch: AppDispatch;
  organizationId: string;
  manifest: KitManifest;
  /** Called after every state change so the stepper redraws live. */
  onProgress: (steps: InstallStepView[], install: KitInstallRecord | null) => void;
}

function withState(
  steps: InstallStepView[],
  id: string,
  patch: Partial<InstallStepView>,
): InstallStepView[] {
  return steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

type CreateWorkflowBody = components["schemas"]["CreateWorkflowRequest"];

/**
 * Install (or finish installing) a kit. Resumes from the recorded ids. Returns the
 * install record; on failure the record says `failed` with the door's sentence and
 * everything created so far stays recorded.
 */
export async function runInstall(ctx: InstallContext): Promise<KitInstallRecord> {
  const { client, dispatch, organizationId, manifest, onProgress } = ctx;
  let install = await readInstall(client, organizationId, manifest.key);
  let view = stepsFromInstall(manifest, install);
  const emit = () => onProgress(view, install);
  let current = "ledger";

  const start = (id: string) => {
    current = id;
    view = withState(view, id, { state: "running", detail: undefined });
    emit();
  };
  const done = (id: string, patch: Partial<InstallStepView> = {}) => {
    view = withState(view, id, { state: "done", ...patch });
    emit();
  };
  const record = async () => {
    if (install) await saveInstall(client, install);
  };

  try {
    // 0 — THE INSTALL RECORD, FIRST.
    if (!install) {
      start("ledger");
      const ledger = await ensureLedger(client);
      const written = await client.recordWrite({
        table_id: ledger,
        data: {
          kit_key: manifest.key,
          kit_version: manifest.version,
          status: "installing",
          steps: "{}",
          error: "",
        },
      });
      if (!written.ok) throw refusal("Could not write the install record", written.error.message, written.error.hint);
      install = {
        id: written.data,
        kit_key: manifest.key,
        kit_version: manifest.version,
        organization_id: organizationId,
        status: "installing",
        steps: {},
        error: null,
        ledger_table_id: ledger,
      };
      done("ledger");
    } else {
      install = { ...install, status: "installing", error: null };
      await record();
    }
    const steps = install.steps;
    const installTag = install.id.slice(0, 8);

    // 1 + 2 — TABLES, THEN THEIR EXAMPLE ROWS.
    for (const table of manifest.tables) {
      const tableStep = `table:${table.key}`;
      if (!steps.tables?.[table.key]) {
        start(tableStep);
        const declared = await declareTable(client, {
          name: table.name,
          // A slug of its own per install: never collides with the person's tables, and
          // names the install that made it.
          slug: `kit_${manifest.key}_${table.key}_${installTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase().slice(0, 60),
          fields: fieldSpecs(manifest, table.key, steps),
          ...(table.fields[0] ? { titleField: table.fields[0].key } : {}),
        });
        if (!declared.ok) {
          throw refusal(`Could not create "${table.name}"`, declared.error.message, declared.error.hint);
        }
        steps.tables = { ...(steps.tables ?? {}), [table.key]: declared.data };
        await record();
        const described = await client.recordUpdate({
          record_id: declared.data,
          patch: {
            description: `${table.description}\n\nInstalled by the "${manifest.name}" ${KIT_WORD.oneLower} (install ${install.id}).`,
          },
        });
        if (!described.ok) {
          console.warn(`[kits] "${table.name}" was made but its description was not saved: ${described.error.message}`);
        }
        done(tableStep, { links: [{ label: "Open table", href: KIT_ROUTES.table(declared.data) }] });
      }
    }
    for (const table of manifest.tables) {
      if (table.records.length === 0) continue;
      const recordsStep = `records:${table.key}`;
      if (steps.records?.[table.key]) continue;
      start(recordsStep);
      const tableId = steps.tables![table.key]!;
      const rows = table.records.map((r) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) out[k] = resolveSeedValue(v, steps);
        return out;
      });
      const written = await client.recordWriteMany({ table_id: tableId, rows });
      if (!written.ok) {
        throw refusal(`Could not add the example rows to "${table.name}"`, written.error.message, written.error.hint);
      }
      steps.records = { ...(steps.records ?? {}), [table.key]: written.data };
      await record();
      done(recordsStep, { detail: `${written.data.length} added` });
    }

    // 3 + 4 — AGENTS, THEN THEIR BINDINGS.
    for (const agent of manifest.agents) {
      const agentStep = `agent:${agent.key}`;
      if (!steps.agents?.[agent.key]) {
        start(agentStep);
        let newId: string;
        try {
          newId = await dispatch(duplicateAgent(agent.source_agent_id)).unwrap();
        } catch (err) {
          const message = err instanceof Error ? err.message : isRecord(err) && typeof err.message === "string" ? err.message : String(err);
          throw new InstallError(`Could not copy the agent: ${message}`);
        }
        steps.agents = { ...(steps.agents ?? {}), [agent.key]: newId };
        await record();
        // Named from the manifest (never "… (Copy)") and tagged with the install.
        const { data: row, error: readError } = await supabase
          .schema("agent")
          .from("definition")
          .select("tags")
          .eq("id", newId)
          .single();
        if (readError) throw new InstallError(`The agent was copied but could not be read back: ${readError.message}`);
        const tags = Array.from(new Set([...(row.tags ?? []), `kit:${manifest.key}`, `kit-install:${install.id}`]));
        const { error: renameError } = await supabase
          .schema("agent")
          .from("definition")
          .update({ name: agent.name, description: agent.description, tags })
          .eq("id", newId);
        if (renameError) throw new InstallError(`The agent was copied but could not be renamed: ${renameError.message}`);
        done(agentStep, { links: [{ label: "Open agent", href: KIT_ROUTES.agent(newId) }] });
      }
      const bindStep = `bind:${agent.key}`;
      if (agent.bindings.length > 0 && !steps.bindings?.[agent.key]) {
        start(bindStep);
        const agentId = steps.agents![agent.key]!;
        const { data: row, error } = await supabase
          .schema("agent")
          .from("definition")
          .select("variable_definitions")
          .eq("id", agentId)
          .single();
        if (error) throw new InstallError(`Could not read the copied agent's variables: ${error.message}`);
        // Read and written RAW: every other key of every variable is kept byte-for-byte.
        const defs = Array.isArray(row.variable_definitions)
          ? (row.variable_definitions as unknown[]).map((d) => (isRecord(d) ? { ...d } : d))
          : [];
        for (const b of agent.bindings) {
          const idx = defs.findIndex((d) => isRecord(d) && d.name === b.variable);
          if (idx < 0) {
            throw new InstallError(
              `The copied agent has no variable named {{${b.variable}}}, so it cannot be connected. The kit expects the source agent to declare it.`,
            );
          }
          (defs[idx] as Record<string, unknown>).binding = resolveBinding(b.binding, steps);
        }
        const { error: saveError } = await supabase
          .schema("agent")
          .from("definition")
          .update({ variable_definitions: defs as Json })
          .eq("id", agentId);
        if (saveError) throw new InstallError(`Could not save the agent's connections: ${saveError.message}`);
        steps.bindings = { ...(steps.bindings ?? {}), [agent.key]: true };
        await record();
        done(bindStep);
      }
    }

    // 5 — WORKFLOWS.
    for (const wf of manifest.workflows) {
      const wfStep = `workflow:${wf.key}`;
      if (steps.workflows?.[wf.key]) continue;
      start(wfStep);
      const definition = resolvePlaceholders(wf.definition, steps) as CreateWorkflowBody["definition"];
      const result = await dispatch(
        callApi({
          path: "/workflows",
          method: "POST",
          body: {
            name: wf.name,
            description: wf.description,
            definition,
            tags: [`kit:${manifest.key}`, `kit-install:${install.id}`],
          },
        }),
      );
      if (result.error) throw new InstallError(`Could not create the workflow: ${result.error.message}`);
      const created = result.data as components["schemas"]["DefinitionRecord"] | undefined;
      // `POST /workflows` answers the live definition row: its `id` IS the workflow.
      const workflowId = created?.id ?? created?.definition_id ?? null;
      if (!workflowId) throw new InstallError("The workflow was created but the server sent back no id.");
      steps.workflows = { ...(steps.workflows ?? {}), [wf.key]: workflowId };
      await record();
      done(wfStep, { links: [{ label: "Open workflow", href: KIT_ROUTES.workflow(workflowId) }] });
    }

    // 6 — DONE.
    start("finish");
    install = { ...install, status: "installed", error: null };
    await record();
    done("finish");
    return install;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    view = withState(view, current, { state: "failed", detail: message });
    if (install) {
      install = { ...install, status: "failed", error: message };
      try {
        await saveInstall(client, install);
      } catch (saveErr) {
        console.error("[kits] the failure could not be written to the install record", saveErr);
      }
    }
    emit();
    throw err instanceof Error ? err : new Error(message);
  }
}

// ─── removal: exactly the recorded ids ──────────────────────────────────────

export interface RemovalSummary {
  tables: number;
  agents: number;
  workflows: number;
}

export function removalSummary(install: KitInstallRecord): RemovalSummary {
  return {
    tables: Object.keys(install.steps.tables ?? {}).length,
    agents: Object.keys(install.steps.agents ?? {}).length,
    workflows: Object.keys(install.steps.workflows ?? {}).length,
  };
}

/**
 * Archive exactly what this install recorded — its tables (with their rows), its
 * agent copies and its workflows — then mark the record removed. All three are the
 * platform's soft deletes; nothing is destroyed.
 */
export async function removeInstall(client: RecordsClient, install: KitInstallRecord): Promise<void> {
  const problems: string[] = [];
  for (const id of Object.values(install.steps.workflows ?? {})) {
    try {
      await deleteWorkflow(id);
    } catch (err) {
      problems.push(`workflow ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const id of Object.values(install.steps.agents ?? {})) {
    const { error } = await supabase
      .schema("agent")
      .from("definition")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) problems.push(`agent ${id}: ${error.message}`);
  }
  for (const id of Object.values(install.steps.tables ?? {})) {
    // The door archives in passes; loop until it says done.
    for (let pass = 0; pass < 200; pass++) {
      const r = await client.tableArchive({ table_id: id });
      if (!r.ok) {
        problems.push(`table ${id}: ${r.error.message}`);
        break;
      }
      if (r.data.done) break;
    }
  }
  const next: KitInstallRecord = {
    ...install,
    status: problems.length > 0 ? "failed" : "removed",
    error: problems.length > 0 ? `Removal left some things behind — ${problems.join("; ")}` : null,
  };
  await saveInstall(client, next);
  if (problems.length > 0) throw new Error(next.error!);
}
