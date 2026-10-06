// features/spaces/data/agency-install.ts — "Add the sample" installs the agency (data/agency-spec.ts) as
// REAL store tables, through the same door the template gallery's Install button uses: the spec is
// declared as the organization's own template (custom.template_declare, an upsert on its catalogue id
// and version) and custom.template_install runs it to done. A second press finds the install and
// answers `already` with the same tables — nothing is made twice.

import { supabaseDataSource } from "@ai-matrx/records/core";
import { runTemplateDoor, templateDeclaration, type TemplateDoorAnswer } from "@ai-matrx/records/templates";

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
}

export type AgencyTables = Record<AgencyToken, AgencyTable>;

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
  return out;
}

/** Installs (or finds) the agency sample's tables in `organizationId`. */
export async function installAgencySample(organizationId: string): Promise<AgencyTables> {
  const client = createClient();
  const declared = await client
    .schema("custom")
    .rpc("template_declare", { p_scope: "org", p_spec: templateDeclaration(AGENCY_SPEC as never, organizationId) as never });
  if (declared.error) throw new Error(`The sample's tables could not be planned: ${declared.error.message}`);
  const templateId = (declared.data as unknown as { template_id: string }).template_id;
  const done = await runTemplateDoor(supabaseDataSource(client), "template_install", organizationId, templateId, { maxCalls: 400 });
  if (!done.ok || !done.answer?.done) {
    const refusal = done.answer?.refusal as { message?: string } | null | undefined;
    throw new Error(`The sample's tables were not made: ${refusal?.message ?? done.error?.message ?? "the install stopped before it finished."}`);
  }
  return agencyTablesFrom(done.answer);
}

/** The table a sample block named, by its title (the preview's table names are the spec's). */
export function agencyTokenByName(name: string | undefined): AgencyToken | null {
  const t = AGENCY_SPEC.tables.find((x) => x.name === name);
  return t ? (t.token as AgencyToken) : null;
}
