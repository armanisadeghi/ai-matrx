/**
 * `cms_page_build` — the built markup a planned page turned into, as a Shape.
 *
 * Produced by the CMS fill (`aidream/services/content_plan/cms_fill.py`, step
 * `p6_build`) and persisted as a `plan.node_artifact`. It is the pipeline's
 * last structured record before a page is something a visitor can load.
 *
 * Canonical `__kind` JSON shape:
 *   { "__kind":"cms_page_build", "route":"/x", "page_id":"<uuid>",
 *     "write_target":"live", "html":"…", "css":"…",
 *     "meta_title":"…", "meta_description":"…" }
 *
 * FIELD PARITY is with the dict literal at that call site (`_record_build`).
 *
 * 🚨 `write_target` IS LOAD-BEARING, NOT METADATA. `live` means the build
 * replaced what visitors see right now; `draft` means the page is published
 * and its live content was deliberately NOT overwritten (THE rule, in one
 * place: `cms_fill.write_target`). A component that hides this leaves the
 * owner unable to tell whether the words in front of them are on the internet.
 *
 * 🚨 `html` IS AUTHORED BY A MODEL AND IS HOSTILE INPUT. It renders ONLY
 * through `SandboxedHtml` (no scripts, no same-origin). Never
 * `dangerouslySetInnerHTML` — that is stored XSS in the aimatrx.com origin.
 *
 * `page_id` points into the CMS project's own database (a different Supabase
 * project), so it is not a link this kind can resolve on its own; `route` is
 * the durable identity a host surface can open. See the component for how the
 * door is offered.
 *
 * The bridge uses the STREAMING contract like its siblings, but a build lands
 * whole in practice (the job writes the artifact after the page write) — the
 * partial states exist so a future streamed builder needs no change here.
 */

import type { CanonicalBlockIR } from "../core/ir-types";
import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const cmsPageBuildKindSchema: KindSchema = {
  kind: "cms_page_build",
  fields: {
    route: {
      type: "string",
      required: true,
      description: "The path this page lives at on the site.",
    },
    page_id: {
      type: "string",
      description: "The CMS page row this build wrote to.",
    },
    write_target: {
      type: "enum",
      values: ["live", "draft"],
      description:
        "`live` — visitors see this now. `draft` — the page is published and its live content was deliberately left alone.",
    },
    html: {
      type: "string",
      description: "The built markup. Author-supplied — always render sandboxed.",
    },
    css: {
      type: "string",
      description: "Styles that accompany the markup.",
    },
    meta_title: {
      type: "string",
      description: "The page's title tag, as built.",
    },
    meta_description: {
      type: "string",
      description: "The page's meta description, as built.",
    },
  },
};

export const CMS_PAGE_BUILD_KIND_SCHEMAS: KindSchema[] = [
  cmsPageBuildKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge
// ---------------------------------------------------------------------------

export type CmsPageWriteTarget = "live" | "draft" | null;

export interface CmsPageBuildData {
  route: string | null;
  pageId: string | null;
  writeTarget: CmsPageWriteTarget;
  html: string;
  css: string;
  metaTitle: string;
  metaDescription: string;
  isComplete: boolean;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function emptyToNull(value: string): string | null {
  return value === "" ? null : value;
}

export function cmsPageBuildServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (CmsPageBuildData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "cms_page_build") return undefined;

  const value = envelope.root.value;
  const target = value.write_target;

  return {
    route: emptyToNull(stringOr(value.route, "")),
    pageId: emptyToNull(stringOr(value.page_id, "")),
    writeTarget: target === "live" || target === "draft" ? target : null,
    html: stringOr(value.html, ""),
    css: stringOr(value.css, ""),
    metaTitle: stringOr(value.meta_title, ""),
    metaDescription: stringOr(value.meta_description, ""),
    isComplete: envelope.root.status === "complete",
  };
}

/**
 * The one place markup and styles are composed into a self-contained document
 * for a sandboxed frame — so a preview can never render styles the built page
 * would not have, and no surface hand-concatenates its own variant.
 */
export function cmsPageBuildPreviewDocument(data: CmsPageBuildData): string {
  const style = data.css ? `<style>${data.css}</style>` : "";
  return `${style}${data.html}`;
}

// ---------------------------------------------------------------------------
// toMarkdown facet — the RECORD, never a markup dump.
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = [
  "route",
  "page_id",
  "write_target",
  "html",
  "css",
  "meta_title",
  "meta_description",
];

export function cmsPageBuildMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const route = stringOr(value.route, "");
  const target = value.write_target;
  const html = stringOr(value.html, "");
  const metaTitle = stringOr(value.meta_title, "");
  const metaDescription = stringOr(value.meta_description, "");

  return joinBlocks([
    "# Built page",
    route ? `**Route:** \`${route}\`` : null,
    target === "live"
      ? "**Visitors see this now.**"
      : target === "draft"
        ? "**Saved as a draft** — the published page was left as it was."
        : null,
    metaTitle ? `**Title tag:** ${metaTitle}` : null,
    metaDescription ? `**Meta description:** ${metaDescription}` : null,
    html ? `_${html.length.toLocaleString()} characters of markup._` : null,
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definition — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const CMS_PAGE_BUILD_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "cms_page_build",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "cms_page_build",
    toLegacyServerData: cmsPageBuildServerDataFromEnvelope,
    toMarkdown: cmsPageBuildMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: cmsPageBuildKindSchema,
  },
];
