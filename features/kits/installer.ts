// features/kits/installer.ts — installing a kit, step by step, under the person.
//
// THE ORDER (PLAN.md § P2 + the owner's contract change, 2026-09-25):
//   0. the install record FIRST — a row in the organization's "Kit installs" table,
//      claimed under a UNIQUE rule (one live install per kit per organization)
//   1. per table: `declareTable`, then its example rows (`recordWriteMany`)
//   2. per agent: `agx_duplicate_agent` via the `duplicateAgent` thunk (the ONE fork),
//      renamed/tagged from the manifest, then the merge-field bindings written
//   3. per workflow: aidream `POST /workflows` through `callApi`
//   4. the install marked installed
//
// Every id a step creates is written to the install record BEFORE the next step
// starts, so a re-run RESUMES from recorded ids. Nothing is ever matched by name:
// a person's own same-named table is never adopted.
//
// ONE ORGANIZATION FOR THE WHOLE RUN: the caller captures it at the start and it is
// passed EXPLICITLY to every writer (the records client, the agent fork, the
// workflow create). Nothing here reads the active organization mid-install.
//
// CONCURRENCY, AT THE DATA LAYER: a brand-new install record is written with a
// DETERMINISTIC id — a name-based UUID of (organization, kit, how many earlier installs
// of it were removed). Two tabs racing compute the same id, the store's primary key
// refuses the second write (23505), and that tab attaches to the existing record.
// (A promoted UNIQUE column was tried first: building its index is not a door a person
// may open — `custom.promote_field` is not executable by `authenticated`.) Resuming an
// existing record takes a lease (`run_id` + `run_until`) and every later write of the
// record carries the version it last wrote (`expectedVersion`), so a second runner
// that slipped past the lease loses its next write and stops.

