// features/spaces/data/agency-install.ts — "Add the sample" installs the agency (data/agency-spec.ts) as
// REAL custom tables, through the same door the template gallery's Install button uses: the spec is
// declared as the organization's own template (custom.template_declare, an upsert on its catalogue id
// and version) and custom.template_install runs it to done. A second press finds the install and
// answers `already` with the same tables — nothing is made twice.
//
// FULL INSTALL (round 12): after template_install answers done, the host's steps run exactly as the
// gallery's Install button runs them — `addInstalledAgent` (features/make) copies the "Agency
// assistant", claims and notes it on the install, so the sample ends with the same assistant a
// gallery install makes. A re-press resumes: a copy already noted is never made twice.

import { supabaseDataSource } from "@ai-matrx/records/core";
import { runTemplateDoor, templateDeclaration, templateUpgradeHint, upgradeTemplateInstall, type TemplateDoorAnswer } from "@ai-matrx/records/templates";

import { addInstalledAgent, hostStepsPending, type Claim } from "@/features/make/gallery/installAgent";
import { templateAgentArchiver, templateAgentCopier, templateWorkflowCreator } from "@/features/templates/agentCopyHost";
import { templateKnob } from "@/features/templates/knobs";
import { setWorkflowFlag } from "@/features/workflow-runtime/browse/service";
import type { AppDispatch } from "@/lib/redux/store";
import { toast } from "@/lib/toast";
import { createClient } from "@/utils/supabase/client";

import { AGENCY_SPEC } from "./agency-spec";

export type AgencyToken = "client" | "nps_survey" | "client_win" | "task";

/** One installed table: its id, name and its default store view. */
export interface AgencyTable {
  tableId: string;
  name: string;
  viewId?: string;
  /** Set only for the template gallery's read-only preview: the in-memory world the table lives in. */
  sample?: string;
  /** The spec's field key → this install's key, where they differ. An upgrade that converts a column
   *  keeps the retired one under the old key and gives the new one a fresh key (`offer` → `offer_2`),
   *  so a block never names a field by the spec's key — it asks `fieldKey`. Matched by title. */
  keys?: Record<string, string>;
}

/** The four tables every install has, plus Offers (version 2 — an older install has none). */
export type AgencyTables = Record<AgencyToken, AgencyTable> & { offer?: AgencyTable };

const TOKENS: AgencyToken[] = ["client", "nps_survey", "client_win", "task"];
/** Each table's view the sample's blocks name (the spec's default grid view). */
const VIEW_OF: Record<AgencyToken, string> = { client: "all_clients", nps_survey: "all_surveys", client_win: "all_wins", task: "all_tasks" };

/** The tables an install answer made, by token. Throws, by name, when one is missing. */
export function agencyTablesFrom(answer: TemplateDoorAnswer): AgencyTables {
  const made = answer.made ?? [];
  const out = {} as AgencyTables;
  for (const token of TOKENS) {
    const table = made.find((m) => m.kind === "table" && m.ref === `tables.${token}`);
    if (!table?.id) throw new Error(`The sample's ${token.replace("_", " ")} table was not made.`);
    const view = made.find((m) => m.kind === "view" && m.ref === `views.${VIEW_OF[token]}`);
    out[token] = { tableId: table.id, name: table.title ?? AGENCY_SPEC.tables.find((t) => t.token === token)!.name, viewId: view?.id ?? undefined };
  }
  const offer = made.find((m) => m.kind === "table" && m.ref === "tables.offer");
  if (offer?.id) {
    const view = made.find((m) => m.kind === "view" && m.ref === "views.all_offers");
    out.offer = { tableId: offer.id, name: offer.title ?? "Offers", viewId: view?.id ?? undefined };
  }
  return out;
}

/** The installed key of the spec's field `specKey` on `table` (the spec's key when the install keeps it). */
export function fieldKey(table: AgencyTable | undefined, specKey: string): string {
  return table?.keys?.[specKey] ?? specKey;
}

/** A view with every field it names (sorts, group, date, filters, hidden, chart axes) moved onto the
 *  install's keys. Answers the same object when nothing moves. */
