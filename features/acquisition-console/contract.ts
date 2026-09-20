// features/acquisition-console/contract.ts
//
// THE NARROWING LAYER for the Acquisition Console's five reads.
//
// 🚨 WHY A CONTRACT ON A *DATABASE* READ, not just on a server boundary.
// Four of the five registers this screen reads carry a `jsonb` column that the
// SERVER writes and Postgres does not type: `media.source_library.metrics` is a
// different shape per adapter (a catalogued Library has `transcripts`, an export
// Library has `total_items`), and it has already changed twice this month. A
// generated database type says `Json` and checks nothing. So the same rule the
// REST boundaries here live by applies: a component may only render a value one
// of these readers returned.
//
// 🚨 PER ROW, NEVER ALL-OR-NOTHING. Every list goes through `mapListRows`
// (lib/contract/narrow.ts): one Library whose `metrics` went weird must never
// cost the other 32 their row, and must never blank the section — that exact
// failure took the whole running-jobs panel down on 2026-09-18. A row that
// cannot be read is DROPPED AND NAMED, and the page prints the names.

import {
  ContractError,
  createReaders,
  mapListRows,
} from "@/lib/contract/narrow";
import { providerErrorSentence } from "@/lib/progress/failureSentence";
import {
  connectionAction,
  labelFor,
  plural,
  ADAPTER_LABELS,
  HANDOFF_REASON_LABELS,
  LANE_LABELS,
  MEDIUM_LABELS,
  type BlockedRow,
  type ConnectedRow,
  type HaveRow,
} from "./types";

/** This screen's own error type, so a caller can tell a shape problem from a
 *  network problem without string-matching a message. */
export class AcquisitionConsoleContractError extends ContractError {
  constructor(field: string, expected: string, got: string) {
    super(field, expected, got);
    this.name = "AcquisitionConsoleContractError";
  }
}

const r = createReaders(
  (field, expected, got) =>
    new AcquisitionConsoleContractError(field, expected, got),
);

/** A parsed list plus the sentence for every row that could not be read. */
export interface NarrowedList<T> {
  rows: T[];
  problems: string[];
}

// ── media.source_library ───────────────────────────────────────────────────

/** One Library, narrowed to only what the console counts. */
export interface LibraryFacts {
  id: string;
  adapter: string;
  name: string;
  itemCount: number;
  lastTouchedAt: string | null;
  /** Transcripts actually ready. Null when this adapter reports none. */
  transcriptsReady: number | null;
  /** Items read out of an export. Null when this adapter reports none. */
  exportItems: number | null;
  /** One of the platform's four lanes: personal · internal · link · public. */
  visibility: string;
  /** Who added it — the half of "personal" that decides whose lane it is. */
  createdBy: string | null;
}

/**
 * `metrics` is read DEFENSIVELY on purpose: it is the one column whose shape the
 * server owns and changes. A Library whose metrics blob is missing, null, or a
 * shape nobody recognises is still a Library the person has — so the yield reads
 * as unknown and the row survives. Only the row's IDENTITY (id, adapter) is
 * required, because a row without those is not a Library at all.
 */
export function parseLibraryRow(entry: unknown, index: number): LibraryFacts {
  const row = r.obj(entry, `libraries[${index}]`);
  const metrics =
    row.metrics && typeof row.metrics === "object" && !Array.isArray(row.metrics)
      ? (row.metrics as Record<string, unknown>)
      : {};

  const transcripts =
    metrics.transcripts &&
    typeof metrics.transcripts === "object" &&
    !Array.isArray(metrics.transcripts)
      ? (metrics.transcripts as Record<string, unknown>)
      : null;
  const ready = transcripts?.ready;
  const exportItems = metrics.total_items;

  return {
    id: r.str(row.id, `libraries[${index}].id`),
    adapter: r.str(row.adapter, `libraries[${index}].adapter`),
    name: r.optStr(row.name, `libraries[${index}].name`) ?? "Untitled",
    itemCount: r.optNum(row.item_count, `libraries[${index}].item_count`) ?? 0,
    lastTouchedAt:
      r.optStr(row.last_synced_at, `libraries[${index}].last_synced_at`) ??
      r.optStr(row.updated_at, `libraries[${index}].updated_at`),
    transcriptsReady: typeof ready === "number" && Number.isFinite(ready) ? ready : null,
    exportItems:
      typeof exportItems === "number" && Number.isFinite(exportItems)
        ? exportItems
        : null,
    visibility:
      r.optStr(row.visibility, `libraries[${index}].visibility`) ?? "personal",
    createdBy: r.optStr(row.created_by, `libraries[${index}].created_by`),
  };
}

