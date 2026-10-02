/**
 * RECORD FACTS — the one or two things that tell same-named records apart.
 *
 * WHY (G5 review, 2026-10-02, nightly clone): the reference picker's record
 * search showed eight "invoices thing / Edited Aug 11" rows that came from two
 * organizations, and three chats that differed only by "11 min / 12 min ago".
 * A date alone never tells two records apart; a person tells them apart by
 * WHERE they live (the organization, when the list spans several) and by one
 * fact about WHAT they are — a task's status, a note's first words, a chat's
 * length.
 *
 * The organization column comes from the registry (`EntityInfo.orgColumn`), so
 * every type gets it. The second fact is declared per type below — a small,
 * explicit list of columns a person recognises; a type with no entry gets the
 * organization only. Lists show every organization: nothing here reads or
 * filters by the active organization.
 *
 * A read that fails (a table the browser cannot read, a column renamed) costs
 * only the facts, never the list: it is reported to the console with the type
 * and the remedy, and the rows keep their date line.
 */

import { supabase } from "@/utils/supabase/client";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { partyKindWord } from "@/features/crm/party-words";
import { valueWord } from "@/features/directive-catalog/valueVocabulary";

/** The ≤60-character secondary slot (interface-text policy). */
export const SECONDARY_LINE_MAX = 60;

type Row = Record<string, unknown>;

interface FactSpec {
  /** Columns read beside `id` and the organization column. */
  columns: readonly string[];
  /** The fact a person reads, or null when this row has none. */
  text: (row: Row) => string | null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** `in_progress` → "In progress". */
export function statusWord(value: unknown): string | null {
  const raw = asText(value);
  if (!raw) return null;
  const words = raw.replace(/[_-]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function statusOf(noun: string, value: unknown): string | null {
  const raw = asText(value);
  return raw ? valueWord(noun, "status", raw) : null;
}

/** The first words of a body, on one line, quoted so it reads as content. */
export function snippet(value: unknown, max = 28): string | null {
  const raw = asText(value);
  if (!raw) return null;
  const line = raw
    // A fenced block (a reference, code) is not words a person wrote.
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/[#*_>`~[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

const RECORD_FACTS: Readonly<Record<string, FactSpec>> = {
  // The record's own status words ("Inbox", "In progress") — never the stored
  // value ("incomplete"), which the Task window never says (G6B review).
  task: { columns: ["status"], text: (r) => statusOf("task", r.status) },
  project: { columns: ["status"], text: (r) => statusOf("project", r.status) },
  note: { columns: ["content_preview"], text: (r) => snippet(r.content_preview) },
  conversation: {
    columns: ["message_count"],
    text: (r) =>
      typeof r.message_count === "number"
        ? `${r.message_count} ${r.message_count === 1 ? "message" : "messages"}`
        : null,
  },
  party: {
    columns: ["party_kind", "headline"],
    text: (r) => asText(r.headline) ?? partyKindWord(r.party_kind),
  },
  scope: { columns: ["description"], text: (r) => snippet(r.description) },
};

export interface RecordFact {
  organizationId: string | null;
  fact: string | null;
}

/** The columns read for a type, or null when the registry does not know it. */
export function recordFactColumns(token: string): string[] | null {
  const info = tryGetEntityInfo(token);
  if (!info) return null;
  return ["id", info.orgColumn, ...(RECORD_FACTS[token]?.columns ?? [])];
}

/** One row → its facts. Pure, so the guard proves it without a database. */
export function recordFactFromRow(token: string, row: Row): RecordFact {
  const info = tryGetEntityInfo(token);
  const orgColumn = info?.orgColumn ?? "organization_id";
  return {
    organizationId: asText(row[orgColumn]),
    fact: RECORD_FACTS[token]?.text(row) ?? null,
  };
}

/** Facts for a page of records, keyed by id. Never throws. */
export async function fetchRecordFacts(
  token: string,
  ids: readonly string[],
): Promise<Map<string, RecordFact>> {
  const out = new Map<string, RecordFact>();
  const info = tryGetEntityInfo(token);
  const columns = recordFactColumns(token);
  if (!info || !columns || ids.length === 0) return out;
  // supabase-js wants literal schema/table names; the registry gives runtime
  // values (same dynamic-read shape as RegistryPeek / associationCandidates).
  const db = (
    info.schema && info.schema !== "public"
      ? supabase.schema(info.schema as "files")
      : supabase
  ) as typeof supabase;
  const { data, error } = await db
    .from(info.table as never)
    .select(columns.join(", "))
    .in("id" as never, ids as never);
  if (error) {
    console.warn(
      `[recordFacts] Could not read the organization and status of ${token} rows ` +
        `(${info.schema}.${info.table}: ${error.message}). Rows show their date only. ` +
        `Remedy: make ${columns.join(", ")} readable to the signed-in person, or ` +
        `correct RECORD_FACTS.${token} in features/scopes/service/recordFacts.ts.`,
    );
    return out;
  }
  for (const row of (data ?? []) as unknown as Row[]) {
    const id = asText(row.id);
    if (id) out.set(id, recordFactFromRow(token, row));
  }
  return out;
}

/**
 * THE secondary line under a record's name: organization (only when the list
 * spans several), then the fact, then when it changed — never past
 * `SECONDARY_LINE_MAX`. The fact gives up characters first; the organization
 * and the date are what a person scans for.
 */
export function composeRecordSecondaryLine(parts: {
  organization: string | null;
  fact: string | null;
  edited: string | null;
}): string | null {
  const SEP = " · ";
  const head = [parts.organization, parts.fact, parts.edited].filter(
    (p): p is string => Boolean(p),
  );
  if (head.length === 0) return null;
  const line = head.join(SEP);
  if (line.length <= SECONDARY_LINE_MAX) return line;
  // Shorten the fact to whatever room the other two leave.
  const fixed = [parts.organization, parts.edited].filter(
    (p): p is string => Boolean(p),
  );
  const fixedLength = fixed.join(SEP).length;
  const room = SECONDARY_LINE_MAX - fixedLength - (parts.fact ? SEP.length : 0);
  const fact =
    parts.fact && room >= 6 ? `${parts.fact.slice(0, room - 1).trimEnd()}…` : null;
  const shortened = [parts.organization, fact, parts.edited]
    .filter((p): p is string => Boolean(p))
    .join(SEP);
  return shortened.length <= SECONDARY_LINE_MAX
    ? shortened
    : `${shortened.slice(0, SECONDARY_LINE_MAX - 1)}…`;
}
