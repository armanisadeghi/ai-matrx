/**
 * Surface manifest — Page Research (`matrx-user/page-research`).
 *
 * Overlay surface for the compact, one-page research launcher opened from a
 * content-plan node. The window carries the planned page's identity and
 * tenancy into a two-keyword research draft, then exposes the live topic,
 * attachment, pipeline, and document-assembly state while the user-triggered
 * paid run is in progress.
 *
 * Runtime emitter + draft write handlers:
 * `features/window-panels/windows/marketing/PageResearchWindow.tsx`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { withAllBaselines } from "./_baseline.manifest";

export const PAGE_RESEARCH_SURFACE_NAME = "matrx-user/page-research";

export type PageResearchPhase =
  "form" | "starting" | "running" | "assembling" | "done";

export type PageResearchAttachmentStatus =
  "not_started" | "attaching" | "attached" | "failed";

export type PageResearchOrganizationSource = "page" | "active" | "missing";

export interface PageResearchPageContext {
  node_id: string;
  site_id: string;
  page_label: string;
  primary_keyword: string;
  page_organization_id: string;
  active_organization_id: string;
  organization_id: string;
  organization_source: PageResearchOrganizationSource;
}
export interface PageResearchDraftSummary {
  topic_name: string;
  keywords: string[];
  clean_keywords: string[];
  max_keywords: number;
  can_start: boolean;
}

export interface PageResearchRunSummary {
  research_phase: PageResearchPhase;
  topic_id: string | null;
  attachment_status: PageResearchAttachmentStatus;
  attachment_error: string | null;
  is_streaming: boolean;
  stream_request_id: string | null;
  latest_stream_message: string | null;
  stream_error: string | null;
}

const groups: SurfaceValueGroup[] = [
  {
    key: "page_context",
    label: "Planned page",
    sortOrder: 100,
    description:
      "The content-plan node, site, target query, and resolved research tenancy supplied by the opener.",
  },
  {
    key: "research_draft",
    label: "Research draft",
    sortOrder: 200,
    description:
      "The live topic name and one-or-two keyword draft the user reviews before starting paid work.",
  },
  {
    key: "run_state",
    label: "Run state",
    sortOrder: 300,
    description:
      "The topic, attachment, research pipeline, and report-assembly state after the user starts the run.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "node_id",
    label: "Plan node ID",
    description:
      "UUID of the content-plan node this research will be attached to. Always present while the window is mounted.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    group: "page_context",
    sortOrder: 100,
  },
  {
    name: "site_id",
    label: "Site ID",
    description:
      "UUID of the planned page's site when the opener supplies it. An empty string means the page has no site context in this launch.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    autoContext: false,
    group: "page_context",
    sortOrder: 110,
  },
  {
    name: "page_label",
    label: "Page label",
    description:
      "Current content-plan label used to seed and describe this page's research. An empty string means the opener supplied no label.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    group: "page_context",
    sortOrder: 120,
  },
  {
    name: "primary_keyword",
    label: "Target keyword",
    description:
      "The page's target search query supplied by its SEO plan and used to seed keyword one. Empty when the page has no target query yet.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 50,
    group: "page_context",
    sortOrder: 130,
  },
  {
    name: "page_organization_id",
    label: "Page organization ID",
    description:
      "Organization UUID owned by the plan node. Empty when the opener did not carry page tenancy; this is preferred over the viewer's active organization.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    autoContext: false,
    group: "page_context",
    sortOrder: 140,
  },
  {
    name: "active_organization_id",
    label: "Active organization ID",
    description:
      "Viewer's currently active organization UUID, loaded only as the fallback tenancy. Empty when no active organization is selected.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    autoContext: false,
    group: "page_context",
    sortOrder: 150,
  },
  {
    name: "organization_id",
    label: "Research organization ID",
    description:
      "Resolved organization UUID that will own the topic and page attachment. Empty when neither the page nor the viewer supplies an organization, which disables Start research.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    group: "page_context",
    sortOrder: 160,
  },
  {
    name: "organization_source",
    label: "Organization source",
    description:
      'Which tenancy supplied `organization_id`: "page", "active", or "missing". Always emitted so agents do not infer tenancy from an ID alone.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 7,
    group: "page_context",
    sortOrder: 170,
  },
  {
    name: "page_context",
    label: "Planned page context",
    description:
      "Natural composite of the planned page and tenancy values as { node_id, site_id, page_label, primary_keyword, page_organization_id, active_organization_id, organization_id, organization_source }. Always emitted.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 420,
    group: "page_context",
    sortOrder: 180,
  },
  {
    name: "topic_name",
    label: "Topic name",
    description:
      "Live user-authored research-topic name. It is seeded from the page label and may be edited until the user starts research.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    group: "research_draft",
    sortOrder: 200,
  },
  {
    name: "keywords",
    label: "Research keywords",
    description:
      "The live one-or-two keyword input slots exactly as shown, including a temporarily empty slot while the user is editing.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 120,
    group: "research_draft",
    sortOrder: 210,
  },
  {
    name: "clean_keywords",
    label: "Runnable keywords",
    description:
      "Trimmed, non-empty, de-duplicated keywords that the paid research request will receive when the user clicks Start research. Always emitted and may be empty.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 100,
    group: "research_draft",
    sortOrder: 220,
  },
  {
    name: "max_keywords",
    label: "Keyword limit",
    description:
      "Maximum number of keywords this compact page-research flow accepts. Always two by product contract.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 1,
    autoContext: false,
    group: "research_draft",
    sortOrder: 230,
  },
  {
    name: "can_start",
    label: "Can start research",
    description:
      "True only while the form is open with a resolved organization, a non-empty topic name, and at least one runnable keyword. The user must still click Start research.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "research_draft",
    sortOrder: 240,
  },
  {
    name: "draft_summary",
    label: "Research draft summary",
    description:
      "Natural composite of the editable launch draft as { topic_name, keywords, clean_keywords, max_keywords, can_start }. Always emitted.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 320,
    group: "research_draft",
    sortOrder: 250,
  },
  {
    name: "research_phase",
    label: "Research phase",
    description:
      'Current window phase: "form", "starting", "running", "assembling", or "done". Always emitted.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    group: "run_state",
    sortOrder: 300,
  },
  {
    name: "topic_id",
    label: "Research topic ID",
    description:
      "UUID of the newly created research topic. Absent until topic creation succeeds.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "run_state",
    sortOrder: 310,
  },
  {
    name: "attachment_status",
    label: "Attachment status",
    description:
      'Whether the topic-to-page association is "not_started", "attaching", "attached", or "failed". Always emitted; attachment remains inside the user-triggered start flow.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 11,
    group: "run_state",
    sortOrder: 320,
  },
  {
    name: "attachment_error",
    label: "Attachment error",
    description:
      "Exact page-attachment failure returned by the canonical association path. Absent unless topic creation succeeded but attachment failed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "run_state",
    sortOrder: 330,
  },
  {
    name: "is_streaming",
    label: "Stream is active",
    description:
      "Whether the canonical research stream is currently receiving pipeline or document-assembly events. Always emitted.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "run_state",
    sortOrder: 340,
  },
  {
    name: "stream_request_id",
    label: "Stream request ID",
    description:
      "Adopted request UUID used by the canonical Live Run window. Absent until the research service returns a streaming request.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    group: "run_state",
    sortOrder: 350,
  },
  {
    name: "latest_stream_message",
    label: "Latest progress message",
    description:
      "Most recent human-readable pipeline or assembly progress message. Absent before the stream emits a message.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "run_state",
    sortOrder: 360,
  },
  {
    name: "stream_error",
    label: "Research stream error",
    description:
      "Current error reported by the canonical research stream. Absent when the stream has not failed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "run_state",
    sortOrder: 370,
  },
  {
    name: "run_summary",
    label: "Research run summary",
    description:
      "Natural composite of phase, topic, attachment, stream, latest-message, and error state. Always emitted with nulls for run values that do not exist yet.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 520,
    group: "run_state",
    sortOrder: 380,
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "topic_name",
    label: "Topic name",
    description:
      "Replaces the live topic-name draft with a non-empty string. The user still reviews the draft and must click Start research before any topic, attachment, or paid run is created.",
    valueType: "string",
    updatesValue: "topic_name",
    mode: "draft",
    applyPolicy: "ask",
    group: "research_draft",
    sortOrder: 200,
  },
  {
    name: "keywords",
    label: "Research keywords",
    description:
      "Replaces the live keyword draft with one or two unique, non-empty strings. The user still reviews them and must click Start research before any paid work or attachment begins.",
    valueType: "array",
    updatesValue: "keywords",
    mode: "draft",
    applyPolicy: "ask",
    group: "research_draft",
    sortOrder: 210,
  },
];

export const pageResearchManifest: SurfaceManifest = {
  surfaceName: PAGE_RESEARCH_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Complete authored contract, nested runtime, draft write handlers, canonical menus, Pro inputs, and Locate anchors are wired; DB mirror sync and isolated live Browser certification remain coordinator-owned before verified.",
  overlayId: "pageResearchWindow",
  label: "Page Research",
  intro: `<surface_intro>
You are in Page Research, a compact launcher for focused research attached to ONE planned content page. Planned page identifies the node, site, target query, and exact organization that will own the result. Research draft is the live topic name plus one or two keywords the user is reviewing. Run state says whether the topic exists, whether its page attachment succeeded, and whether the paid research or report-assembly stream is active.
This surface accepts only reversible draft writes to topic_name and keywords. Those writes never create a topic, attach anything, or spend research capacity. Starting the pipeline and its attachment is always a human action through the visible Start research button.
</surface_intro>`,
  groups,
  values: withAllBaselines(surfaceSpecific),
  writeTargets,
};

/**
 * Type-safe trigger-time payload. Required keys mirror every own
 * `alwaysAvailable: true` value; optional keys mirror values that do not exist
 * until the user-triggered workflow advances.
 */
export function createPageResearchScope(values: {
  node_id: string;
  site_id: string;
  page_label: string;
  primary_keyword: string;
  page_organization_id: string;
  active_organization_id: string;
  organization_id: string;
  organization_source: PageResearchOrganizationSource;
  page_context: PageResearchPageContext;
  topic_name: string;
  keywords: string[];
  clean_keywords: string[];
  max_keywords: number;
  can_start: boolean;
  draft_summary: PageResearchDraftSummary;
  research_phase: PageResearchPhase;
  topic_id?: string;
  attachment_status: PageResearchAttachmentStatus;
  attachment_error?: string;
  is_streaming: boolean;
  stream_request_id?: string;
  latest_stream_message?: string;
  stream_error?: string;
  run_summary: PageResearchRunSummary;
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
