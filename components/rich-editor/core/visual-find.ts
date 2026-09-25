// components/rich-editor/core/visual-find.ts
//
// Find & replace over the visual document — the same pattern builder as the
// source view (find-replace.ts), the same protection rule: text in paragraphs,
// headings, lists, quotes and table cells is searchable; islands (inline chips
// and protected blocks) are searched ONLY when "include protected content" is
// on, and a replace inside one is an explicit island edit.

import type { Node as PMNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { buildFindRegex, replacementFor, type FindOptions } from "./find-replace";

export interface VisualMatch {
  /** Document range for text matches; the island's own position for island matches. */
  from: number;
  to: number;
  island: null | { pos: number; start: number; end: number; raw: string };
}

export interface VisualFindResult {
  matches: VisualMatch[];
  skippedProtected: number;
  error: string | null;
}

const ATOM = "￼";

export function findInDoc(doc: PMNode, query: string, options: FindOptions = {}): VisualFindResult {
  const { regex, error } = buildFindRegex(query, options);
  if (!regex) return { matches: [], skippedProtected: 0, error };
  const matches: VisualMatch[] = [];
  let skippedProtected = 0;

  const searchIsland = (node: PMNode, pos: number) => {
    const raw = String(node.attrs.raw ?? "");
    for (const match of raw.matchAll(regex)) {
      if (!match[0]) continue;
      if (!options.includeProtected) {
        skippedProtected += 1;
        continue;
      }
      const start = match.index ?? 0;
      matches.push({ from: pos, to: pos + node.nodeSize, island: { pos, start, end: start + match[0].length, raw } });
    }
  };

  doc.descendants((node, pos) => {
    if (node.type.name === "islandBlock" || node.type.name === "sourceLocked") {
      searchIsland(node, pos);
      return false;
    }
    if (!node.isTextblock) return true;
    let text = "";
    const map: number[] = [];
    node.forEach((child, offset) => {
      const childPos = pos + 1 + offset;
      if (child.isText) {
        for (let i = 0; i < (child.text ?? "").length; i += 1) map.push(childPos + i);
        text += child.text ?? "";
      } else {
        if (child.type.name === "inlineIsland") searchIsland(child, childPos);
        map.push(childPos);
        text += ATOM;
      }
    });
    for (const match of text.matchAll(regex)) {
      if (!match[0] || match[0].includes(ATOM)) continue;
      const start = match.index ?? 0;
      const from = map[start];
      const last = map[start + match[0].length - 1];
      if (from === undefined || last === undefined) continue;
      matches.push({ from, to: last + 1, island: null });
    }
    return false;
  });
  matches.sort((a, b) => a.from - b.from || (a.island?.start ?? 0) - (b.island?.start ?? 0));
  return { matches, skippedProtected, error: null };
}

/**
 * Replace the given matches in one transaction, back to front so earlier
 * positions stay valid. Island matches rewrite the island's bytes; the caller
 * records them as approved island edits. Returns the stored bytes of every
 * island it changed.
 */
export function replaceInDoc(
  tr: Transaction,
  matches: readonly VisualMatch[],
  query: string,
  replacement: string,
  options: FindOptions = {},
): string[] {
  const changedIslands: string[] = [];
  const islandEdits = new Map<number, { raw: string; edits: Array<{ start: number; end: number }> }>();
  const textMatches: VisualMatch[] = [];
  for (const match of matches) {
    if (match.island) {
      const entry = islandEdits.get(match.island.pos) ?? { raw: match.island.raw, edits: [] };
      entry.edits.push({ start: match.island.start, end: match.island.end });
      islandEdits.set(match.island.pos, entry);
    } else {
      textMatches.push(match);
    }
  }
  const ordered = [
    ...textMatches.map((match) => ({ pos: match.from, apply: () => {
      const found = tr.doc.textBetween(match.from, match.to);
      tr.insertText(replacementFor(found, query, replacement, options), match.from, match.to);
    } })),
    ...[...islandEdits.entries()].map(([pos, entry]) => ({ pos, apply: () => {
      const node = tr.doc.nodeAt(pos);
      if (!node) return;
      let next = "";
      let cursor = 0;
      for (const edit of entry.edits.sort((a, b) => a.start - b.start)) {
        next += entry.raw.slice(cursor, edit.start);
        next += replacementFor(entry.raw.slice(edit.start, edit.end), query, replacement, options);
        cursor = edit.end;
      }
      next += entry.raw.slice(cursor);
      if (next !== entry.raw) {
        changedIslands.push(entry.raw);
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, raw: next });
      }
    } })),
  ].sort((a, b) => b.pos - a.pos);
  for (const step of ordered) step.apply();
  return changedIslands;
}
