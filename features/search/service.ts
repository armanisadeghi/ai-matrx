/**
 * Search service — the ONE client path to a kind-shaped web search.
 *
 * Calls aidream's `POST /search-kinds/search` (the same endpoint the Stage B
 * demo proved) and returns the `web_search_results` kind instance the
 * translation adapter produced. There is no second search path on this
 * surface: provider keys live on the server, and the client never learns one.
 *
 * The endpoint streams NDJSON and emits exactly one `search_kinds_result`
 * event before `end`; this reader takes the last one it sees so a future
 * incremental server (section-by-section) needs no client rewrite — the
 * caller re-renders on every `onOutcome`.
 */

import { consumeStream } from "@/lib/api/stream-parser";
import type {
  SearchOutcome,
  SearchProvider,
  SearchTranslationReport,
} from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readTranslation(v: unknown): SearchTranslationReport | null {
  if (!isRecord(v) || typeof v.provider !== "string") return null;
  const unknownSections = Array.isArray(v.unknown)
    ? v.unknown.flatMap((u) =>
        isRecord(u) && typeof u.section === "string" && Array.isArray(u.keys)
          ? [{ section: u.section, keys: u.keys.map(String) }]
          : [],
      )
    : [];
  return { provider: v.provider, unknownSections };
}

export interface RunSearchArgs {
  /** Transport — `useBackendApi().post`, so auth/request-id/error capture stay centralized. */
  post: (
    endpoint: string,
    body: unknown,
    signal?: AbortSignal,
  ) => Promise<Response>;
  query: string;
  provider: SearchProvider;
  count: number;
  signal?: AbortSignal;
  /** Fired for every kind instance the server emits, in order. */
  onOutcome: (outcome: SearchOutcome) => void;
}

export async function runKindSearch({
  post,
  query,
  provider,
  count,
  signal,
  onOutcome,
}: RunSearchArgs): Promise<void> {
  const response = await post(
    "/search-kinds/search",
    { provider, query, count },
    signal,
  );

  let received = false;
  await consumeStream(
    response,
    {
      onData: (data) => {
        if (
          isRecord(data) &&
          data.type === "search_kinds_result" &&
          isRecord(data.result)
        ) {
          received = true;
          onOutcome({
            result: data.result,
            translation: readTranslation(data.translation),
          });
        }
      },
      onError: (e) => {
        throw new Error(e.user_message || e.message || "The search failed.");
      },
    },
    signal,
  );

  if (!received) {
    throw new Error(
      "The search ended without returning any results. Try again in a moment.",
    );
  }
}
