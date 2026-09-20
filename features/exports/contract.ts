// features/exports/contract.ts
//
// THE BOUNDARY. Every byte the `/media` export endpoints send is narrowed here
// before any component may render it.
//
// 🚨 WHY THIS FILE EXISTS — the defect it closes, so nobody deletes it.
// On 2026-09-17 `/exports` crashed on every load with React's "Objects are not
// valid as a React child (found: object with keys {label, block})". The live
// server answered `GET /media/export-adapters` with `recognised_not_readable`
// as a LIST of `{label, block}` objects (its `accept_summary()` published a key
// the router also publishes as a COUNT, and the `**` spread silently replaced
// the count). `types.ts` said `number`, `api.ts` asserted the response with a
// generic type parameter and no check, and `AdapterCatalog.tsx` put the value
// straight into a JSX child position. One renamed server key took the whole
// screen to the global error boundary before a single pixel of the feature
// painted.
//
// 🚨 WHY A TYPE ALONE CANNOT FIX IT. `lib/api/FEATURE.md` rule 1 says response
// types are DERIVED from `types/python-generated/api-types.ts`. These routes
// are now IN the server's `openapi.json` (they were 404 when `types.ts` was
// written — that note is stale), but every one of them is declared
// `-> dict[str, Any]` on the server, so the published schema is
// `{"type": "object", "additionalProperties": true}` and there is NOTHING to
// derive: a generated type would be `Record<string, unknown>` and would have
// caught exactly none of this. Until the server publishes response MODELS, the
// only thing that can make a shape true is a runtime check, and this file is
// it. The day those models land, the interfaces in `types.ts` become
// `components["schemas"][…]` aliases and these parsers keep guarding the wire.
//
// THE RULE THIS ENFORCES: a component may only render a value this file
// returned. Nothing in `features/exports` renders a raw response field.

import {
  ContractError,
  createReaders,
  describe,
  mapListRows,
  recovered,
  type Parsed,
} from "@/lib/contract/narrow";

import type {
  CreateExportResponse,
  ExportAdapter,
  ExportAdapterCatalog,
  ExportContainer,
  ExportCorrespondent,
  ExportDateRange,
  ExportDetection,
  ExportItem,
  ExportItemFacets,
  ExportItemParty,
  ExportItemsResponse,
  ExportLibrary,
  ExportSummary,
  IndexEvent,
  SendToRulebookResponse,
} from "./types";

/**
 * The server sent something this screen cannot render.
 *
 * `message` is the sentence a person reads. It names the field, what was
 * expected, and what arrived — never a stack, never "something went wrong".
 *
 * The sentence, the readers below it and `recovered()` are NOT this feature's:
 * they live in `lib/contract/narrow.ts`, because a boundary that can lie is
 * every feature's problem and the outage above will not be the last one. This
 * file keeps its own error TYPE so a screen can tell an unreadable `/media`
 * export response from any other feature's.
 */
export class ExportContractError extends ContractError {
  constructor(field: string, expected: string, got: string) {
    super(field, expected, got);
    this.name = "ExportContractError";
  }
}

const { obj, arr, str, optStr, num, optNum, bool, optBool, strList, countMap } =
  createReaders(
    (field, expected, got) => new ExportContractError(field, expected, got),
  );

export { describe, recovered };
export type { Parsed };

// ─── the payloads ────────────────────────────────────────────────────────────

function parseAdapter(value: unknown, field: string): ExportAdapter {
  const row = obj(value, field);
  return {
    key: str(row.key, `${field}.key`),
    label: str(row.label, `${field}.label`),
    accepts: str(row.accepts, `${field}.accepts`),
    implemented: bool(row.implemented, `${field}.implemented`),
    block: optStr(row.block, `${field}.block`),
  };
}

/**
 * `GET /media/export-adapters`.
 *
 * The two counts are recoverable on purpose: `adapters` already proves them, so
 * a server that mislabels a count must not cost a person the list of what they
 * can drop. The LIST ITSELF is not recoverable if it is not a list at all — a
 * screen that cannot say what it accepts has nothing honest to show — but ONE
 * unreadable adapter row must not cost every other adapter: see `mapListRows`
 * in `lib/contract/narrow.ts`. The bad row is dropped and its sentence
 * collected in `problems`, which `AdapterCatalog.tsx` already renders as one
 * honest line per issue, beside the adapters that read fine.
 */
