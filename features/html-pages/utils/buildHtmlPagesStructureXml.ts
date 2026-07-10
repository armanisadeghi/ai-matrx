/**
 * The standalone HTML pages "big picture" framing value — `html_pages_structure`.
 *
 * Distinct from `buildSiteStructureXml` (`features/cms/utils/`) — standalone
 * `html_pages` rows are NOT part of a `client_sites`/`client_pages` tree
 * (no draft twins, no site policy, no nav/category). This is deliberately a
 * flat sibling list: id, title, indexability, and live URL for every page
 * the user has published, with the active one marked `current="true"`.
 *
 * Pure function — no fetching. Size-capped: collapses non-current entries to
 * `id`/`indexable` only (drops `title`/`url`) when the list is large enough
 * to blow the cap.
 */

import type { HtmlPageSummary } from "../types";

const MAX_XML_CHARS = 6_000;

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

export interface BuildHtmlPagesStructureXmlParams {
  pages: readonly HtmlPageSummary[];
  /** Id of the page open in the current editor. Empty when on the list. */
  currentId?: string;
}

function renderEntry(
  p: HtmlPageSummary,
  isCurrent: boolean,
  collapse: boolean,
): string {
  const attrs = [attr("id", p.id), attr("indexable", p.is_indexable)];
  if (!collapse) {
    attrs.push(attr("title", p.meta_title || "Untitled"), attr("url", p.url));
  }
  if (isCurrent) attrs.push('current="true"');
  return `<page ${attrs.join(" ")}/>`;
}

function render(
  params: BuildHtmlPagesStructureXmlParams,
  collapse: boolean,
): string {
  const { pages, currentId } = params;
  const entries = pages
    .map((p) =>
      renderEntry(p, p.id === currentId, collapse && p.id !== currentId),
    )
    .join("");
  return `<html_pages count="${pages.length}">${entries}</html_pages>`;
}

export function buildHtmlPagesStructureXml(
  params: BuildHtmlPagesStructureXmlParams,
): string {
  const full = render(params, false);
  if (full.length <= MAX_XML_CHARS) return full;
  return render(params, true);
}
