"use client";

/**
 * useKindCatalog — one catalog snapshot for the Output Schema tab: the full
 * Shape registry (live content_ir merge, compiled floor on DB failure) plus
 * the resolver the export/converter needs. Loaded once per mount; the tab
 * shares it between the KindBindPicker and the matches-kind indicator.
 */

import { useEffect, useState } from "react";
import {
  catalogResolver,
  listAllKinds,
  listCompiledKinds,
  type KindCatalogEntry,
} from "@/features/content-ir/registry/kind-catalog";
import type { KindSchema } from "@/features/content-ir/core/kind-schema.types";

export interface KindCatalogState {
  entries: KindCatalogEntry[] | null;
  resolve: ((kind: string) => KindSchema | undefined) | null;
  loading: boolean;
}

export function useKindCatalog(): KindCatalogState {
  const [entries, setEntries] = useState<KindCatalogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await listAllKinds();
        if (!cancelled) setEntries(all);
      } catch (error) {
        // Loud recovery: the compiled floor keeps the picker usable, but a
        // DB-unreachable registry is a real defect — say so.
        console.error(
          "[OutputSchemaTab] kind catalog DB load failed — falling back to compiled kinds only:",
          error,
        );
        if (!cancelled) setEntries(listCompiledKinds());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    entries,
    resolve: entries ? catalogResolver(entries) : null,
    loading,
  };
}