export function parseAdapterCatalog(payload: unknown): Parsed<ExportAdapterCatalog> {
  const root = obj(payload, "the list of formats");
  const problems: string[] = [];
  const { rows: adapters, problems: adapterRowProblems } = mapListRows(
    arr(root.adapters, "adapters"),
    (entry, index) => parseAdapter(entry, `adapters[${index}]`),
  );
  problems.push(...adapterRowProblems);
  const readable = recovered(
    problems,
    "readable",
    "a whole number",
    root.readable,
    () => num(root.readable, "readable"),
    () => adapters.filter((a) => a.implemented).length,
  );
  const recognisedNotReadable = recovered(
    problems,
    "recognised_not_readable",
    "a whole number",
    root.recognised_not_readable,
    () => num(root.recognised_not_readable, "recognised_not_readable"),
    () => adapters.filter((a) => !a.implemented).length,
  );
  return {
    value: { adapters, readable, recognised_not_readable: recognisedNotReadable },
    problems,
  };
}

function parseDateRange(value: unknown, field: string): ExportDateRange {
  const row = obj(value, field);
  return {
    earliest: optStr(row.earliest, `${field}.earliest`),
    latest: optStr(row.latest, `${field}.latest`),
    span_days: optNum(row.span_days, `${field}.span_days`),
  };
}

function parseCorrespondent(value: unknown, field: string): ExportCorrespondent {
  const row = obj(value, field);
  return {
    key: str(row.key, `${field}.key`),
    label: str(row.label, `${field}.label`),
    count: num(row.count, `${field}.count`),
  };
}

function parseContainer(value: unknown, field: string): ExportContainer {
  const row = obj(value, field);
  return {
    key: str(row.key, `${field}.key`),
    label: str(row.label, `${field}.label`),
    count: num(row.count, `${field}.count`),
  };
}

/**
 * 🚨 ONE UNREADABLE CORRESPONDENT MUST NOT CRASH THE WHOLE SUMMARY. Before
 * this fix, `top_correspondents.map(parseCorrespondent)` aborted the whole
 * summary parse the moment a single ranked correspondent had a bad field — a
 * finished export whose 30th correspondent was malformed would render as
 * "not indexed yet" for every OTHER number on the card. `mapListRows`
 * (`lib/contract/narrow.ts`) drops only that one correspondent; its sentence
 * is folded into `warnings`, which `LibrarySummary.tsx` already renders as
 * "What we could not work out" beside the numbers that DID read.
 */
export function parseExportSummary(value: unknown, field = "summary"): ExportSummary {
  const row = obj(value, field);
  const { rows: topCorrespondents, problems: correspondentRowProblems } = mapListRows(
    arr(row.top_correspondents, `${field}.top_correspondents`),
    (entry, index) =>
      parseCorrespondent(entry, `${field}.top_correspondents[${index}]`),
  );
  // Same per-row tolerance as correspondents above, and for the same reason:
  // one malformed thread/channel must not blank the whole summary card.
  const { rows: topContainers, problems: containerRowProblems } = mapListRows(
    arr(row.top_containers, `${field}.top_containers`),
    (entry, index) => parseContainer(entry, `${field}.top_containers[${index}]`),
  );
  return {
    total_items: num(row.total_items, `${field}.total_items`),
    counts_by_kind: countMap(row.counts_by_kind, `${field}.counts_by_kind`),
    counts_by_direction: countMap(row.counts_by_direction, `${field}.counts_by_direction`),
    counts_by_label: countMap(row.counts_by_label, `${field}.counts_by_label`),
    top_containers: topContainers,
    date_range: parseDateRange(row.date_range, `${field}.date_range`),
    top_correspondents: topCorrespondents,
    total_chars: num(row.total_chars, `${field}.total_chars`),
    total_words: num(row.total_words, `${field}.total_words`),
    with_attachments: num(row.with_attachments, `${field}.with_attachments`),
    owner_identity: optStr(row.owner_identity, `${field}.owner_identity`),
    owner_identity_basis: optStr(
      row.owner_identity_basis,
      `${field}.owner_identity_basis`,
    ),
    warnings: [
      ...strList(row.warnings ?? [], `${field}.warnings`),
      ...correspondentRowProblems,
      ...containerRowProblems,
    ],
  };
}

/**
 * One export Library, from `GET /media/exports/{id}` or from the create response.
 *
 * 🚨 THE SERVER WRAPS THE ROW, AND SO THIS UNWRAPS IT. `read_export` returns
 * `{"library": {…}}`, not the row. Reading the envelope as the row makes every
 * field `undefined`, which on 2026-09-17 showed on the real screen as "the
 * export.id should be text and arrived as nothing at all" — honest, and still
 * an empty summary card on a Library that had just indexed perfectly. Accepting
 * BOTH shapes is the same ruling `features/source-library/api.ts` records for
 * the same server on the same day: reality is the referee, and a screen does
 * not get to be right while a person sees nothing.
 *
 * It is a strict unwrap, not a guess: only an object carrying a `library` key
 * whose value is itself an object is treated as an envelope.
 */
