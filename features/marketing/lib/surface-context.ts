/**
 * XML parent-context builders for the Marketing surface fleet.
 *
 * Every Marketing surface descends from `matrx-user/marketing-brand` (and,
 * below it, `matrx-user/marketing-site`). Those two surfaces emit ONE compact
 * XML snapshot each — `brand_context` and `site_context` — that every child
 * surface inherits, so an agent working anywhere in the tree reads the same
 * ground truth about the client and the managed website. The CMS analog is
 * `features/cms/utils/buildSiteStructureXml.ts` (`site_structure`).
 *
 * Both builders are PURE — no fetching, no hooks. Callers pass rows they
 * already loaded; empty/unknown parts are omitted entirely, never rendered as
 * blank elements. Output is compact: attributes over nested elements, one
 * newline between top-level sections, no indentation.
 */

import type {
  BrandAsset,
  BrandProperty,
  BusinessFact,
  MarketingBrand,
  MarketingSite,
} from "@/features/marketing/types";
import { isJsonRecord, parseBrandProfile } from "@/features/marketing/types";
import type { SiteConnectionStatus } from "@/features/marketing/lib/site-status";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function attr(name: string, value: string | number | boolean): string {
  return `${name}="${escapeXml(String(value))}"`;
}

/** Attribute rendered only when the value is a non-empty string. */
function optionalAttr(name: string, value: string | null | undefined): string[] {
  return typeof value === "string" && value.trim()
    ? [attr(name, value.trim())]
    : [];
}

function element(tag: string, text: string): string {
  return `<${tag}>${escapeXml(text)}</${tag}>`;
}

/** Extract the display text of a `web.business_fact.value` jsonb payload. */
function businessFactValue(fact: BusinessFact): string {
  if (isJsonRecord(fact.value)) {
    const candidate = fact.value.url ?? fact.value.text ?? fact.value.value;
    if (typeof candidate === "string" && candidate) return candidate;
    return JSON.stringify(fact.value);
  }
  return fact.value === null ? "" : String(fact.value);
}

export interface BrandContextInput {
  brand: MarketingBrand;
  properties?: readonly BrandProperty[];
  facts?: readonly BusinessFact[];
  assets?: readonly BrandAsset[];
  sites?: readonly MarketingSite[];
}

/**
 * Build the `brand_context` XML: brand identity, the authored editorial
 * profile (omitted entirely when empty), confirmed business facts, brand
 * assets, social/website properties, and every managed site.
 */
export function buildBrandContextXml(input: BrandContextInput): string {
  const { brand, properties = [], facts = [], assets = [], sites = [] } = input;
  const sections: string[] = [];

  if (brand.description?.trim()) {
    sections.push(element("description", brand.description.trim()));
  }

  const profile = parseBrandProfile(brand.profile);
  const profileParts: string[] = [];
  const profileText: Array<[keyof typeof profile & string, string | undefined]> = [
    ["audience", profile.audience],
    ["voice_tone", profile.voice_tone],
    ["positioning", profile.positioning],
    ["service_area", profile.service_area],
    ["content_guidelines", profile.content_guidelines],
    ["notes", profile.notes],
  ];
  const profileLists: Array<[string, string[] | undefined]> = [
    ["value_props", profile.value_props],
    ["offerings", profile.offerings],
    ["competitors", profile.competitors],
    ["target_keywords", profile.target_keywords],
  ];
  for (const [tag, value] of profileText) {
    if (value) profileParts.push(element(tag, value));
  }
  for (const [tag, items] of profileLists) {
    if (items?.length) {
      profileParts.push(
        `<${tag}>${items.map((item) => element("item", item)).join("")}</${tag}>`,
      );
    }
  }
  if (profileParts.length) {
    sections.push(`<profile>${profileParts.join("")}</profile>`);
  }

  if (facts.length) {
    const factXml = facts
      .map((fact) => {
        const attrs = [attr("kind", fact.kind), ...optionalAttr("label", fact.label)];
        return `<fact ${attrs.join(" ")}>${escapeXml(businessFactValue(fact))}</fact>`;
      })
      .join("");
    sections.push(`<business_facts>${factXml}</business_facts>`);
  }

  if (assets.length) {
    const assetXml = assets
      .map((asset) => {
        const attrs = [
          attr("kind", asset.kind),
          ...optionalAttr("title", asset.title),
          ...(asset.is_primary ? [attr("is_primary", true)] : []),
        ];
        return `<asset ${attrs.join(" ")}/>`;
      })
      .join("");
    sections.push(`<brand_assets>${assetXml}</brand_assets>`);
  }

  if (properties.length) {
    const propertyXml = properties
      .map((property) => {
        const attrs = [
          attr("kind", property.kind),
          ...optionalAttr("url", property.url),
          ...optionalAttr("handle", property.handle),
        ];
        return `<property ${attrs.join(" ")}/>`;
      })
      .join("");
    sections.push(`<properties>${propertyXml}</properties>`);
  }

  if (sites.length) {
    const siteXml = sites
      .map((site) =>
        `<site ${[
          attr("id", site.id),
          attr("name", site.name),
          attr("root_url", site.root_url),
          attr("status", site.status),
        ].join(" ")}/>`,
      )
      .join("");
    sections.push(`<sites>${siteXml}</sites>`);
  }

  const brandAttrs = [
    attr("id", brand.id),
    attr("name", brand.name),
    ...optionalAttr("industry", brand.industry),
    ...optionalAttr("website", brand.website_url),
    attr("status", brand.status),
  ];
  return `<brand ${brandAttrs.join(" ")}>${sections.length ? `\n${sections.join("\n")}\n` : ""}</brand>`;
}

