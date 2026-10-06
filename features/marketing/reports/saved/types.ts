// features/marketing/reports/saved/types.ts — saved SEO reports (OpenSEO Wave 3 item 4).
//
// A saved SEO report is a `chat.artifact` row with `source_system = 'seo_report'`
// (the index, no body) pointing at the newest `canvas.canvas_items` version.
// Every version of one job shares the artifact's `source_id`. Shapes are the
// ones aidream `services/seo/reports.py` writes into `metadata`.

export const SEO_REPORT_SOURCE_SYSTEM = "seo_report";
export const SEO_REPORT_TOOL = "seo_report";
/** The knob that picks the template: feature `seo`, key `report.template_id`. */
export const SEO_REPORT_TEMPLATE_KNOB = { feature: "seo", key: "report.template_id" } as const;

export type SeoReportSubjectType = "organization" | "brand" | "site";

export interface SeoReportSubject {
  type: SeoReportSubjectType;
  id: string;
}

export interface SeoReportTemplateRef {
  id: string;
  name: string | null;
  version: number | null;
}

/** One row of the list — metadata only, never the body. */
export interface SavedSeoReportSummary {
  id: string;
  title: string | null;
  version: number | null;
  updated_at: string;
  created_by: string | null;
  organization_id: string;
  /** The job's identity; every version of the job carries it. */
  source_id: string | null;
  canvas_item_id: string | null;
  subject: SeoReportSubject | null;
  report_kind: string | null;
  period: string | null;
  template: SeoReportTemplateRef | null;
  /** Set when an agent run produced the save (server provenance). */
  agent_id: string | null;
}

/** One version of one job — metadata only. */
export interface SeoReportVersion {
  id: string;
  version: number | null;
  created_at: string;
  created_by: string | null;
  title: string | null;
}

/** A template as the `seo_report` tool's `templates` action describes it. */
export interface SeoReportTemplate {
  template_id: string;
  name: string | null;
  version: number;
  platform_default: boolean;
  required_sections: string[];
  brand_id: string | null;
}

export interface SeoReportTemplatesData {
  selected_template_id: string;
  templates: SeoReportTemplate[];
}

/** What the `save` action answers. */
export interface SeoReportSaveData {
  report_id: string;
  version: number;
  replaced_earlier_version: boolean;
  title: string;
  link: string;
}

/** Everything a `save` call needs; built from real data by the caller. */
export interface SeoReportDraft {
  title: string;
  markdown: string;
  report_kind: string;
  period: string | null;
  site_id?: string;
  brand_id?: string;
}
