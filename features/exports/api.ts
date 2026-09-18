// features/exports/api.ts
//
// Every call BRING YOUR EXPORT makes to the aidream `/media` export endpoints.
// One file, so the day the server contract lands in
// `types/python-generated/api-types.ts` there is exactly one place to move to
// `lib/api/typed-client`'s `apiGet`/`apiPost` (which cannot be used yet — it is
// generic over a path LITERAL that must exist in the generated `paths`, and
// none of these do).
//
// Transport is the canonical `lib/python-client`: it owns base-url selection
// (the admin server toggle), a fresh Supabase JWT per request, the request id,
// and Error Inspector capture. Feature-owned `fetch` is a bypass.
//
// 🚨 EVERY RESPONSE IS NARROWED, NEVER ASSERTED. A generic type parameter on
// `getJson` is a promise, not a check — on 2026-09-17 one server key that
// changed from a count to a list took `/exports` to the global error boundary
// on every single load, because nothing between the socket and the JSX ever
// looked. Each function below hands the raw body to `./contract`, which either
// returns a value every field of which has been checked, or throws an
// `ExportContractError` whose message is a sentence a person can read. No
// function in this file returns anything a parser did not build.

import { getJson, postJson, postNdjson } from "@/lib/python-client";
import {
  parseAdapterCatalog,
  parseCreateExportResponse,
  parseExportItemFacets,
  parseExportItemsResponse,
  parseExportLibrary,
  parseIndexEvent,
  parseSendToRulebookResponse,
  type Parsed,
} from "./contract";
import type {
  CreateExportResponse,
  ExportAdapterCatalog,
  ExportItemFacets,
  ExportItemFilter,
  ExportItemOrder,
  ExportItemsResponse,
  ExportLibrary,
  IndexEvent,
  SendToRulebookResponse,
} from "./types";

/** Drop empty/undefined params so the URL says only what the person chose. */
function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

/**
 * WHAT YOU CAN DROP HERE — always from the server, never a hardcoded list.
 * The unreadable half is part of the answer: a format we recognise and cannot
 * read ships its own `block` sentence so dropping one is never "unknown file".
 */
export async function fetchExportAdapters(
  signal?: AbortSignal,
): Promise<Parsed<ExportAdapterCatalog>> {
  const { data } = await getJson<unknown>("/media/export-adapters", { signal });
  return parseAdapterCatalog(data);
}

/** Turn an uploaded file into a Library. Returns what the bytes were detected as. */
export async function createExportLibrary(input: {
  fileId: string;
  name?: string;
  visibility?: string;
  organizationId?: string;
}): Promise<CreateExportResponse> {
  const { data } = await postJson<
    unknown,
    {
      file_id: string;
      name?: string;
      visibility?: string;
      organization_id?: string;
    }
  >("/media/exports", {
    file_id: input.fileId,
    name: input.name,
    visibility: input.visibility,
    organization_id: input.organizationId,
  });
  return parseCreateExportResponse(data);
}

/**
 * Re-read one Library.
 *
 * 🚨 THE STREAM IS NEVER THE ONLY COPY. Disconnecting does not stop the index,
 * so a page that learned the summary only from the stream shows nothing after a
 * refresh, a phone lock, or a link opened in a new tab. Every mount reads here
 * first and treats the stream as live decoration on top of it.
 *
 * Callers must handle this REFUSING: it is the one route in this feature whose
 * shape was not written down in the contract we were handed, so the library
 * page degrades honestly (it says the summary is unavailable and still shows
 * the real item counts from `/items`) rather than pretending the export is
 * empty.
 */
export async function fetchExportLibrary(
  libraryId: string,
  signal?: AbortSignal,
): Promise<ExportLibrary> {
  const { data } = await getJson<unknown>(
    `/media/exports/${encodeURIComponent(libraryId)}`,
    { signal, captureErrors: false },
  );
  return parseExportLibrary(data);
}

/**
 * Index the Library, streaming progress. Yields the typed events off the NDJSON
 * data channel and ignores heartbeats and anything else it does not know.
 */
export async function* streamExportIndex(
  libraryId: string,
  signal?: AbortSignal,
): AsyncGenerator<IndexEvent, void, void> {
  const path = `/media/libraries/${encodeURIComponent(libraryId)}/index`;
  for await (const event of postNdjson(path, {}, { signal })) {
    if (event.event !== "data") continue;
    const read = parseIndexEvent(event.data);
    if (read === null) continue;
    if ("problem" in read) {
      // An update we cannot read is NOT silently dropped and never crashes the
      // index: it surfaces as a failure event carrying the honest sentence.
      yield {
        type: "library.index.failed",
        library_id: libraryId,
        seq: -1,
        at: new Date().toISOString(),
        partial_total: 0,
        message: read.problem,
      };
      continue;
    }
    yield read.event;
  }
}

export interface ExportItemsQuery extends ExportItemFilter {
  order?: ExportItemOrder;
  dir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** One page of items, with BOTH totals. */
export async function fetchExportItems(
  libraryId: string,
  query: ExportItemsQuery,
  signal?: AbortSignal,
): Promise<ExportItemsResponse> {
  const path =
    `/media/libraries/${encodeURIComponent(libraryId)}/items` +
    queryString({ ...query });
  const { data } = await getJson<unknown>(path, { signal });
  return parseExportItemsResponse(data);
}

export async function fetchExportItemFacets(
  libraryId: string,
  signal?: AbortSignal,
): Promise<ExportItemFacets> {
  const { data } = await getJson<unknown>(
    `/media/libraries/${encodeURIComponent(libraryId)}/item-facets`,
    { signal },
  );
  return parseExportItemFacets(data);
}

/**
 * SEND SELECTED ITEMS TO A RULEBOOK AS SOURCES.
 *
 * 🚨 `confirmedSentence` is the EXACT words the person read on the
 * confirmation before clicking. The server stores it verbatim and REFUSES with
 * 403 `consent_required` without it, so it is a required argument here rather
 * than an option with a default — there is no way to call this without having
 * shown somebody a sentence.
 *
 * 🚨 `filter` and `itemIds` are exclusive, and the filter is the one that
 * scales: when the person chose "everything matching", 50,000 ids do not go
 * over the wire, the FILTER does.
 */
export async function sendExportItemsToRulebook(input: {
  libraryId: string;
  rulebookId: string;
  confirmedSentence: string;
  itemIds?: string[];
  filter?: ExportItemFilter;
}): Promise<SendToRulebookResponse> {
  const { data } = await postJson<
    unknown,
    {
      rulebook_id: string;
      confirmed_sentence: string;
      item_ids?: string[];
      filter?: ExportItemFilter;
    }
  >(`/media/libraries/${encodeURIComponent(input.libraryId)}/send-to-rulebook`, {
    rulebook_id: input.rulebookId,
    confirmed_sentence: input.confirmedSentence,
    ...(input.filter ? { filter: input.filter } : {}),
    ...(input.itemIds ? { item_ids: input.itemIds } : {}),
  });
  return parseSendToRulebookResponse(data);
}
