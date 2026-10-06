// features/marketing/reports/saved/service.ts — the reads (and the one knob write)
// behind the saved SEO reports list and the templates view.
//
// Lists read `chat.artifact` SUMMARY columns only: the body lives in
// `canvas.canvas_items.content` and is never selected here. Opening a report goes
// through the existing viewer (`/artifacts/[id]`), which also opens one version
// by its canvas item id. Row security decides what comes back; the active
// organization is never a filter here (access ladder).
//
// Templates: `custom.doc_template` is not readable by a signed-in client today
// (42501 for `authenticated`), so the template list comes from the `seo_report`
// tool's own `templates` action through the screen-run door (see hooks.ts). The
// SELECTED template is the knob `seo.report.template_id`, read with
// `knob_index` and written through the door the key declares.

import { createClient } from "@/utils/supabase/client";
import {
  fetchKnobIndex,
  fetchKnobWriteDoor,
  writeKnobOverrideThroughDoor,
  type KnobScopeRef,
} from "@/lib/scoped-config/service";
import type { KnobOverrideSetResult, ScopedKnob } from "@/lib/scoped-config/types";
import {
  SEO_REPORT_SOURCE_SYSTEM,
  SEO_REPORT_TEMPLATE_KNOB,
  type SavedSeoReportSummary,
  type SeoReportSubject,
  type SeoReportVersion,
} from "./types";

/** A screenful; the list says how many exist when there are more. */
export const SAVED_REPORTS_LIST_CAP = 500;

/**
 * The exact column list — metadata paths only. A test pins that no body
 * column (`content`, `metadata` whole) is ever selected.
 */
export const SAVED_REPORT_SUMMARY_SELECT = [
  "id",
  "title",
  "version",
  "updated_at",
  "created_by",
  "organization_id",
  "source_id",
  "canvas_item_id",
  "subject:metadata->subject",
  "report_kind:metadata->>report_kind",
  "period:metadata->>period",
  "template:metadata->provenance->template",
  "agent_id:metadata->provenance->>agent_id",
].join(",");

export const SEO_REPORT_VERSION_SELECT = "id,version,created_at,created_by,title";

export interface SavedSeoReportsPage {
  rows: SavedSeoReportSummary[];
  /** Every matching row the database holds (may exceed `rows.length`). */
  total: number;
}

export async function fetchSavedSeoReports(
  options: { subject?: SeoReportSubject | null } = {},
): Promise<SavedSeoReportsPage> {
  const supabase = createClient();
  let query = supabase
    .schema("chat")
    .from("artifact")
    .select(SAVED_REPORT_SUMMARY_SELECT, { count: "exact" })
    .eq("source_system", SEO_REPORT_SOURCE_SYSTEM)
    .is("deleted_at", null);
  if (options.subject) {
    query = query
      .eq("metadata->subject->>type", options.subject.type)
      .eq("metadata->subject->>id", options.subject.id);
  }
  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .limit(SAVED_REPORTS_LIST_CAP);
  if (error) throw new Error(`Reading saved SEO reports failed: ${error.message}`);
  const rows = (data ?? []) as unknown as SavedSeoReportSummary[];
  return { rows, total: count ?? rows.length };
}

/** Every version of one job, newest first. Bodies are never read. */
export async function fetchSeoReportVersions(sourceId: string): Promise<SeoReportVersion[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("canvas")
    .from("canvas_items")
    .select(SEO_REPORT_VERSION_SELECT)
    .eq("source_system", SEO_REPORT_SOURCE_SYSTEM)
    .eq("source_id", sourceId)
    .is("deleted_at", null)
    .order("version", { ascending: false });
  if (error) throw new Error(`Reading report versions failed: ${error.message}`);
  return (data ?? []) as SeoReportVersion[];
}

/** The template knob as THIS subject resolves it (value + which rung set it). */
export async function fetchTemplateKnob(options: {
  organizationId: string;
  scopes: KnobScopeRef[];
}): Promise<ScopedKnob | null> {
  const keys = await fetchKnobIndex({
    organizationId: options.organizationId,
    featurePrefix: SEO_REPORT_TEMPLATE_KNOB.feature,
    scopes: options.scopes,
  });
  const fullKey = `${SEO_REPORT_TEMPLATE_KNOB.feature}.${SEO_REPORT_TEMPLATE_KNOB.key}`;
  return keys.find((knob) => knob.full_key === fullKey) ?? null;
}

export type TemplateRung = "organization" | "brand" | "site";

/**
 * Choose a template at one rung, through the write door the key declares.
 * The organization is the subject's own (the site's or brand's), never the
 * active organization.
 */
export async function chooseSeoReportTemplate(options: {
  organizationId: string;
  rung: TemplateRung;
  scopeId: string;
  templateId: string;
}): Promise<KnobOverrideSetResult> {
  const fullKey = `${SEO_REPORT_TEMPLATE_KNOB.feature}.${SEO_REPORT_TEMPLATE_KNOB.key}`;
  const door = await fetchKnobWriteDoor({ fullKey, organizationId: options.organizationId });
  if (door.mayWrite === false) {
    return { ok: false, reason: "forbidden", detail: door.authorityDetail };
  }
  return writeKnobOverrideThroughDoor({
    door,
    feature: SEO_REPORT_TEMPLATE_KNOB.feature,
    key: SEO_REPORT_TEMPLATE_KNOB.key,
    scopeKind: options.rung,
    scopeId: options.scopeId,
    organizationId: options.organizationId,
    value: options.templateId,
  });
}
