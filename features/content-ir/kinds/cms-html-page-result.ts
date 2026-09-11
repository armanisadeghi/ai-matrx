import type {
  CanonicalBlockIR,
  KindDefinition,
  KindSchema,
} from "@ai-matrx/content-ir";

import type { CmsHtmlPageResult } from "./generated/kinds.generated";
import type { PartialKind } from "./kind-payload";

export const cmsHtmlPageResultKindSchema: KindSchema = {
  kind: "cms_html_page_result",
  fields: {
    pages: {
      type: "json[]",
      description: "HTML pages returned by a list operation.",
    },
    page: {
      type: "json",
      description:
        "The HTML page returned or written by a single-page operation.",
    },
    count: { type: "number" },
    total: { type: "number" },
    preview_url: { type: "string" },
    original_url: { type: "string" },
    dry_run: { type: "boolean" },
    validation_report: { type: "json" },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

/**
 * THE SHAPE COMES FROM THE REGISTRY (`pnpm shape:types`).
 *
 * This was a hand-written interface declaring only `pages` / `page` /
 * `isComplete`, so every other field the kind actually carries — `count`,
 * `total`, `preview_url`, `original_url`, `dry_run`, `validation_report`, … —
 * reached the component as `unknown` off the index signature, with no compile
 * error when one was renamed or dropped in the registry. It is now derived from
 * the generated `CmsHtmlPageResult`: the field NAMES and TYPES are the
 * registry's, and this file only states the two things the bridge adds on top —
 * `pages` is coerced to an array (never null) and `isComplete` is the envelope's
 * status, which is not a payload field at all.
 */
type StreamingCmsHtmlPageResult = Omit<
  PartialKind<CmsHtmlPageResult>,
  "__kind"
>;

export type CmsHtmlPageResultData = Omit<
  StreamingCmsHtmlPageResult,
  "pages" | "page"
> & {
  /** The bridge coerces the list: absent and empty render identically. */
  pages: NonNullable<StreamingCmsHtmlPageResult["pages"]>;
  /** The bridge coerces a non-object to `null` rather than leaving it absent. */
  page: NonNullable<StreamingCmsHtmlPageResult["page"]> | null;
  /** Envelope status, not a payload field. */
  isComplete: boolean;
} & Record<string, unknown>;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function cmsHtmlPageResultServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): CmsHtmlPageResultData | undefined {
  if (envelope.root.kind !== "cms_html_page_result") return undefined;
  const value = envelope.root.value;
  return {
    ...value,
    pages: Array.isArray(value.pages)
      ? value.pages
          .map(record)
          .filter((item): item is Record<string, unknown> => item !== null)
      : [],
    page: record(value.page),
    isComplete: envelope.root.status === "complete",
  };
}

export function cmsHtmlPageResultMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const pages = Array.isArray(value.pages) ? value.pages : [];
  const page = record(value.page);
  return [
    "# HTML page result",
    page
      ? `**Page:** ${String(page.title ?? page.slug ?? page.id ?? "HTML page")}`
      : null,
    pages.length ? `**Pages returned:** ${pages.length}` : null,
    typeof value.total === "number" ? `**Total:** ${value.total}` : null,
    typeof value.preview_url === "string"
      ? `**Preview:** ${value.preview_url}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const CMS_HTML_PAGE_RESULT_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "cms_html_page_result",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "cms_html_page_result",
    toLegacyServerData: cmsHtmlPageResultServerDataFromEnvelope,
    toMarkdown: cmsHtmlPageResultMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: cmsHtmlPageResultKindSchema,
  },
];
