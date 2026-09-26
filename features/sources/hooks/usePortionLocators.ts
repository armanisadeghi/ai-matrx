"use client";

/**
 * Every portion's kind + locator for one Source, read directly from Supabase
 * under RLS (`docproc.processed_document_pages`; `authenticated` holds SELECT
 * on `portion_kind`, `locator`, `speaker`). The viewer names each portion from
 * this — never "p.N" for something that is not a page.
 */

import { useEffect, useState } from "react";
import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import type { PortionLocatorRow } from "@/features/sources/portionLocator";

export function usePortionLocators(documentId: string | null): {
  byIndex: Map<number, PortionLocatorRow>;
  error: string | null;
} {
  const [byIndex, setByIndex] = useState<Map<number, PortionLocatorRow>>(
    new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!documentId) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await readAllRows<PortionLocatorRow>(
          ({ from, to }) =>
            supabase
              .schema("docproc")
              .from("processed_document_pages")
              .select("page_index,page_number,portion_kind,locator,speaker", {
                count: "exact",
              })
              .eq("processed_document_id", documentId)
              .order("page_index", { ascending: true })
              .range(from, to) as unknown as PromiseLike<{
              data: PortionLocatorRow[] | null;
              error: { message: string } | null;
              count?: number | null;
            }>,
          { label: "docproc.processed_document_pages (locators)" },
        );
        if (cancelled) return;
        setByIndex(new Map(rows.map((r) => [r.page_index, r])));
        setError(null);
      } catch {
        if (!cancelled)
          setError(
            "Where each part sits in the original could not be read, so parts are numbered instead.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);
  return { byIndex, error };
}
