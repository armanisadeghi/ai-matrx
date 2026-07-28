"use client";

// features/crm/hooks/usePartyDetail.ts
//
// Loads the full record bundle for one party (identity + contact points +
// addresses + employment both directions + interactions) and exposes a
// refresh the record page's mutation flows call after any write.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPartyDetail } from "../service";
import type { PartyDetail } from "../types";

export interface UsePartyDetailResult {
  detail: PartyDetail | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePartyDetail(partyId: string): UsePartyDetailResult {
  const [detail, setDetail] = useState<PartyDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++generationRef.current;
    try {
      const data = await fetchPartyDetail(partyId);
      if (generationRef.current !== gen) return;
      setDetail(data);
      setError(null);
    } catch (e) {
      if (generationRef.current !== gen) return;
      const message = e instanceof Error ? e.message : String(e);
      console.error("[crm] party detail fetch failed:", message);
      setError(message);
    } finally {
      if (generationRef.current === gen) setIsLoading(false);
    }
  }, [partyId]);

  useEffect(() => {
    // Deferred so the effect body never calls setState synchronously
    // (react-hooks/set-state-in-effect); the timer is the async boundary.
    const timer = setTimeout(() => {
      setIsLoading(true);
      setDetail(null);
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  return { detail, isLoading, error, refresh: load };
}
