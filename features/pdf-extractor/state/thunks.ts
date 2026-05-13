import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import { getJson } from "@/features/files/api/client";
import {
  chunksFetchError,
  chunksFetchStart,
  chunksFetchSuccess,
} from "./pdfStudioSlice";
import type { ApiChunksResponse } from "./types";

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
        const params = new URLSearchParams();
        params.set("limit", "50");
        params.set("page_number", String(pageNumber));
        const { data } = await getJson<ApiChunksResponse>(
          `/rag/library/${docId}/chunks?${params.toString()}`,
        );
        dispatch(
          chunksFetchSuccess({
            docId,
            pageNumber,
            rows: Array.isArray(data?.chunks) ? data.chunks : [],
            total: typeof data?.total === "number" ? data.total : 0,
          }),
        );
      } catch (err: unknown) {
        const status =
          typeof err === "object" &&
          err !== null &&
          "status" in err &&
          typeof (err as { status?: unknown }).status === "number"
            ? (err as { status: number }).status
            : null;

        if (status === 404) {
          dispatch(
            chunksFetchSuccess({ docId, pageNumber, rows: [], total: 0 }),
          );
          return;
        }
        const message =
          err instanceof Error ? err.message : "Failed to load chunks";
        dispatch(chunksFetchError({ docId, pageNumber, error: message }));
      }
    }, DEBOUNCE_MS);
    debounceTimers.set(cacheKey, timer);
  };
}
