// features/masterwork/kept-sources/types.ts
//
// THE RAW MATERIAL A RULEBOOK KEPT — the Expert's actual words, as a row.
//
// Until 2026-09-17 every capture lane parsed its source in memory, wrote draft
// rules, and threw the source away. A rule could say "in the source's own
// words" and quote a sentence, and there was nowhere on the platform to read
// the paragraph that sentence came out of. `platform.masterwork_source` keeps
// it, one row per captured source per Rulebook, and this is that row in the
// words the UI uses.
//
// THE JOIN IS `source_key`. Every rule carries `source_ref.source`, a string
// identity the server stamps from the same `source_identity` helper that names
// the kept row — so a rule and its passage are matched by plain string
// equality, never by a second anchoring scheme. See ./ruleJoin.ts.

import type { Database } from "@/types/database.types";

type Row = Database["platform"]["Tables"]["masterwork_source"]["Row"];

/**
 * What KIND of raw material this is, and therefore how the reader renders it.
 *
 * `turns` is a conversation (an interview, a meeting, a dictation with
 * speakers) and reads as speaker turns; everything else is one body of text in
 * `content`. Stored as plain text because the SERVER owns the vocabulary —
 * read it through `keptSourceMedium`, which returns a value only when it is
 * one this reader can actually render, so a medium added on the server shows
 * up as unstructured text rather than as a blank panel.
 */
export const KEPT_SOURCE_MEDIA = [
  "turns",
  "document",
  "text",
  "exchange",
] as const;

export type KeptSourceMedium = (typeof KEPT_SOURCE_MEDIA)[number];

export function keptSourceMedium(value: unknown): KeptSourceMedium | null {
  return KEPT_SOURCE_MEDIA.includes(value as KeptSourceMedium)
    ? (value as KeptSourceMedium)
    : null;
}

/**
 * One turn of a kept conversation.
 *
 * `started_at` / `ended_at` are SECONDS from the start of the recording, the
 * same unit `RuleSourceRef.time_range` carries and the same unit
 * `formatTimecode` renders — so a rule's "at 4:12" and the turn it points at
 * read the same clock. Both are optional: a pasted exchange has speakers and
 * no clock at all, and a turn with no time must render as a turn, never as
 * `0:00`.
 */
export interface KeptSourceTurn {
  index: number;
  speaker: string | null;
  text: string;
  started_at: number | null;
  ended_at: number | null;
}

/** One kept source, as the list and the reader use it. */
export interface KeptSource {
  id: string;
  rulebook_id: string;
  /** The join to `source_ref.source`. Unique per Rulebook. */
  source_key: string;
  /** A `platform.approach.key` — NEVER shown raw; resolved to its label. */
  approach_key: string;
  run_id: string | null;
  /** What the Expert would call this source. May be absent. */
  label: string | null;
  medium: KeptSourceMedium | null;
  /** The raw medium string as stored, for the honest line when we cannot render it. */
  medium_raw: string;
  content: string | null;
  turns: KeptSourceTurn[];
  transcript_id: string | null;
  file_id: string | null;
  url: string | null;
  captured_at: string;
  word_count: number;
  turn_count: number;
  speaker_count: number;
  /** The stored copy is CAPPED — the reader must say so and name the rest. */
  truncated: boolean;
  organization_id: string;
}

function toTurn(value: unknown, fallbackIndex: number): KeptSourceTurn | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const text = typeof raw.text === "string" ? raw.text : "";
  if (!text) return null;
  const num = (key: string): number | null => {
    const v = raw[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return {
    index: typeof raw.index === "number" ? raw.index : fallbackIndex,
    speaker: typeof raw.speaker === "string" && raw.speaker ? raw.speaker : null,
    text,
    started_at: num("started_at"),
    ended_at: num("ended_at"),
  };
}

/** `turns` is `jsonb` and therefore `Json` — parsed, never cast. */
export function parseTurns(value: unknown): KeptSourceTurn[] {
  if (!Array.isArray(value)) return [];
  const out: KeptSourceTurn[] = [];
  value.forEach((entry, i) => {
    const turn = toTurn(entry, i);
    if (turn) out.push(turn);
  });
  return out;
}

export function toKeptSource(row: Row): KeptSource {
  return {
    id: row.id,
    rulebook_id: row.rulebook_id,
    source_key: row.source_key,
    approach_key: row.approach_key,
    run_id: row.run_id,
    label: row.label,
    medium: keptSourceMedium(row.medium),
    medium_raw: row.medium,
    content: row.content,
    turns: parseTurns(row.turns),
    transcript_id: row.transcript_id,
    file_id: row.file_id,
    url: row.url,
    captured_at: row.captured_at,
    word_count: row.word_count,
    turn_count: row.turn_count,
    speaker_count: row.speaker_count,
    truncated: row.truncated,
    organization_id: row.organization_id,
  };
}

/**
 * A kept source's row in the list, with the one number that needs the
 * Rulebook's rules to compute (see ./ruleJoin.ts) and the lane's human label
 * already resolved. A raw `approach_key` never reaches a person.
 */
export interface KeptSourceRow extends KeptSource {
  /** `platform.approach.label`, or the key itself when the registry read failed. */
  lane_label: string;
  /** True when `lane_label` is a fallback, so the cell can say so. */
  lane_unresolved: boolean;
  /** Rules in this Rulebook whose `source_ref.source` is this `source_key`. */
  rule_count: number;
}

/**
 * WHAT A KEPT SOURCE IS CALLED — including when nobody ever named it.
 *
 * 🚨 "Untitled" IS NOT A NAME, IT IS AN ABSENCE WEARING ONE (cold walk 12,
 * D8). Three minutes after creating a Rulebook, having attached nothing, an
 * Expert read "1 source is already here" → "Untitled — 513 words" and
 * reasonably concluded the platform had put a stranger's source in her
 * Rulebook. It had not: verified on rulebook a18eb3de, all eight rows are
 * hers, the list query is scoped by `rulebook_id`, and the nameless row is her
 * OWN interview — `label` NULL while `chat.conversation.title` for the very
 * same capture reads "Pressure-Drop Diagnosis for Autumn Browning". Two
 * tables, one capture, one of them mute.
 *
 * So a source with no label says what it IS and WHEN it arrived, which is
 * always known, instead of a word that tells her nothing and reads like a
 * stranger. "Untitled" never reaches a person again.
 *
 * `now` is injectable so the guard can pin the clock.
 */
const MEDIUM_IN_WORDS: Record<KeptSourceMedium, string> = {
  turns: "Conversation",
  exchange: "Messages",
  document: "Document",
  text: "Pasted text",
};

export interface NameableKeptSource {
  label: string | null;
  /** `KeptSourceMedium` on a full row, the raw server string on a brief one. */
  medium: KeptSourceMedium | string | null;
  captured_at: string | null;
  url?: string | null;
}

export function keptSourceTitle(
  source: NameableKeptSource,
  now: Date = new Date(),
): string {
  const label = source.label?.trim();
  if (label) return label;
  if (source.url) return source.url;

  const medium = keptSourceMedium(source.medium);
  const kind = medium ? MEDIUM_IN_WORDS[medium] : "Source";
  const when = source.captured_at ? new Date(source.captured_at) : null;
  if (!when || Number.isNaN(when.getTime())) {
    // Even the date is unknown — say only what is true. Still never "Untitled".
    return `${kind} you added`;
  }
  const sameYear = when.getFullYear() === now.getFullYear();
  const day = when.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${kind} you added on ${day}`;
}
