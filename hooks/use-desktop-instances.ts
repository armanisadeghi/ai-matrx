"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useBackendApi } from "@/hooks/useBackendApi";

export interface DesktopInstanceSummary {
  /** Stable matrx-local desktop id: public.app_instances.instance_id. */
  id: string;
  name: string;
  live: boolean;
  dev: boolean;
  last_seen: string | null;
  /** Row UUID: public.app_instances.id. */
  app_instance_id: string;
  platform: string | null;
}

interface UseDesktopInstancesResult {
  data: DesktopInstanceSummary[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDesktopInstances(): UseDesktopInstancesResult {
  const api = useBackendApi();
  const [data, setData] = useState<DesktopInstanceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const refetch = useCallback(async () => {
    const myId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get("/desktop-instances");
      const json = (await response.json()) as DesktopInstanceSummary[];
      if (myId !== fetchIdRef.current) return;
      setData(Array.isArray(json) ? json : []);
    } catch (err) {
      if (myId !== fetchIdRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (myId === fetchIdRef.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refetch();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [refetch]);

  return { data, loading, error, refetch };
}