export function viewOnInstalledKeys<V extends { groupField?: string | null; dateField?: string | null; sorts?: Array<{ field: string; direction: "asc" | "desc" }>; filters?: Record<string, unknown>; hiddenFields?: string[]; chart?: { groupBy: string | null; field?: string | null } }>(view: V, keys: Record<string, string> | undefined): V {
  if (!keys || !Object.keys(keys).length) return view;
  const k = (x: string) => keys[x] ?? x;
  const kn = (x: string | null | undefined) => (x ? k(x) : x);
  const next: V = {
    ...view,
    ...(view.groupField !== undefined ? { groupField: kn(view.groupField) } : {}),
    ...(view.dateField !== undefined ? { dateField: kn(view.dateField) } : {}),
    ...(view.sorts ? { sorts: view.sorts.map((s) => ({ ...s, field: k(s.field) })) } : {}),
    ...(view.filters ? { filters: Object.fromEntries(Object.entries(view.filters).map(([f, v]) => [k(f), v])) } : {}),
    ...(view.hiddenFields ? { hiddenFields: view.hiddenFields.map(k) } : {}),
    ...(view.chart ? { chart: { ...view.chart, groupBy: kn(view.chart.groupBy) ?? null, ...(view.chart.field !== undefined ? { field: kn(view.chart.field) } : {}) } } : {}),
  };
  return JSON.stringify(next) === JSON.stringify(view) ? view : next;
}

/** Reads each installed table's fields (custom.applicable_fields — the records client's own fields door)
 *  and maps the spec's keys onto them by title (an upgraded install's converted column carries a new key;
 *  the retired one keeps the old key off the table). */
async function withInstalledKeys(tables: AgencyTables, organizationId: string): Promise<AgencyTables> {
  const db = createClient().schema("custom");
  const entries = Object.entries(tables) as Array<[string, AgencyTable]>;
  const out = { ...tables } as AgencyTables;
  await Promise.all(
    entries.map(async ([token, table]) => {
      const { data, error } = await db.rpc("applicable_fields", { p_organization_id: organizationId, p_table_id: table.tableId });
      if (error) throw new Error(`We couldn't read the sample's ${table.name} fields: ${error.message}`);
      const installed = ((data ?? []) as unknown as Array<{ data?: { key?: string; label?: string } }>).map((r) => r.data ?? {});
      const spec = AGENCY_SPEC.tables.find((t) => t.token === token);
      const keys: Record<string, string> = {};
      for (const f of spec?.fields ?? []) {
        const hit = installed.find((x) => x.label === f.label);
        if (hit?.key && hit.key !== f.key) keys[f.key] = hit.key;
      }
      if (Object.keys(keys).length) (out as Record<string, AgencyTable>)[token] = { ...table, keys };
    }),
  );
  return out;
}

/** The gallery's host steps after template_install (its agent, extra agents, workflows), with the
 *  same ports the gallery's TemplatePreview builds. Throws, by name, when the assistant was not made. */
async function runHostSteps(answer: TemplateDoorAnswer, orgId: string, dispatch: AppDispatch): Promise<void> {
  if (!hostStepsPending(answer)) return;
  const supabase = createClient();
  const result = await addInstalledAgent(answer, orgId, {
    copier: templateAgentCopier(dispatch),
    extraCopier: templateAgentCopier(dispatch, { attachRecordsTool: false }),
    createWorkflow: templateWorkflowCreator(dispatch),
    archiveAgent: templateAgentArchiver(dispatch),
    archiveWorkflow: (workflowId) => setWorkflowFlag(workflowId, { is_archived: true }),
    claim: async (installId, kind, label, sourceId) => {
      const lease = await templateKnob("run_lease_seconds");
      const { data, error } = await supabase
        .schema("custom")
        .rpc("template_install_claim", {
          p_organization_id: orgId,
          p_install_id: installId,
          p_kind: kind,
          p_label: label,
          ...(sourceId ? { p_source_id: sourceId } : {}),
          p_lease_seconds: lease,
        });
      if (error) throw new Error(error.message);
      const claim = (data as unknown as { claim: Claim & { claimed_at?: string } }).claim;
      if (claim.state !== "held") return claim;
      const at = claim.claimed_at ? Date.parse(claim.claimed_at) + lease * 1000 : NaN;
      return { state: "held", retryAt: Number.isFinite(at) ? new Date(at).toISOString() : null };
    },
    note: async (installId, agentId, label, kind) => {
      const { data, error } = await supabase
        .schema("custom")
        .rpc("template_install_note", { p_organization_id: orgId, p_install_id: installId, p_kind: kind ?? "agent", p_id: agentId, p_label: label });
      if (error) throw new Error(error.message);
      return data as TemplateDoorAnswer;
    },
  });
  if (!result.ok) throw new Error(`The sample's assistant was not made: ${result.why}`);
}