export function parseExportLibrary(payload: unknown, field = "the export"): ExportLibrary {
  const outer = obj(payload, field);
  const inner = outer.library;
  const row =
    inner !== null && typeof inner === "object" && !Array.isArray(inner)
      ? (inner as Record<string, unknown>)
      : outer;
  return {
    id: str(row.id, `${field}.id`),
    name: str(row.name ?? "", `${field}.name`),
    file_id: optStr(row.file_id, `${field}.file_id`),
    adapter: optStr(row.adapter, `${field}.adapter`),
    adapter_label: optStr(row.adapter_label, `${field}.adapter_label`),
    detected_from: optStr(row.detected_from, `${field}.detected_from`),
    status: optStr(row.status ?? row.sync_status, `${field}.status`),
    bytes: optNum(row.bytes, `${field}.bytes`),
    total_items: optNum(row.total_items ?? row.item_count, `${field}.total_items`),
    visibility: optStr(row.visibility, `${field}.visibility`),
    organization_id: optStr(row.organization_id, `${field}.organization_id`),
    created_at: optStr(row.created_at, `${field}.created_at`),
    updated_at: optStr(row.updated_at, `${field}.updated_at`),
    /**
     * 🚨 THE SERVER CALLS IT `metrics`, AND THAT IS NOT COSMETIC.
     * `read_export` publishes the finished summary under `metrics`, never
     * `summary`. Reading only `summary` meant a completed export always looked
     * un-indexed to the page, so `ExportLibraryPage`'s "index only what has not
     * been indexed" guard never fired and EVERY mount re-ran the index. Before
     * the server was made idempotent, the second pass hit
     * `library_item_library_external_uniq` and a person re-opening their own
     * export was shown a database constraint over 10,000 perfectly indexed
     * messages (2026-09-17). An empty `metrics` object means "not indexed yet"
     * and stays null — it is the server's own "nothing measured", not a summary
     * of zero.
     */
    summary: (() => {
      const direct = row.summary;
      if (direct !== undefined && direct !== null) {
        return parseExportSummary(direct, `${field}.summary`);
      }
      const metrics = row.metrics;
      if (
        metrics !== undefined &&
        metrics !== null &&
        typeof metrics === "object" &&
        !Array.isArray(metrics) &&
        Object.keys(metrics as object).length > 0
      ) {
        return parseExportSummary(metrics, `${field}.metrics`);
      }
      return null;
    })(),
  };
}

function parseDetection(value: unknown, field: string): ExportDetection {
  const row = obj(value, field);
  return {
    adapter: str(row.adapter, `${field}.adapter`),
    adapter_label: str(row.adapter_label, `${field}.adapter_label`),
    confidence: num(row.confidence, `${field}.confidence`),
    detected_from: str(row.detected_from, `${field}.detected_from`),
  };
}

export function parseCreateExportResponse(payload: unknown): CreateExportResponse {
  const root = obj(payload, "the new export");
  return {
    library: parseExportLibrary(root.library, "library"),
    detected: parseDetection(root.detected, "detected"),
  };
}

function parseParty(value: unknown, field: string): ExportItemParty | null {
  if (value === undefined || value === null) return null;
  const row = obj(value, field);
  return {
    name: optStr(row.name, `${field}.name`),
    email: optStr(row.email, `${field}.email`),
    handle: optStr(row.handle, `${field}.handle`),
  };
}

/**
 * `rowProblems`, when given, collects one sentence per RECIPIENT this build
 * could not read — dropped, never guessed, and never costing the item its
 * other recipients, its author, or its body fields. See `mapListRows` in
 * `lib/contract/narrow.ts`. Omitted by callers that parse a single item in
 * isolation (the create-export response), where there is nowhere yet for a
 * sub-row problem to surface; `parseExportItemsResponse` below always passes
 * one, and its sentences land in `ExportItemsResponse.row_problems`.
 */
export function parseExportItem(
  value: unknown,
  field: string,
  rowProblems?: string[],
): ExportItem {
  const row = obj(value, field);
  const { rows: recipients, problems: recipientProblems } = mapListRows(
    arr(row.recipients ?? [], `${field}.recipients`),
    (entry, index) => parseParty(entry, `${field}.recipients[${index}]`),
  );
  if (recipientProblems.length > 0) rowProblems?.push(...recipientProblems);
  return {
    id: str(row.id, `${field}.id`),
    external_id: optStr(row.external_id, `${field}.external_id`),
    kind: str(row.kind, `${field}.kind`),
    title: optStr(row.title, `${field}.title`),
    direction: str(row.direction, `${field}.direction`),
    author: parseParty(row.author, `${field}.author`),
    recipients: recipients.filter(
      (party): party is ExportItemParty => party !== null,
    ),
    occurred_at: optStr(row.occurred_at, `${field}.occurred_at`),
    container_id: optStr(row.container_id, `${field}.container_id`),
    container_label: optStr(row.container_label, `${field}.container_label`),
    labels: strList(row.labels ?? [], `${field}.labels`),
    char_count: num(row.char_count, `${field}.char_count`),
    word_count: num(row.word_count, `${field}.word_count`),
    attachment_count: num(row.attachment_count, `${field}.attachment_count`),
    attachment_names: strList(row.attachment_names ?? [], `${field}.attachment_names`),
    is_reply: optBool(row.is_reply, `${field}.is_reply`, false),
  };
}