export function parseLibraries(items: unknown[]): NarrowedList<LibraryFacts> {
  return mapListRows(items, parseLibraryRow);
}

// ── platform.masterwork_source ─────────────────────────────────────────────

export interface RulebookSourceFacts {
  id: string;
  rulebookId: string | null;
  medium: string;
  turnCount: number;
  wordCount: number;
  capturedAt: string | null;
}

export function parseRulebookSourceRow(
  entry: unknown,
  index: number,
): RulebookSourceFacts {
  const row = r.obj(entry, `rulebookSources[${index}]`);
  return {
    id: r.str(row.id, `rulebookSources[${index}].id`),
    rulebookId: r.optStr(row.rulebook_id, `rulebookSources[${index}].rulebook_id`),
    medium: r.optStr(row.medium, `rulebookSources[${index}].medium`) ?? "unknown",
    turnCount: r.optNum(row.turn_count, `rulebookSources[${index}].turn_count`) ?? 0,
    wordCount: r.optNum(row.word_count, `rulebookSources[${index}].word_count`) ?? 0,
    capturedAt:
      r.optStr(row.captured_at, `rulebookSources[${index}].captured_at`) ??
      r.optStr(row.created_at, `rulebookSources[${index}].created_at`),
  };
}

export function parseRulebookSources(
  items: unknown[],
): NarrowedList<RulebookSourceFacts> {
  return mapListRows(items, parseRulebookSourceRow);
}

// ── users.integration_connections ──────────────────────────────────────────

export function parseConnectionRow(entry: unknown, index: number): ConnectedRow {
  const row = r.obj(entry, `connections[${index}]`);
  const ownerType = r.optStr(row.owner_type, `connections[${index}].owner_type`);
  const status = r.optStr(row.status, `connections[${index}].status`) ?? "unknown";
  return {
    id: r.str(row.id, `connections[${index}].id`),
    provider: r.str(row.provider, `connections[${index}].provider`),
    ownerScope: ownerType === "organization" ? "organization" : "user",
    status,
    account:
      r.optStr(row.account_email, `connections[${index}].account_email`) ??
      r.optStr(row.account_name, `connections[${index}].account_name`),
    lastSync: r.optStr(
      row.last_verified_at,
      `connections[${index}].last_verified_at`,
    ),
    action: connectionAction(status),
    href: "/settings/integrations",
    note: r.optStr(row.last_error, `connections[${index}].last_error`),
  };
}

export function parseConnections(items: unknown[]): NarrowedList<ConnectedRow> {
  return mapListRows(items, parseConnectionRow);
}

// ── platform.acquisition_block ─────────────────────────────────────────────

