/**
 * The CMS "big picture" framing value — `site_structure`.
 *
 * Every website surface (`matrx-user/cms-site`, `matrx-user/cms-page`,
 * `matrx-user/cms-component`) emits this SAME compact XML string regardless
 * of where the user is (site dashboard, a page's HTML tab, a component
 * editor). It is the first thing an agent should read: it tells the agent
 * the site's identity, its write policy, every page's routing + status
 * flags, and every shared component — without any HTML/CSS/JS bodies. Once
 * an agent has this, it can navigate to any page/component via the aidream
 * CMS tools (`cms_page`, `cms_component`, `cms_find_page`, …) without the
 * local surface needing to re-describe the whole site on every value.
 *
 * Pure function — no fetching. Callers assemble `pages`/`components` from
 * whatever they already loaded (see `SiteLayoutClient`'s cache) and pass a
 * `current` pointer so the active node gets `current="true"`.
 *
 * Size-capped: renders every page/component in full on the first pass: if
 * the result exceeds `MAX_XML_CHARS`, every non-current page collapses to
 * its routing/flag attributes only (drops `title`) so large sites (50+
 * pages) still fit an LLM context window affordably.
 */

import type { ClientSite, ClientPageSummary, ClientComponent } from "../types";
import { clientSiteRootUrl } from "./pageUrls";

const MAX_XML_CHARS = 12_000;

export interface SiteStructureCurrent {
  kind: "page" | "component" | "site";
  id: string;
}

export interface BuildSiteStructureXmlParams {
  site: ClientSite;
  pages: readonly ClientPageSummary[];
  components: readonly ClientComponent[];
  current?: SiteStructureCurrent;
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function attr(name: string, value: string | number | boolean): string {
  return `${name}="${escapeXmlAttr(String(value))}"`;
}

function renderPage(
  p: ClientPageSummary,
  isCurrent: boolean,
  collapse: boolean,
): string {
  const attrs = [
    attr("id", p.id),
    attr("slug", p.slug),
    attr("category", p.category ?? "general"),
  ];
  if (!collapse) attrs.push(attr("title", p.title));
  attrs.push(
    attr("published", p.is_published),
    attr("has_draft", p.has_draft),
    attr("home", p.is_home_page),
    attr("nav", p.show_in_nav),
  );
  if (isCurrent) attrs.push('current="true"');
  return `<page ${attrs.join(" ")}/>`;
}

function renderComponent(c: ClientComponent, isCurrent: boolean): string {
  const attrs = [
    attr("id", c.id),
    attr("type", c.component_type),
    attr("name", c.name),
    attr("has_draft", c.has_draft),
    attr("active", c.is_active),
  ];
  if (isCurrent) attrs.push('current="true"');
  return `<component ${attrs.join(" ")}/>`;
}

function render(
  params: BuildSiteStructureXmlParams,
  collapseNonCurrentPages: boolean,
): string {
  const { site, pages, components, current } = params;
  const currentPageId = current?.kind === "page" ? current.id : undefined;
  const currentComponentId =
    current?.kind === "component" ? current.id : undefined;
  const policy = site.settings?.agent_write_policy ?? "blocked";

  const pageXml = pages
    .map((p) =>
      renderPage(
        p,
        p.id === currentPageId,
        collapseNonCurrentPages && p.id !== currentPageId,
      ),
    )
    .join("");
  const componentXml = components
    .map((c) => renderComponent(c, c.id === currentComponentId))
    .join("");

  const siteAttrs = [
    attr("id", site.id),
    attr("slug", site.slug),
    attr("name", site.name),
    attr("policy", policy),
    attr("live", clientSiteRootUrl(site.slug)),
    attr("preview", clientSiteRootUrl(site.slug, true)),
  ];
  if (current?.kind === "site" && current.id === site.id) {
    siteAttrs.push('current="true"');
  }

  return (
    `<cms_site ${siteAttrs.join(" ")}>` +
    `<pages count="${pages.length}">${pageXml}</pages>` +
    `<components count="${components.length}">${componentXml}</components>` +
    `</cms_site>`
  );
}

/**
 * Build the `site_structure` XML for a website surface. Always try the full
 * (uncollapsed) render first; only degrade to collapsed page attributes when
 * the site is large enough to blow the size cap.
 */
export function buildSiteStructureXml(
  params: BuildSiteStructureXmlParams,
): string {
  const full = render(params, false);
  if (full.length <= MAX_XML_CHARS) return full;
  return render(params, true);
}
