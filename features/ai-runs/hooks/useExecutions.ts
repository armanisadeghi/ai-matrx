"use client";

import { useState, useEffect, useCallback } from "react";
import { executionsService } from "../services/executions-service";
import type {
  ExecutionListFilters,
  ExecutionRecord,
  UseExecutionsReturn,
} from "../types/executionTypes";

/** Lists executions, refreshing every 10 seconds to pick up new and updated runs. */
export function useExecutions(
  filters: ExecutionListFilters = {},
): UseExecutionsReturn {
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);
  const { status, limit, offset, order_by, order_direction } = filters;

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await executionsService.list({
        ...(status !== undefined ? { status } : {}),
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
        ...(order_by !== undefined ? { order_by } : {}),
        ...(order_direction !== undefined ? { order_direction } : {}),
      });
      setExecutions(response.executions);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [status, limit, offset, order_by, order_direction]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  return { executions, isLoading, error, total, refresh: load };
}
