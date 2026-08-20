"use client";

// features/crm/deals/useDealDetail.ts — the deal record page's loader,
// mirroring usePartyDetail: one batch, generation-guarded refresh.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDealDetail } from "./service";
import type { DealDetail } from "./types";

export interface UseDealDetailResult {
  detail: DealDetail | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useDealDetail(dealId: string): UseDealDetailResult {
  const [detail, setDetail] = useState<DealDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++generationRef.current;
    try {
      const next = await fetchDealDetail(dealId);
      if (generationRef.current !== gen) return;
      setDetail(next);
      setError(null);
    } catch (e) {
      if (generationRef.current !== gen) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (generationRef.current === gen) setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    setDetail(null);
    setIsLoading(true);
    setError(null);
    void load();
  }, [load]);

  return { detail, isLoading, error, refresh: load };
}