/**
 * `GET /media/libraries/{id}/items`.
 *
 * 🚨 PER-ROW, NEVER ALL-OR-NOTHING. One item this build cannot read must not
 * blank the list for every OTHER item that reads fine — see `mapListRows` in
 * `lib/contract/narrow.ts`. The bad row is dropped and its sentence collected
 * in `row_problems`, alongside any single-recipient problems `parseExportItem`
 * reports for items that otherwise parsed; `ExportLibraryPage` shows one
 * honest line per problem, the same way the Libraries lane in
 * `features/source-library` does.
 */
export function parseExportItemsResponse(payload: unknown): ExportItemsResponse {
  const root = obj(payload, "the items");
  const rowProblems: string[] = [];
  const { rows: items, problems: badItemProblems } = mapListRows(
    arr(root.items, "items"),
    (entry, index) => parseExportItem(entry, `items[${index}]`, rowProblems),
  );
  rowProblems.push(...badItemProblems);
  return {
    items,
    row_problems: rowProblems,
    total: num(root.total, "total"),
    filtered_total: num(root.filtered_total, "filtered_total"),
    limit: num(root.limit, "limit"),
    offset: num(root.offset, "offset"),
    filter_description: str(root.filter_description ?? "", "filter_description"),
  };
}

export function parseExportItemFacets(payload: unknown): ExportItemFacets {
  const root = obj(payload, "the facets");
  return {
    direction: countMap(root.direction ?? {}, "direction"),
    item_kind: countMap(root.item_kind ?? {}, "item_kind"),
  };
}

export function parseSendToRulebookResponse(payload: unknown): SendToRulebookResponse {
  const root = obj(payload, "the send result");
  return {
    sent: num(root.sent, "sent"),
    rulebook_id: str(root.rulebook_id, "rulebook_id"),
    permit_id: str(root.permit_id, "permit_id"),
    confirmed_sentence: str(root.confirmed_sentence, "confirmed_sentence"),
    confirmed_at: str(root.confirmed_at, "confirmed_at"),
  };
}

/**
 * One NDJSON index event, or `null` for anything this screen does not know.
 *
 * A malformed event must never take the page down mid-index: an event that
 * cannot be read is dropped and the reason is returned, so the caller can show
 * it beside the progress rather than crash on it.
 */
export function parseIndexEvent(
  payload: unknown,
): { event: IndexEvent } | { problem: string } | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const row = payload as Record<string, unknown>;
  const type = row.type;
  if (typeof type !== "string" || !type.startsWith("library.index.")) return null;
  try {
    const head = {
      library_id: str(row.library_id, `${type}.library_id`),
      seq: num(row.seq, `${type}.seq`),
      at: str(row.at, `${type}.at`),
    };
    switch (type) {
      case "library.index.started":
        return {
          event: {
            type,
            ...head,
            adapter: str(row.adapter, `${type}.adapter`),
            adapter_label: str(row.adapter_label, `${type}.adapter_label`),
            detected_from: str(row.detected_from, `${type}.detected_from`),
            bytes: num(row.bytes, `${type}.bytes`),
          },
        };
      case "library.index.page":
        return {
          event: {
            type,
            ...head,
            cumulative: num(row.cumulative, `${type}.cumulative`),
            elapsed_ms: num(row.elapsed_ms, `${type}.elapsed_ms`),
          },
        };
      case "library.index.completed":
        return {
          event: {
            type,
            ...head,
            total_indexed: num(row.total_indexed, `${type}.total_indexed`),
            elapsed_ms: num(row.elapsed_ms, `${type}.elapsed_ms`),
            summary: parseExportSummary(row.summary, `${type}.summary`),
          },
        };
      case "library.index.failed":
        return {
          event: {
            type,
            ...head,
            partial_total: num(row.partial_total, `${type}.partial_total`),
            message: str(row.message, `${type}.message`),
          },
        };
      default:
        return null;
    }
  } catch (error: unknown) {
    return {
      problem:
        error instanceof ExportContractError
          ? error.message
          : `A progress update from the server could not be read: ${String(error)}`,
    };
  }
}