import {
  createRecordsClient,
  declareTable,
  fieldDeclarationFor,
  type RecordsClient,
  type NewFieldSpec,
} from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { guardedUpdate } from "@ai-matrx/data/db";
import { createClient, supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import type { AppDispatch } from "@/lib/redux/store";
import { duplicateAgent } from "@/features/agents/redux/agent-definition/thunks";
import { callApi } from "@/lib/api/call-api";
import type { components } from "@/types/python-generated/api-types";
import { setWorkflowFlag } from "@/features/workflow-runtime/browse/service";
import { saveAgentField } from "@/features/agents/redux/agent-definition/thunks";
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

/** Another tab (or person) holds this install right now. */
export class InstallBusyError extends Error {}

function refusal(what: string, message: string, hint?: string): InstallError {
  return new InstallError(`${what}: ${message}${hint ? ` (${hint})` : ""}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ─── the ledger: "Kit installs" ─────────────────────────────────────────────

/** How long a runner's claim on an install lasts without a write renewing it. */
const RUN_LEASE_MS = 3 * 60_000;

const LEDGER_FIELDS: NewFieldSpec[] = [
  { key: "kit_key", label: "Kit", type: "text", sort: 10 },
  { key: "kit_version", label: "Version", type: "number", sort: 20 },
  { key: "status", label: "Status", type: "text", sort: 30 },
  { key: "steps", label: "What it created", type: "long_text", sort: 40 },
  { key: "error", label: "Last problem", type: "long_text", sort: 50 },
  { key: "run_id", label: "Running in", type: "text", sort: 70 },
  { key: "run_until", label: "Running until", type: "text", sort: 80 },
];

/** The organization's install ledger, if it has one. Found by its reserved slug. */
export async function findLedger(client: RecordsClient): Promise<string | null> {
  const tables = await client.tableList();
  if (!tables.ok) throw refusal("Could not list this organization's tables", tables.error.message, tables.error.hint);
  const ledger = tables.data.find((t) => t.slug === KIT_INSTALLS_TABLE.slug);
  return ledger ? ledger.id : null;
}

/**
 * The ledger with its full shape: every column, and the table
 * itself kept by the app (it lives in the app lane, not the person's data list)
 * and closed to agents. Idempotent — safe on every install start.
 */
async function ensureLedger(client: RecordsClient): Promise<string> {
  let ledger = await findLedger(client);
  if (!ledger) {
    const made = await declareTable(client, {
      name: KIT_INSTALLS_TABLE.name,
      slug: KIT_INSTALLS_TABLE.slug,
      labelSingular: "Kit install",
      labelPlural: KIT_INSTALLS_TABLE.name,
      titleField: "kit_key",
      fields: LEDGER_FIELDS,
    });
    if (!made.ok) throw refusal(`Could not make the "${KIT_INSTALLS_TABLE.name}" table`, made.error.message, made.error.hint);
    ledger = made.data;
  }
  const placed = await client.recordUpdate({
    record_id: ledger,
    patch: {
      description: `Where this organization records each ${KIT_WORD.oneLower} it installed and exactly what that install created, so a re-run finishes it and a removal takes back only what it made. Kept by the app.`,
      kept_by_the_app: true,
      kept_for: "kits",
      agent_writable: false,
    },
  });
  if (!placed.ok) {
    throw refusal(`Could not mark the "${KIT_INSTALLS_TABLE.name}" table as kept by the app`, placed.error.message, placed.error.hint);
  }
  const fields = await client.fields({ table_id: ledger });
  if (!fields.ok) throw refusal("Could not read the install table's columns", fields.error.message, fields.error.hint);
  const have = new Set(fields.data.map((f) => f.key));
  for (const spec of LEDGER_FIELDS) {
    if (have.has(spec.key)) continue;
    const added = await client.fieldDeclare({ table_id: ledger, spec: fieldDeclarationFor(spec) });
    if (!added.ok) throw refusal(`Could not add the "${spec.label}" column to the install table`, added.error.message, added.error.hint);
  }
  return ledger;
}

/** RFC 4122 name-based (SHA-1, v5) UUID — the same inputs give the same id in every tab. */
async function nameBasedUuid(name: string): Promise<string> {
  // A fixed namespace for kit installs (itself a random v4, chosen once).
  const ns = "6f1c2c3e-8d7a-4a51-9b0e-3c2d1f4e5a6b".replace(/-/g, "");
  const nsBytes = new Uint8Array(ns.match(/../g)!.map((h) => parseInt(h, 16)));
  const nameBytes = new TextEncoder().encode(name);
  const buf = new Uint8Array(nsBytes.length + nameBytes.length);
  buf.set(nsBytes);
  buf.set(nameBytes, nsBytes.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", buf)).slice(0, 16);
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * EVERY record of a table matching a filter — paged until a short page, never one
 * capped read. A count or an existence check over a capped list goes confidently
 * wrong (the claim id below is derived from this count).
 */
async function listAll(
  client: RecordsClient,
  tableId: string,
  filter: Record<string, string>,
): Promise<{ id: string; document: Record<string, unknown> }[]> {
  const PAGE = 200;
  const out: { id: string; document: Record<string, unknown> }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await client.list({ table_id: tableId, filter, limit: PAGE, offset });
    if (!page.ok) throw refusal("Could not read the install records", page.error.message, page.error.hint);
    for (const r of page.data.rows) out.push({ id: r.id, document: r.document as Record<string, unknown> });
    if (page.data.rows.length < PAGE) return out;
  }
}

/** The option tables a table's choice columns keep their choices in (the store makes them on declare). */
async function optionTablesOf(client: RecordsClient, tableId: string): Promise<string[]> {
  const fields = await client.fields({ table_id: tableId });
  if (!fields.ok) return [];
  const ids = new Set<string>();
  for (const f of fields.data) {
    const id = isRecord(f.config) ? f.config.options_table_id : null;
    if (typeof id === "string" && id) ids.add(id);
  }
  return [...ids];
}

function parseSteps(raw: unknown): KitInstallSteps {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as KitInstallSteps) : {};
  } catch {
    console.error("[kits] an install record's steps are not JSON — treated as empty", raw);
    return {};
  }
}

interface LedgerRow {
  install: KitInstallRecord;
  runId: string | null;
  runUntil: number | null;
}

async function readLedgerRow(
  client: RecordsClient,
  organizationId: string,
  kitKey: string,
): Promise<LedgerRow | null> {
  const ledger = await findLedger(client);
  if (!ledger) return null;
  const rows = await listAll(client, ledger, { kit_key: kitKey });
  const live = rows.find((r) => r.document.status !== "removed");
  if (!live) return null;
  const doc = live.document;
  const until = typeof doc.run_until === "string" ? Date.parse(doc.run_until) : NaN;
  return {
    install: {
      id: live.id,
      kit_key: kitKey,
      kit_version: typeof doc.kit_version === "number" ? doc.kit_version : Number(doc.kit_version) || 1,
      organization_id: organizationId,
      status: (typeof doc.status === "string" ? doc.status : "installing") as KitInstallRecord["status"],
      steps: parseSteps(doc.steps),
      error: typeof doc.error === "string" && doc.error ? doc.error : null,
      ledger_table_id: ledger,
    },
    runId: typeof doc.run_id === "string" && doc.run_id ? doc.run_id : null,
    runUntil: Number.isFinite(until) ? until : null,
  };
}

/** The live (not removed) install of this kit in this organization, or null. */
export async function readInstall(
  client: RecordsClient,
  organizationId: string,
  kitKey: string,
): Promise<KitInstallRecord | null> {
  return (await readLedgerRow(client, organizationId, kitKey))?.install ?? null;
}

/** Whether somebody else is running this install right now. */
export async function installRunningElsewhere(
  client: RecordsClient,
  organizationId: string,
  kitKey: string,
  myRunId: string | null,
): Promise<boolean> {
  const row = await readLedgerRow(client, organizationId, kitKey);
  return !!row && !!row.runId && row.runId !== myRunId && (row.runUntil ?? 0) > Date.now();
}

/** A write of the install record that must follow the version this runner last wrote. */
interface RecordWriter {
  save: (install: KitInstallRecord, extra?: Record<string, unknown>) => Promise<void>;
}

function versionedWriter(client: RecordsClient, runId: string, startVersion: number): RecordWriter {
  let version = startVersion;
  return {
    async save(install, extra = {}) {
      const saved = await client.recordUpdate({
        record_id: install.id,
        expectedVersion: version,
        patch: {
          status: install.status,
          steps: JSON.stringify(install.steps),
          error: install.error ?? "",
          run_id: runId,
          run_until: new Date(Date.now() + RUN_LEASE_MS).toISOString(),
          ...extra,
        },
      });
      if (!saved.ok) {
        throw new InstallBusyError(
          `This ${KIT_WORD.oneLower} is being installed somewhere else at the same time (another tab or another person), so this run stopped to avoid doing the same work twice. ${saved.error.message}`,
        );
      }
      version = saved.data;
    },
  };
}

// ─── the plan: which steps an install has (the order the installer runs) ────

export function planSteps(manifest: KitManifest): InstallStepView[] {
  const steps: InstallStepView[] = [{ id: "ledger", label: "Record the install", state: "pending" }];
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
        return id ? { ...step, state: "done", links: [{ label: "Open table", href: KIT_ROUTES.table(id) }] } : step;
      }
      case "records": {
        const ids = key ? s.records?.[key] : undefined;
        return ids ? { ...step, state: "done", detail: `${ids.length} added` } : step;
      }
      case "agent": {
        const id = key ? s.agents?.[key] : undefined;
        return id ? { ...step, state: "done", links: [{ label: "Open agent", href: KIT_ROUTES.agent(id) }] } : step;
      }
      case "bind":
        return key && s.bindings?.[key] ? { ...step, state: "done" } : step;
      case "workflow": {
        const id = key ? s.workflows?.[key] : undefined;
        return id ? { ...step, state: "done", links: [{ label: "Open workflow", href: KIT_ROUTES.workflow(id) }] } : step;
      }
      case "finish":
        return install.status === "installed" ? { ...step, state: "done" } : step;
      default:
        return step;
    }
  });
}

// ─── value resolution ───────────────────────────────────────────────────────

/** A seed value that points at a row of another kit table: `{table_key, record_index}`. */
function resolveSeedValue(value: unknown, steps: KitInstallSteps): unknown {
  if (Array.isArray(value)) return value.map((v) => resolveSeedValue(v, steps));
  if (isRecord(value) && typeof value.table_key === "string" && typeof value.record_index === "number") {
    const id = steps.records?.[value.table_key]?.[value.record_index];
    if (!id) {
      throw new InstallError(
        `An example row points at row ${value.record_index + 1} of the kit's "${value.table_key}" table, which has not been created yet.`,
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

// ─── the agent writes: guarded, and they must change a row ──────────────────

interface AgentRow {
  id: string;
  version: number;
  tags: string[] | null;
  variable_definitions: Json | null;
}

async function readAgentRow(agentId: string): Promise<AgentRow> {
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("id, version, tags, variable_definitions")
    .eq("id", agentId)
    .maybeSingle();
  if (error) throw new InstallError(`The copied agent could not be read: ${error.message}`);
  if (!data) throw new InstallError("The copied agent could not be found — it may have been deleted, or you may not read it.");
  return data as AgentRow;
}

/** One guarded write to the copied agent. `not_found` / `conflict` are named failures, never a silent no-op. */
async function writeAgent(
  agentId: string,
  what: string,
  build: (current: AgentRow) => Partial<{ name: string; description: string; tags: string[]; variable_definitions: Json }>,
): Promise<void> {
  const base = await readAgentRow(agentId);
  const result = await guardedUpdate<AgentRow>({
    expectedVersion: base.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      supabase
        .schema("agent")
        .from("definition")
        .update({ ...build(base), version: nextVersion })
        .eq("id", agentId)
        .eq("version", expectedVersion)
        .select("id, version, tags, variable_definitions")
        .maybeSingle(),
    fetchCurrent: () =>
      supabase
        .schema("agent")
        .from("definition")
        .select("id, version, tags, variable_definitions")
        .eq("id", agentId)
        .maybeSingle(),
  });
  if (result.status === "not_found") {
    throw new InstallError(`Could not ${what}: the copied agent was not found, or you may not edit it.`);
  }
  if (result.status === "conflict") {
    throw new InstallError(`Could not ${what}: the agent changed while the kit was writing to it. Finish the install to try again.`);
  }
}

// ─── the run ────────────────────────────────────────────────────────────────

export interface InstallContext {
  client: RecordsClient;
  dispatch: AppDispatch;
  /** Captured once, at the click. Every writer receives THIS id. */
  organizationId: string;
  manifest: KitManifest;
  /** This tab's run id — the lease holder. */
  runId: string;
  /** Called after every state change so the stepper redraws live. */
  onProgress: (steps: InstallStepView[], install: KitInstallRecord | null) => void;
}

function withState(steps: InstallStepView[], id: string, patch: Partial<InstallStepView>): InstallStepView[] {
  return steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

type CreateWorkflowBody = components["schemas"]["CreateWorkflowRequest"];

/**
 * Install (or finish installing) a kit. Resumes from the recorded ids. Returns the
 * install record; on failure the record says `failed` with the door's sentence and
 * everything created so far stays recorded. Throws `InstallBusyError` when another
 * runner holds the install.
 */
export async function runInstall(ctx: InstallContext): Promise<KitInstallRecord> {
  const { client, dispatch, organizationId, manifest, onProgress, runId } = ctx;
  let view: InstallStepView[] = planSteps(manifest);
  let install: KitInstallRecord | null = null;
  let writer: RecordWriter | null = null;
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
    if (install && writer) await writer.save(install);
  };

  try {
    // 0 — THE INSTALL RECORD, FIRST, CLAIMED.
    start("ledger");
    const ledger = await ensureLedger(client);
    let row = await readLedgerRow(client, organizationId, manifest.key);
    if (!row) {
      const generation = (await listAll(client, ledger, { kit_key: manifest.key })).length;
      const claimId = await nameBasedUuid(`${organizationId}:${manifest.key}:${generation}`);
      const written = await client.recordWriteMany({
        table_id: ledger,
        ids: [claimId],
        rows: [
          {
            kit_key: manifest.key,
            kit_version: manifest.version,
            status: "installing",
            steps: "{}",
            error: "",
            run_id: runId,
            run_until: new Date(Date.now() + RUN_LEASE_MS).toISOString(),
          },
        ],
      });
      if (!written.ok) {
        if (written.error.code === "already_exists" || written.error.sqlstate === "23505") {
          throw new InstallBusyError(
            `This ${KIT_WORD.oneLower} is already being installed in this organization (another tab or another person started it a moment ago). Showing that install.`,
          );
        }
        throw refusal("Could not write the install record", written.error.message, written.error.hint);
      }
      row = await readLedgerRow(client, organizationId, manifest.key);
      if (!row || row.install.id !== claimId) {
        throw new InstallError("The install record was written but could not be read back.");
      }
    } else if (row.runId && row.runId !== runId && (row.runUntil ?? 0) > Date.now()) {
      throw new InstallBusyError(
        `This ${KIT_WORD.oneLower} is already being installed in this organization (another tab or another person is running it). Showing that install.`,
      );
    }
    install = { ...row.install, status: "installing", error: null };
    // The lease: an unversioned claim answers the version; every later write follows it.
    const claimed = await client.recordUpdate({
      record_id: install.id,
      patch: {
        status: "installing",
        error: "",
        run_id: runId,
        run_until: new Date(Date.now() + RUN_LEASE_MS).toISOString(),
      },
    });
    if (!claimed.ok) throw refusal("Could not claim the install record", claimed.error.message, claimed.error.hint);
    writer = versionedWriter(client, runId, claimed.data);
    await record(); // proves the claim is ours before anything is created
    view = stepsFromInstall(manifest, install).map((s) => (s.id === "finish" ? { ...s, state: "pending" as const } : s));
    done("ledger");
    const steps = install.steps;
    const installTag = install.id.slice(0, 8);

    // 1 — PER TABLE: THE TABLE, THEN ITS EXAMPLE ROWS.
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
        if (!declared.ok) throw refusal(`Could not create "${table.name}"`, declared.error.message, declared.error.hint);
        steps.tables = { ...(steps.tables ?? {}), [table.key]: declared.data };
        await record();
        // A choice column's choices live in a table the store makes on declare — it is
        // this install's too, and removal takes it back with the main table.
        const optionTables = await optionTablesOf(client, declared.data);
        if (optionTables.length > 0) {
          steps.optionTables = { ...(steps.optionTables ?? {}), [table.key]: optionTables };
          await record();
        }
        const described = await client.recordUpdate({
          record_id: declared.data,
          patch: {
            description: `${table.description}\n\nInstalled by the "${manifest.name}" ${KIT_WORD.oneLower} (install ${install.id}).`,
          },
        });
        if (!described.ok) {
          throw refusal(
            `"${table.name}" was made but could not be labelled with its install (so it could not be removed safely later)`,
            described.error.message,
            described.error.hint,
          );
        }
        done(tableStep, { links: [{ label: "Open table", href: KIT_ROUTES.table(declared.data) }] });
      }
      if (table.records.length > 0 && !steps.records?.[table.key]) {
        const recordsStep = `records:${table.key}`;
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
        if (written.data.length !== rows.length) {
          throw new InstallError(`"${table.name}" was handed ${rows.length} example rows and kept ${written.data.length}.`);
        }
        steps.records = { ...(steps.records ?? {}), [table.key]: written.data };
        await record();
        done(recordsStep, { detail: `${written.data.length} added` });
      }
    }

    // 2 — AGENTS, THEN THEIR BINDINGS.
    for (const agent of manifest.agents) {
      const agentStep = `agent:${agent.key}`;
      if (!steps.agents?.[agent.key]) {
        start(agentStep);
        let newId: string;
        try {
          newId = await dispatch(
            duplicateAgent({ agentId: agent.source_agent_id, organizationId }),
          ).unwrap();
        } catch (err) {
          const message = err instanceof Error ? err.message : isRecord(err) && typeof err.message === "string" ? err.message : String(err);
          throw new InstallError(`Could not copy the agent: ${message}`);
        }
        steps.agents = { ...(steps.agents ?? {}), [agent.key]: newId };
        await record();
        // Named from the manifest (never "… (Copy)") and tagged with the install.
        await writeAgent(newId, "rename the copied agent", (cur) => ({
          name: agent.name,
          description: agent.description,
          tags: Array.from(new Set([...(cur.tags ?? []), `kit:${manifest.key}`, `kit-install:${install!.id}`])),
        }));
        done(agentStep, { links: [{ label: "Open agent", href: KIT_ROUTES.agent(newId) }] });
      }
      const bindStep = `bind:${agent.key}`;
      if (agent.bindings.length > 0 && !steps.bindings?.[agent.key]) {
        start(bindStep);
        const agentId = steps.agents![agent.key]!;
        await writeAgent(agentId, "connect the agent's variables to your data", (cur) => {
          // Read and written RAW: every other key of every variable is kept byte-for-byte.
          const defs = Array.isArray(cur.variable_definitions)
            ? (cur.variable_definitions as unknown[]).map((d) => (isRecord(d) ? { ...d } : d))
            : [];
          for (const b of agent.bindings) {
            const idx = defs.findIndex((d) => isRecord(d) && d.name === b.variable);
            if (idx < 0) {
              throw new InstallError(
                `The copied agent has no variable named {{${b.variable}}}, so it cannot be connected. The kit expects the source agent to declare it.`,
              );
            }
            const def = defs[idx] as Record<string, unknown>;
            def.binding = resolveBinding(b.binding, steps);
            // The bound value is the truth; a stale default would only mislead. A missing
            // value is announced by the binding itself (`missing`).
            def.defaultValue = null;
          }
          return { variable_definitions: defs as Json };
        });
        steps.bindings = { ...(steps.bindings ?? {}), [agent.key]: true };
        await record();
        done(bindStep);
      }
    }

    // 3 — WORKFLOWS.
    for (const wf of manifest.workflows) {
      const wfStep = `workflow:${wf.key}`;
      if (steps.workflows?.[wf.key]) continue;
      start(wfStep);
      const definition = resolvePlaceholders(wf.definition, steps) as CreateWorkflowBody["definition"];
      const result = await dispatch(
        callApi({
          path: "/workflows",
          method: "POST",
          // The captured organization, not whatever is active when this line runs.
          scopeOverrides: { organization_id: organizationId },
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

    // 4 — DONE. The lease is released.
    start("finish");
    install = { ...install, status: "installed", error: null };
    await writer.save(install, { run_id: "", run_until: "" });
    done("finish");
    return install;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    view = withState(view, current, { state: "failed", detail: message });
    if (install && writer && !(err instanceof InstallBusyError)) {
      install = { ...install, status: "failed", error: message };
      try {
        await writer.save(install, { run_id: "", run_until: "" });
      } catch (saveErr) {
        console.error("[kits] the failure could not be written to the install record", saveErr);
      }
    }
    emit();
    throw err instanceof Error ? err : new Error(message);
  }
}

/** Archive one table in passes; answers the problem, or null when it is done. */
async function archiveTable(client: RecordsClient, tableId: string): Promise<string | null> {
  const archived = await client.tableArchived({ table_id: tableId });
  if (archived.ok && archived.data) return null; // already in the archive
  const MAX_PASSES = 200;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const r = await client.tableArchive({ table_id: tableId });
    if (!r.ok) return r.error.message;
    if (r.data.done) return null;
  }
  return `only partly archived after ${MAX_PASSES} passes — remove it again to continue where it stopped`;
}

// ─── removal: exactly the recorded ids, and only if they are still this install's ─

export interface RemovalFacts {
  tables: { id: string; name: string; rows: number; retentionDays: number | null }[];
  /** Choice lists the store made for those tables' choice columns. */
  optionTables: number;
  agents: number;
  workflows: number;
  /** Conversations people have had with the copied agent(s). */
  conversations: number | null;
}

/** What a removal would archive and what depends on it — read before the confirm dialog. */
export async function removalFacts(client: RecordsClient, install: KitInstallRecord): Promise<RemovalFacts> {
  const tableIds = Object.values(install.steps.tables ?? {});
  const agentIds = Object.values(install.steps.agents ?? {});
  const list = await client.tableList();
  const tables = tableIds.map((id) => {
    const t = list.ok ? list.data.find((x) => x.id === id) : undefined;
    const rowsFromSteps = Object.entries(install.steps.tables ?? {}).find(([, v]) => v === id)?.[0];
    return {
      id,
      name: t?.name ?? "a kit table",
      rows: rowsFromSteps ? (install.steps.records?.[rowsFromSteps]?.length ?? 0) : 0,
      retentionDays: t?.retention_days ?? null,
    };
  });
  let conversations: number | null = null;
  if (agentIds.length > 0) {
    const { count, error } = await supabase
      .schema("chat")
      .from("conversation")
      .select("id", { count: "exact", head: true })
      .in("initial_agent_id", agentIds)
      .is("deleted_at", null);
    conversations = error ? null : (count ?? 0);
  }
  let optionTables = 0;
  for (const id of tableIds) optionTables += new Set([...(await optionTablesOf(client, id))]).size;
  return {
    tables,
    optionTables,
    agents: agentIds.length,
    workflows: Object.keys(install.steps.workflows ?? {}).length,
    conversations,
  };
}

/**
 * Archive exactly what this install recorded — its tables (with their rows), its
 * agent copies and its workflows — then mark the record removed. All three are the
 * platform's soft deletes; nothing is destroyed. An id that no longer carries this
 * install's label (table description / agent or workflow tag) is REFUSED by name:
 * something else may be using it now.
 */
export async function removeInstall(
  client: RecordsClient,
  install: KitInstallRecord,
  dispatch: AppDispatch,
): Promise<void> {
  // The record is written at the end with columns an older ledger may not have yet.
  await ensureLedger(client);
  const problems: string[] = [];
  const tag = `kit-install:${install.id}`;

  for (const id of Object.values(install.steps.workflows ?? {})) {
    const { data, error } = await supabase.schema("workflow").from("definition").select("id, tags").eq("id", id).maybeSingle();
    if (error) {
      problems.push(`workflow ${id} could not be checked (${error.message})`);
      continue;
    }
    if (!data) continue; // already gone
    if (!(data.tags ?? []).includes(tag)) {
      problems.push(`workflow ${id} was left alone: it no longer carries this install's label`);
      continue;
    }
    try {
      // The workflows list's own Archive — restorable from its Archived view.
      await setWorkflowFlag(id, { is_archived: true });
    } catch (err) {
      problems.push(`workflow ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const id of Object.values(install.steps.agents ?? {})) {
    const { data: row, error: readError } = await supabase.schema("agent").from("definition").select("id, tags").eq("id", id).maybeSingle();
    if (readError) {
      problems.push(`agent ${id} could not be checked (${readError.message})`);
      continue;
    }
    if (!row) continue;
    if (!(row.tags ?? []).includes(tag)) {
      problems.push(`agent ${id} was left alone: it no longer carries this install's label`);
      continue;
    }
    try {
      // The agents list's own Archive (`is_archived`) — restorable from its Archived view.
      await dispatch(saveAgentField({ agentId: id, field: "isArchived", value: true as never })).unwrap();
    } catch (err) {
      problems.push(`agent ${id} was not archived: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const id of Object.values(install.steps.tables ?? {})) {
    const read = await client.recordRead({ record_id: id });
    if (!read.ok) {
      // Already in the archive (an earlier removal got this far) is done, not a problem.
      const archived = await client.tableArchived({ table_id: id });
      if (archived.ok && archived.data) {
        // The main table went first last time; its recorded choice lists still go.
        const key = Object.entries(install.steps.tables ?? {}).find(([, v]) => v === id)?.[0];
        for (const optionId of key ? (install.steps.optionTables?.[key] ?? []) : []) {
          const p = await archiveTable(client, optionId);
          if (p) problems.push(`the choice list ${optionId} of table ${id}: ${p}`);
        }
        continue;
      }
      problems.push(`table ${id} could not be checked (${read.error.message})`);
      continue;
    }
    const description = typeof read.data.document.description === "string" ? read.data.document.description : "";
    if (!description.includes(install.id)) {
      problems.push(`table ${id} was left alone: its description no longer names this install`);
      continue;
    }
    const tableKey = Object.entries(install.steps.tables ?? {}).find(([, v]) => v === id)?.[0];
    const options = new Set([...(tableKey ? (install.steps.optionTables?.[tableKey] ?? []) : []), ...(await optionTablesOf(client, id))]);
    for (const optionId of options) {
      const p = await archiveTable(client, optionId);
      if (p) problems.push(`the choice list ${optionId} of table ${id}: ${p}`);
    }
    const p = await archiveTable(client, id);
    if (p) problems.push(`table ${id}: ${p}`);
  }

  const next: KitInstallRecord = {
    ...install,
    status: problems.length > 0 ? "failed" : "removed",
    error: problems.length > 0 ? `Removal left some things behind — ${problems.join("; ")}` : null,
  };
  const saved = await client.recordUpdate({
    record_id: install.id,
    patch: {
      status: next.status,
      error: next.error ?? "",
      run_id: "",
      run_until: "",
    },
  });
  if (!saved.ok) problems.push(`the install record could not be updated (${saved.error.message})`);
  if (problems.length > 0) throw new Error(next.error ?? problems.join("; "));
}