export function parseBlockRow(entry: unknown, index: number): BlockedRow {
  const row = r.obj(entry, `blocks[${index}]`);
  const id = r.str(row.id, `blocks[${index}].id`);
  const ref = r.str(row.input_ref, `blocks[${index}].input_ref`);
  const label = r.optStr(row.input_label, `blocks[${index}].input_label`);
  const unblock = r.optStr(row.unblock_note, `blocks[${index}].unblock_note`);
  const lawful = r.optStr(row.lawful_route, `blocks[${index}].lawful_route`);
  const errorSentence = r.optStr(
    row.error_sentence,
    `blocks[${index}].error_sentence`,
  );
  // No `error_sentence` — the only thing left is `error_class`, a raw
  // provider/exception token (`LOGIN_REQUIRED`, `ProxyError`) rather than a
  // sentence. Map it through the failure-sentence helper rather than
  // printing it: cold-walk-13 caught this token sitting inside an otherwise
  // excellent person-facing row.
  const errorClass = errorSentence
    ? null
    : providerErrorSentence(
        r.optStr(row.error_class, `blocks[${index}].error_class`),
      );
  return {
    id: `block:${id}`,
    origin: "block",
    what: label?.trim() || ref.replace(/^https?:\/\//, ""),
    where: errorSentence ?? errorClass?.text ?? "It refused without saying why",
    whereDetail: errorClass?.detail,
    since:
      r.optStr(row.first_seen_at, `blocks[${index}].first_seen_at`) ??
      r.str(row.last_seen_at, `blocks[${index}].last_seen_at`),
    times: r.optNum(row.occurrence_count, `blocks[${index}].occurrence_count`) ?? 1,
    // The ledger already decided the remedy. The console never invents one.
    action: unblock?.trim() || lawful?.trim() || "Open it in the Block Ledger",
    href: `/acquisition/blocks?q=${encodeURIComponent(ref)}`,
  };
}

export function parseBlocks(items: unknown[]): NarrowedList<BlockedRow> {
  return mapListRows(items, parseBlockRow);
}

// ── media.capture_handoff ──────────────────────────────────────────────────

export function parseHandoffRow(entry: unknown, index: number): BlockedRow {
  const row = r.obj(entry, `handoffs[${index}]`);
  const id = r.str(row.id, `handoffs[${index}].id`);
  const url = r.optStr(row.url, `handoffs[${index}].url`);
  const title = r.optStr(row.title, `handoffs[${index}].title`);
  const whatToDo = r.optStr(row.what_to_do, `handoffs[${index}].what_to_do`);
  const reason = r.optStr(row.reason, `handoffs[${index}].reason`);
  return {
    id: `handoff:${id}`,
    origin: "handoff",
    what: title?.trim() || url?.replace(/^https?:\/\//, "") || "A page",
    where: labelFor(HANDOFF_REASON_LABELS, reason),
    since:
      r.optStr(row.created_at, `handoffs[${index}].created_at`) ??
      r.str(row.updated_at, `handoffs[${index}].updated_at`),
    times: r.optNum(row.attempt_count, `handoffs[${index}].attempt_count`) ?? 0,
    // The hand-off carries its own instruction. Reuse it; never write a second one.
    action: whatToDo?.trim() || "Open it in your own browser",
    href: "/capture/needs-you",
  };
}

export function parseHandoffs(items: unknown[]): NarrowedList<BlockedRow> {
  return mapListRows(items, parseHandoffRow);
}

// ── The roll-ups Section 1 renders ─────────────────────────────────────────

/**
 * Group Libraries into one row per KIND AND LANE.
 *
 * Not per adapter alone: a person's own YouTube channels and the workspace's shared
 * ones are two different answers to "what do we have", and collapsing them would make
 * the count mean something different depending on who is reading it. The lane is a
 * column of its own, so it sorts and filters like every other fact.
 */
export function rollUpLibraries(
  libraries: LibraryFacts[],
  userId: string | null,
): HaveRow[] {
  const groups = new Map<string, { adapter: string; lane: string; rows: LibraryFacts[] }>();
  for (const lib of libraries) {
    // "personal" is only "yours" when it IS yours. Someone else's personal Library
    // reaching this seat through a share is not in the reader's own lane.
    const lane =
      lib.visibility === "personal" && userId && lib.createdBy !== userId
        ? "shared-with-you"
        : lib.visibility;
    const key = `${lib.adapter}::${lane}`;
    const bucket = groups.get(key);
    if (bucket) bucket.rows.push(lib);
    else groups.set(key, { adapter: lib.adapter, lane, rows: [lib] });
  }

  return [...groups.entries()].map(([key, { adapter, lane, rows }]) => {
    const ready = rows.reduce((sum, row) => sum + (row.transcriptsReady ?? 0), 0);
    const anyReported = rows.some((row) => row.transcriptsReady !== null);
    const exported = rows.reduce((sum, row) => sum + (row.exportItems ?? 0), 0);
    const anyExported = rows.some((row) => row.exportItems !== null);
    const lastAdded =
      rows
        .map((row) => row.lastTouchedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;

    let yieldSentence: string;
    let yieldCount: number;
    if (anyReported) {
      yieldCount = ready;
      yieldSentence = plural(ready, "transcript ready", "transcripts ready");
    } else if (anyExported) {
      yieldCount = exported;
      yieldSentence = plural(exported, "message read", "messages read");
    } else {
      // NOT a zero. The server has not reported a yield for this kind at all,
      // and printing "0 transcripts" would be this screen inventing a fact.
      yieldCount = -1;
      yieldSentence = "Not reported yet";
    }

    return {
      id: `library:${key}`,
      origin: "library" as const,
      kind: labelFor(ADAPTER_LABELS, adapter),
      lane:
        lane === "shared-with-you"
          ? "Shared with you"
          : labelFor(LANE_LABELS, lane),
      count: rows.length,
      items: rows.reduce((sum, row) => sum + row.itemCount, 0),
      lastAdded,
      yield: yieldSentence,
      yieldCount,
      // 🚨 DELIBERATELY BARE, AND NOT AN OVERSIGHT (D343, 2026-09-20). This
      // row knows its own adapter and lane, and `/libraries?q=…` is the
      // obvious deep link — but `GET /media/libraries` in aidream declares
      // only `limit` and `offset`, so `q`, `visibility` and `adapter` are all
      // dropped by FastAPI and answered 200 with the whole unfiltered list.
      // A parameter the destination cannot honour is a worse lie than no
      // parameter: the URL would claim a narrowing the screen does not do.
      // The day the server half lands, this becomes the filtered link and
      // `createLibraryListConfig` takes `urlState: true`. See FOUND_DEFECTS
      // D343 for the exact server change.
      href: "/libraries",
    };
  });
}

/** Group Rulebook Sources into one row per medium. */
export function rollUpRulebookSources(sources: RulebookSourceFacts[]): HaveRow[] {
  const byMedium = new Map<string, RulebookSourceFacts[]>();
  for (const source of sources) {
    const bucket = byMedium.get(source.medium);
    if (bucket) bucket.push(source);
    else byMedium.set(source.medium, [source]);
  }

  return [...byMedium.entries()].map(([medium, rows]) => {
    const turns = rows.reduce((sum, row) => sum + row.turnCount, 0);
    const words = rows.reduce((sum, row) => sum + row.wordCount, 0);
    const lastAdded = rows
      .map((row) => row.capturedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

    return {
      id: `rulebook-sources:${medium}`,
      origin: "rulebook" as const,
      kind: `On Rulebooks — ${labelFor(MEDIUM_LABELS, medium)}`,
      lane: labelFor(LANE_LABELS, "rulebook"),
      count: rows.length,
      items: null,
      lastAdded,
      yield:
        turns > 0
          ? plural(turns, "turn kept", "turns kept")
          : plural(words, "word kept", "words kept"),
      yieldCount: turns > 0 ? turns : words,
      href: "/masterwork",
    };
  });
}

/** The section's rows, biggest first — a person reads the pile before the flecks. */
export function sortHaveRows(rows: HaveRow[]): HaveRow[] {
  return [...rows].sort(
    (a, b) => b.count - a.count || a.kind.localeCompare(b.kind),
  );
}
