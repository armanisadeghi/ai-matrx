import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import { createClient } from "@/utils/supabase/client";
import { ragDb } from "@/utils/supabase/ragDb";
import type { ApiChunksResponse } from "./types";
import {
  chunksFetchError,
  chunksFetchStart,
  chunksFetchSuccess,
} from "./pdfStudioSlice";

const FRESH_MS = 5 * 60 * 1000;
const DEBOUNCE_MS = 200;

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function key(docId: string, pageNumber: number) {
  return `${docId}::${pageNumber}`;
}

type ChunksThunk = ThunkAction<void, RootState, unknown, UnknownAction>;

export function fetchChunksForPage(
  docId: string,
  pageNumber: number,
  options: { force?: boolean } = {},
): ChunksThunk {
  return (dispatch, getState) => {
    const cacheKey = key(docId, pageNumber);
    const existing = debounceTimers.get(cacheKey);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      debounceTimers.delete(cacheKey);

      const state = getState();
      const cached = state.pdfStudio.chunks[docId]?.[pageNumber];
      if (
        !options.force &&
        cached &&
        cached.status === "ready" &&
        Date.now() - cached.fetchedAt < FRESH_MS
      ) {
        return;
      }

      dispatch(chunksFetchStart({ docId, pageNumber }));
      try {
        const supabase = createClient();
        const { data, error: rpcError } = await ragDb(supabase).rpc(
          "fn_list_library_chunks",
          {
            p_id: docId,
            p_limit: 50,
            p_page_number: pageNumber,
          },
        );
        if (rpcError) {
          // The RPC raises "document not found" for a doc the caller can't
          // see (the previous HTTP endpoint's 404-equivalent) — treat that
          // the same way the old 404 branch did: an empty, non-error result.
          if (rpcError.message?.includes("document not found")) {
            dispatch(
              chunksFetchSuccess({ docId, pageNumber, rows: [], total: 0 }),
            );
            return;
          }
          throw new Error(rpcError.message);
        }
        const resp = data as unknown as ApiChunksResponse | null;
        dispatch(
          chunksFetchSuccess({
            docId,
            pageNumber,
            rows: Array.isArray(resp?.chunks) ? resp.chunks : [],
            total: typeof resp?.total === "number" ? resp.total : 0,
          }),
        );
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to load chunks";
        dispatch(chunksFetchError({ docId, pageNumber, error: message }));
      }
    }, DEBOUNCE_MS);
    debounceTimers.set(cacheKey, timer);
  };
}
