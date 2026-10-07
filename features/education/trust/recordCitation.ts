// features/education/trust/recordCitation.ts
//
// Where a citation to a RECORD lands — a conversation, a table, a pick list, a
// saved result, a markdown document. These Sources have no file behind them,
// so the Source Inspector's page/time anchors do not apply; the part id the
// server named the cited passage with (`source_resolution.py`) is the anchor:
//
//   conversation  `<id>:m<first>-<last>`   message positions (0-based)
//   table / list  `<id>:r<first>-<last>`   row numbers (1-based)
//   saved result  `<id>:<key>`             `summary` or `<list>-<n>` (a card, a section)
//   document / udt_document  `<id>:<n>`    the n-th packed paragraph run (markdown / cloud)
//
// Pure — no hooks, no network. `recordCitationTarget` names the place (the
// same words the Source picker shows) and builds the canonical deep link;
// the conversation opens in the Source Inspector window at its message range.

import type { RecordCitationKind, SourceCitation } from "./types";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PART_RE = new RegExp(`^(${UUID}):(.+)$`, "i");
const MESSAGE_PART = /^m(\d+)-(\d+)$/;
const ROW_PART = /^r(\d+)-(\d+)$/;

/** A record part id → the record and the place inside it. Null when it is not one. */
export function parseRecordPart(sourceId: string): { recordId: string; part: string } | null {
  const m = PART_RE.exec(sourceId.trim());
  return m ? { recordId: m[1]!, part: m[2]! } : null;
}

/** The cited messages of a conversation part, as 0-based positions. */
export function messageRangeOfPart(part: string): { first: number; last: number } | null {
  const m = MESSAGE_PART.exec(part);
  if (!m) return null;
  const first = Number.parseInt(m[1]!, 10);
  const last = Number.parseInt(m[2]!, 10);
  return last >= first ? { first, last } : null;
}

/** The cited rows of a table / pick list part (1-based). */
export function rowRangeOfPart(part: string): { first: number; last: number } | null {
  const m = ROW_PART.exec(part);
  if (!m) return null;
  const first = Number.parseInt(m[1]!, 10);
  const last = Number.parseInt(m[2]!, 10);
  return first >= 1 && last >= first ? { first, last } : null;
}

/** "Message 3" / "Messages 3–5" — positions are 0-based, people count from 1. */
export function messagesLabel(range: { first: number; last: number }): string {
  const a = range.first + 1;
  const b = range.last + 1;
  return a === b ? `Message ${a}` : `Messages ${a}–${b}`;
}

/** "Row 12" / "Rows 12–15" / "Choice 3" / "Choices 3–6". */
export function rowsLabel(range: { first: number; last: number }, noun: "Row" | "Choice"): string {
  return range.first === range.last
    ? `${noun} ${range.first}`
    : `${noun}s ${range.first}–${range.last}`;
}

/**
 * A saved result part's name — the server's own words: `summary` is the
 * result's top fields, `cards-3` is "Card 3". A bare ordinal names nothing.
 */
export function fieldLabelOfPart(part: string): string | null {
  const item = /^(.+?)-(\d+)$/.exec(part);
  const words = (key: string) => {
    const spaced = key
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .trim();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  };
  if (item) {
    const name = words(item[1]!);
    const singular = name.endsWith("s") && name.length > 3 ? name.slice(0, -1) : name;
    return `${singular} ${item[2]}`;
  }
  if (/^\d+$/.test(part)) return null;
  return words(part) || null;
}

/** `col: value | col: value` (a table row as the server writes it) → its cells. */
export function cellsOfExcerpt(excerpt: string | null | undefined): Record<string, string> {
  const cells: Record<string, string> = {};
  for (const piece of (excerpt ?? "").split(" | ")) {
    const at = piece.indexOf(": ");
    if (at <= 0) continue;
    const column = piece.slice(0, at).trim();
    const value = piece.slice(at + 2).trim();
    if (column && value && !(column in cells)) cells[column] = value;
  }
  return cells;
}

/**
 * A pick-list line is `name: Delta Dental PPO | help_text: …` (cells, like a
 * table row) or the older `label: description`; the choice is found by its
 * name, never by the column word.
 */
export function choiceNameOfExcerpt(excerpt: string | null | undefined): string | null {
  const line = (excerpt ?? "").split("\n")[0]!.trim();
  if (!line) return null;
  const cells = cellsOfExcerpt(line);
  const named = cells.name ?? cells.label ?? cells.title;
  if (named) return named;
  if (line.includes(" | ")) return null;
  const at = line.indexOf(": ");
  return (at > 0 ? line.slice(0, at) : line).trim() || null;
}

