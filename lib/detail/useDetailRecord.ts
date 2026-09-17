// lib/detail/useDetailRecord.ts
//
// Loads ONE record through its registration's `load`, with an abort on every
// change and a structured state for every outcome. Nothing throws out of
// here and nothing is swallowed: an error carries its message to the screen.

"use client";

import { useEffect, useState } from "react";

import type { DetailLoadState, DetailRecordType, DetailRow } from "./types";

export function useDetailRecord(
  recordType: DetailRecordType | null,
  id: string | null,
): DetailLoadState<DetailRow> {
  const load = recordType?.load ?? null;
  const [state, setState] = useState<DetailLoadState<DetailRow>>(() =>
    load && id ? { status: "loading" } : { status: "none" },
  );
  const requestKey = `${recordType?.type ?? ""}|${id ?? ""}|${load ? "src" : "none"}`;
  const [seenKey, setSeenKey] = useState(requestKey);
  if (seenKey !== requestKey) {
    // Mask the previous record synchronously — an effect-only reset shows the
    // last record's fields under the next record's title for a frame.
    setSeenKey(requestKey);
    setState(load && id ? { status: "loading" } : { status: "none" });
  }

  useEffect(() => {
    if (!load || !id) return undefined;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await load(id, controller.signal);
        if (controller.signal.aborted) return;
        if ("notFound" in result) {
          setState({ status: "not-found" });
        } else {
          setState({ status: "ready", row: result.row });
        }
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        console.error("[detail] record load failed", { type: recordType?.type, id, error });
        setState({ status: "error", message });
      }
    })();
    return () => controller.abort();
  }, [load, id, recordType?.type]);

  return state;
}
