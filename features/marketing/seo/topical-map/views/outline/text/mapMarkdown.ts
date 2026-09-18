/**
 * The map as a MARKDOWN TREE — what the Text view renders and what Copy hands
 * to a person (Arman, 2026-09-18: "the text version should be a markdown tree
 * … human readable and actually really nice for viewing and understanding").
 *
 * Pure: normalized topics in, one markdown document out. Built from the SAME
 * store tree every other view reads, so what the person reads here is the map
 * as loaded — never a second read that can disagree with the outline beside it.
 *
 * Shape: every root is a `##` heading (its description under it), every
 * descendant a nested bullet, two spaces per level. A topic that is not
 * `active` carries its status in italics. Counts appear only when the tree was
 * loaded with them (absent ≠ zero, so an unloaded count prints nothing).
 * Sibling order is the map's own sort order.
 */

import type { NormalizedMapTopic } from "../../../redux/types";

export interface MapMarkdownOptions {
  /** The map's display name, printed as the document title. */
  mapName?: string | null;
  /** Narrow the document to this topic and its descendants. */
  focusSlug?: string | null;
  /** Whether the tree carried `counts`. Off → no counts are printed anywhere. */
  countsLoaded: boolean;
  /** Include each topic's description under its name. */
  descriptions?: boolean;
}

function countsPhrase(topic: NormalizedMapTopic): string {
  const parts: string[] = [];
  if (typeof topic.pages === "number") parts.push(`${topic.pages} page${topic.pages === 1 ? "" : "s"}`);
  if (typeof topic.planned === "number") parts.push(`${topic.planned} planned`);
  if (typeof topic.keywords === "number") parts.push(`${topic.keywords} keyword${topic.keywords === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function statusMark(topic: NormalizedMapTopic): string {
  if (!topic.status || topic.status === "active") return "";
  return ` _(${topic.status})_`;
}

function cleanLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Renders one topic and its descendants as nested bullets, `depth` levels in. */
function bulletLines(
  topic: NormalizedMapTopic,
  topics: Record<string, NormalizedMapTopic>,
  depth: number,
  options: MapMarkdownOptions,
): string[] {
  const indent = "  ".repeat(depth);
  const counts = options.countsLoaded ? countsPhrase(topic) : "";
  const head = `${indent}- **${cleanLine(topic.name)}**${statusMark(topic)}${counts ? ` — ${counts}` : ""}`;
  const lines = [head];
  if (options.descriptions !== false && topic.description) {
    lines.push(`${indent}  ${cleanLine(topic.description)}`);
  }
  for (const childSlug of topic.childSlugs) {
    const child = topics[childSlug];
    if (child) lines.push(...bulletLines(child, topics, depth + 1, options));
  }
  if (topic.childSlugs.length === 0 && typeof topic.childrenCount === "number" && topic.childrenCount > 0) {
    lines.push(`${indent}  _${topic.childrenCount} more topic${topic.childrenCount === 1 ? "" : "s"} below this one (not loaded)_`);
  }
  return lines;
}

/** Renders one root: a heading, its description, then its descendants as bullets. */
function rootSection(
  root: NormalizedMapTopic,
  topics: Record<string, NormalizedMapTopic>,
  options: MapMarkdownOptions,
): string[] {
  const counts = options.countsLoaded ? countsPhrase(root) : "";
  const lines = [`## ${cleanLine(root.name)}${statusMark(root)}${counts ? ` — ${counts}` : ""}`];
  if (options.descriptions !== false && root.description) lines.push("", cleanLine(root.description));
  const children = root.childSlugs
    .map((slug) => topics[slug])
    .filter((child): child is NormalizedMapTopic => Boolean(child));
  if (children.length > 0) {
    lines.push("");
    for (const child of children) lines.push(...bulletLines(child, topics, 0, options));
  } else if (typeof root.childrenCount === "number" && root.childrenCount > 0) {
    lines.push("", `_${root.childrenCount} more topic${root.childrenCount === 1 ? "" : "s"} below this one (not loaded)_`);
  }
  return lines;
}

/**
 * The whole map (or the focused branch) as one markdown document. Returns ""
 * when there is nothing to print, so the caller can show an honest empty
 * state instead of a blank page.
 */
export function buildMapMarkdown(
  topics: Record<string, NormalizedMapTopic>,
  rootSlugs: readonly string[],
  options: MapMarkdownOptions,
): string {
  const roots = (options.focusSlug ? [options.focusSlug] : rootSlugs)
    .map((slug) => topics[slug])
    .filter((topic): topic is NormalizedMapTopic => Boolean(topic));
  if (roots.length === 0) return "";

  const lines: string[] = [];
  if (options.mapName) lines.push(`# ${cleanLine(options.mapName)}`, "");
  roots.forEach((root, index) => {
    if (index > 0) lines.push("");
    lines.push(...rootSection(root, topics, options));
  });
  return `${lines.join("\n")}\n`;
}