export interface SiteContextInput {
  site: MarketingSite;
  /** Output of `siteConnectionStatuses` (lib/site-status.ts) when available. */
  statuses?: readonly SiteConnectionStatus[];
  counts?: {
    pages_total?: number;
    open_findings?: number;
    sitemaps?: number;
  };
  lastCrawlAt?: string | null;
}

/** Map site-status keys to the compact `<connections>` attribute names. */
const CONNECTION_ATTR_BY_KEY: Record<SiteConnectionStatus["key"], string> = {
  initialized: "init",
  search_console: "gsc",
  analytics: "ga4",
  pagespeed: "psi",
  cms: "cms",
};

/**
 * Build the `site_context` XML: site identity, connection statuses
 * (Init/GSC/GA4/PSI/CMS), initialization state, registry counts, and crawl
 * freshness. Unknown/empty parts are omitted entirely.
 */
export function buildSiteContextXml(input: SiteContextInput): string {
  const { site, statuses, counts, lastCrawlAt } = input;
  const sections: string[] = [];

  if (site.description?.trim()) {
    sections.push(element("description", site.description.trim()));
  }

  if (statuses?.length) {
    const connectionAttrs = statuses.map((status) =>
      attr(CONNECTION_ATTR_BY_KEY[status.key], status.state),
    );
    sections.push(`<connections ${connectionAttrs.join(" ")}/>`);
  }

  if (site.initialized_at) {
    sections.push(`<initialization ${attr("initialized_at", site.initialized_at)}/>`);
  }

  const countAttrs = [
    ...(typeof counts?.pages_total === "number"
      ? [attr("pages", counts.pages_total)]
      : []),
    ...(typeof counts?.open_findings === "number"
      ? [attr("findings", counts.open_findings)]
      : []),
    ...(typeof counts?.sitemaps === "number"
      ? [attr("sitemaps", counts.sitemaps)]
      : []),
  ];
  if (countAttrs.length) {
    sections.push(`<counts ${countAttrs.join(" ")}/>`);
  }

  if (lastCrawlAt) {
    sections.push(`<last_crawl ${attr("at", lastCrawlAt)}/>`);
  }

  const siteAttrs = [
    attr("id", site.id),
    attr("name", site.name),
    attr("root_url", site.root_url),
    attr("domain", site.domain),
    attr("status", site.status),
  ];
  return `<site ${siteAttrs.join(" ")}>${sections.length ? `\n${sections.join("\n")}\n` : ""}</site>`;
}
