// features/education/classes/hooks/useMyClasses.ts
//
// Classes the caller JOINED or requested (edu_my_classes) — distinct from
// useClasses, which lists the classes the caller OWNS (scopes in their org). A
// joined class lives in the TEACHER's org, so the owner's org-scoped scope read
// never surfaces it; this SECURITY DEFINER RPC is the cross-org read. ClassesHome
// merges the two so a student sees everything they belong to.

"use client";

import { useCallback, useEffect, useState } from "react";
import { getMyClasses } from "../service";
import type { MyClass } from "../types";

export interface UseMyClassesReturn {
  /** Classes where the caller is a non-owner member/pending/entitled. */
  joined: MyClass[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMyClasses(): UseMyClassesReturn {
  const [rows, setRows] = useState<MyClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await getMyClasses());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your classes.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Only classes the caller does NOT own — owned classes come from useClasses.
  const joined = rows.filter((c) => c.myRole !== "owner");

  return { joined, loading, error, refresh };
}