/** What an upgrade did, in words: "1 table, 1 field converted, 1 field retired, 1 view, 4 rows, 4 links". */
export function upgradeCountsText(counts: Record<string, number> | undefined): string {
  const words: Record<string, [string, string]> = {
    tables: ["table", "tables"],
    fields: ["field", "fields"],
    fields_converted: ["field converted", "fields converted"],
    fields_retired: ["field retired", "fields retired"],
    views: ["view", "views"],
    dashboards: ["dashboard", "dashboards"],
    rows: ["row", "rows"],
    links: ["link", "links"],
    targets_created: ["linked record made", "linked records made"],
  };
  // `kept` (steps already done) is not a change; the rest in the order Notion would read them.
  const parts = Object.keys(words)
    .map((k) => [k, counts?.[k] ?? 0] as const)
    .concat(Object.entries(counts ?? {}).filter(([k]) => !(k in words) && k !== "kept"))
    .filter(([, n]) => typeof n === "number" && n > 0)
    .map(([k, n]) => `${n} ${(words[k] ?? [k.replace(/_/g, " "), k.replace(/_/g, " ")])[n === 1 ? 0 : 1]}`);
  return parts.length ? parts.join(", ") : "nothing needed changing";
}

/** Installs (or finds) the agency sample in `organizationId` — tables, views, dashboard and the
 *  assistant, the whole gallery install — and answers its tables. An install made from an older
 *  version is upgraded first (custom.template_upgrade): new tables, fields and views are added, a
 *  choice column that became a link is converted, nothing is dropped. `onStage` hears each stage. */
export async function installAgencySample(organizationId: string, dispatch: AppDispatch, onStage?: (stage: string) => void): Promise<AgencyTables> {
  const client = createClient();
  onStage?.("Planning…");
  const declared = await client
    .schema("custom")
    .rpc("template_declare", { p_scope: "org", p_spec: templateDeclaration(AGENCY_SPEC as never, organizationId) as never });
  if (declared.error) throw new Error(`The sample's tables could not be planned: ${declared.error.message}`);
  const templateId = (declared.data as unknown as { template_id: string }).template_id;
  onStage?.("Making tables…");
  const done = await runTemplateDoor(supabaseDataSource(client), "template_install", organizationId, templateId, { maxCalls: 400 });
  if (!done.ok || !done.answer?.done) {
    const refusal = done.answer?.refusal as { message?: string } | null | undefined;
    throw new Error(`The sample's tables were not made: ${refusal?.message ?? done.error?.message ?? "the install stopped before it finished."}`);
  }
  let answer: TemplateDoorAnswer = done.answer;
  const hint = templateUpgradeHint(answer);
  if (hint) {
    onStage?.(`Upgrading v${hint.from_version} → v${hint.to_version}…`);
    const up = await upgradeTemplateInstall(supabaseDataSource(client), organizationId, hint.install_id, hint.template_id, { maxCalls: 6 });
    if (!up.ok || !up.answer) {
      const refusal = up.answer?.refusal as { message?: string } | null | undefined;
      throw new Error(`The sample's tables were not upgraded to version ${hint.to_version}: ${refusal?.message ?? up.error?.message ?? "the upgrade stopped before it finished."}`);
    }
    if (up.answer.upgraded !== false) {
      toast.success(`Sample tables upgraded to version ${up.answer.version ?? hint.to_version}: ${upgradeCountsText(up.answer.counts)}.`);
    }
    answer = up.answer;
  } else if ((answer as { newer_version?: number | null }).newer_version) {
    // An answer naming a newer version with no upgrade hint: say so instead of drawing the old shape silently.
    toast.info(`Sample tables predate version ${(answer as { newer_version?: number }).newer_version}; this install can't be upgraded.`);
  }
  const tables = await withInstalledKeys(agencyTablesFrom(answer), organizationId);
  onStage?.("Adding the assistant…");
  await runHostSteps(answer, organizationId, dispatch);
  return tables;
}

/** The organization a saved page is filed in — the sample's tables are installed beside the page that
 *  shows them ("Add the sample" and the source picker's sample both ask this). Null: no saved page. */
export async function pageOrganizationId(spaceId: string): Promise<string | null> {
  const { data, error } = await createClient().schema("content").from("document").select("organization_id").eq("id", spaceId).maybeSingle();
  if (error) throw new Error(`We couldn't read the page's organization: ${error.message}`);
  return data?.organization_id ?? null;
}

/** The table a sample block named, by its title (the preview's table names are the spec's). */
export function agencyTokenByName(name: string | undefined): AgencyToken | null {
  const t = AGENCY_SPEC.tables.find((x) => x.name === name);
  return t && (TOKENS as string[]).includes(t.token) ? (t.token as AgencyToken) : null;
}
