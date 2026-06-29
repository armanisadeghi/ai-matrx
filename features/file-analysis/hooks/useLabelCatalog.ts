/**
 * features/file-analysis/hooks/useLabelCatalog.ts
 *
 * Module-cached fetch of the label catalog — it's small + static so we hold
 * the result at module scope and re-use it forever. Multiple consumers in
 * the studio resolve to ONE network call.
 */

"use client";

import { useEffect, useState } from "react";
import { extractErrorMessage } from "@/utils/errors";
import * as Api from "@/features/file-analysis/api/file-analysis";
import type {
  LabelCatalogEntry,
  LabelCatalogResponse,
} from "@/features/file-analysis/api/file-analysis";

let cached: LabelCatalogResponse | null = null;
let inflight: Promise<LabelCatalogResponse> | null = null;

async function fetchCatalog(): Promise<LabelCatalogResponse> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = Api.getLabelCatalog()
    .then(({ data }) => {
      cached = data;
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export interface UseLabelCatalogResult {
  catalog: LabelCatalogResponse | null;
  labels: LabelCatalogEntry[];
  byId: Map<string, LabelCatalogEntry>;
  byCategory: Map<string, LabelCatalogEntry[]>;
  categories: Record<string, string>;
  loading: boolean;
  error: string | null;
}

export function useLabelCatalog(): UseLabelCatalogResult {
  const [catalog, setCatalog] = useState<LabelCatalogResponse | null>(cached);
  const [loading, setLoading] = useState<boolean>(!cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached) return undefined;
    let cancelled = false;
    setLoading(true);
    fetchCatalog()
      .then((data) => {
        if (cancelled) return;
        setCatalog(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(extractErrorMessage(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const labels = catalog?.labels ?? [];
  const byId = new Map(labels.map((l) => [l.id, l]));
  const byCategory = new Map<string, LabelCatalogEntry[]>();
  for (const l of labels) {
    const list = byCategory.get(l.category) ?? [];
    list.push(l);
    byCategory.set(l.category, list);
  }

  return {
    catalog,
    labels,
    byId,
    byCategory,
    categories: catalog?.categories ?? {},
    loading,
    error,
  };
}