/** What a record citation opens: its place, its door, and (conversation) its message range. */
export interface RecordCitationTarget {
  kind: RecordCitationKind;
  recordId: string;
  /** The part id after the record id. */
  part: string;
  /** "Messages 3–5", "Row 12", "Card 2"; null = nothing honest to say. */
  label: string | null;
  /** The record's own page, at the cited place — the inspector's "Open source" link. */
  href: string;
  /** A conversation's cited messages (0-based positions). */
  messageRange: { first: number; last: number } | null;
}

/** The kind a citation's record is: stamped by the persisting surface, else read off the part. */
export function recordKindOf(c: SourceCitation): RecordCitationKind | null {
  if (c.recordKind) return c.recordKind;
  const parsed = parseRecordPart(c.sourceId);
  if (parsed && MESSAGE_PART.test(parsed.part)) return "conversation";
  return null;
}

/** The canonical door of one record at its cited place. */
export function recordCitationHref(
  kind: RecordCitationKind,
  recordId: string,
  part: string,
  excerpt: string | null | undefined,
): string {
  const id = encodeURIComponent(recordId);
  switch (kind) {
    case "conversation": {
      const range = messageRangeOfPart(part);
      return range ? `/chat/${id}?messages=${range.first}-${range.last}` : `/chat/${id}`;
    }
    case "table":
    case "pick_list": {
      const base = kind === "table" ? `/data/${id}` : `/pick-lists/${id}`;
      if (kind === "pick_list") {
        const name = choiceNameOfExcerpt(excerpt);
        return name ? `${base}?filter=${encodeURIComponent(JSON.stringify({ name }))}` : base;
      }
      const cells = cellsOfExcerpt(excerpt);
      // A row line carries its own row id: open that row's panel.
      if (cells.id && new RegExp(`^${UUID}$`, "i").test(cells.id)) {
        return `${base}?record=${encodeURIComponent(cells.id)}`;
      }
      return Object.keys(cells).length
        ? `${base}?filter=${encodeURIComponent(JSON.stringify(cells))}`
        : base;
    }
    case "saved_result":
      return part ? `/shapes/instances/${id}?field=${encodeURIComponent(part)}` : `/shapes/instances/${id}`;
    // One door for both kinds: `/documents/[id]` opens a cloud (Univer)
    // document itself and sends a content-store document to its own editor by
    // its format (`contentDocumentDoor` -> `documentHref`: markdown to the
    // Markdown Studio, a Space to /spaces). The entity registry carries the same
    // door (guarded in record-citation.test.ts).
    case "document":
    case "udt_document":
      return `/documents/${id}`;
  }
}

const URL_RECORD_RE = new RegExp(`/(${UUID})(?:[/?#]|$)`, "i");

/** The record id the citation's own stamped link names (`/chat/<id>`, `/data/<id>`…), if any. */
export function recordIdOfUrl(url: string | null | undefined): string | null {
  const m = URL_RECORD_RE.exec(url ?? "");
  return m ? m[1]!.toLowerCase() : null;
}

/**
 * The record and place a citation names. The part id is the anchor only when
 * it is a part OF the record: an agent may cite a chunk id of another Source
 * (or a passage id the resolver never named) while the persisting surface
 * stamped the record and its link. The stamped link wins then — the record
 * opens whole, never as an id that is not a record ("We couldn't find this
 * conversation").
 */
function recordAndPart(c: SourceCitation): { recordId: string; part: string } | null {
  const parsed = parseRecordPart(c.sourceId);
  const fromUrl = c.recordKind ? recordIdOfUrl(c.url) : null;
  if (fromUrl && (!parsed || parsed.recordId.toLowerCase() !== fromUrl)) {
    return { recordId: fromUrl, part: "" };
  }
  return parsed;
}

/** A record citation's target, or null when the citation is not one (or names no record). */
export function recordCitationTarget(c: SourceCitation): RecordCitationTarget | null {
  const kind = recordKindOf(c);
  if (!kind) return null;
  const located = recordAndPart(c);
  if (!located) return null;
  const { recordId, part } = located;
  const messageRange = kind === "conversation" ? messageRangeOfPart(part) : null;
  let label: string | null = null;
  if (kind === "conversation") {
    label = messageRange ? messagesLabel(messageRange) : null;
  } else if (kind === "table" || kind === "pick_list") {
    const rows = rowRangeOfPart(part);
    label = rows ? rowsLabel(rows, kind === "table" ? "Row" : "Choice") : null;
  } else if (kind === "saved_result") {
    label = fieldLabelOfPart(part);
  }
  return {
    kind,
    recordId,
    part,
    label,
    href: recordCitationHref(kind, recordId, part, c.excerpt),
    messageRange,
  };
}
