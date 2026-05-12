// features/administration/hooks/use-database-admin.ts
import { useState, useCallback, useRef } from "react";
import {
  getFunctions,
  getPermissions,
  executeSqlQuery,
} from "@/actions/admin/database";
import type { ActionResult } from "@/actions/admin/database";

// Type definitions
interface QueryHistoryItem {
  query: string;
  result: any;
  timestamp: Date;
  executionTime: number;
}

export const useDatabaseAdmin = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add cache for query results
  const [queryCache, setQueryCache] = useState<
    Record<string, QueryHistoryItem>
  >({});

  // Add query timeout handling
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isTimeout, setIsTimeout] = useState(false);

  // Clear any existing timeout when component unmounts
  const clearQueryTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const fetchFunctions = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getFunctions();
      if (result.error) {
        setError(result.error);
        return [];
      }
      return result.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      return [];
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissions = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getPermissions();
      if (result.error) {
        setError(result.error);
        return [];
      }
      return result.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      return [];
    } finally {
      setLoading(false);
    }
  };

  const executeQuery = async (
    query: string,
    useCache = true,
    timeoutMs = 30000,
  ) => {
    // Check cache first if enabled
    if (useCache && queryCache[query]) {
      return queryCache[query].result;
    }

    clearQueryTimeout();
    setIsTimeout(false);

    try {
      setLoading(true);
      setError(null);

      // Set up timeout for long-running queries
      const timeoutPromise = new Promise<ActionResult>((resolve) => {
        timeoutRef.current = setTimeout(() => {
          setIsTimeout(true);
          resolve({
            data: null,
            error: `Query execution timed out after ${timeoutMs / 1000} seconds`,
          });
        }, timeoutMs);
      });

      const startTime = performance.now();

      // Race between query execution and timeout
      const result = await Promise.race([
        executeSqlQuery(query),
        timeoutPromise,
      ]);

      clearQueryTimeout();

      if (result.error) {
        setError(result.error);
        return null;
      }

      const executionTime = performance.now() - startTime;

      // Cache the result
      const historyItem: QueryHistoryItem = {
        query,
        result: result.data,
        timestamp: new Date(),
        executionTime,
      };

      setQueryCache((prev) => ({
        ...prev,
        [query]: historyItem,
      }));

      return result.data;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const clearCache = () => {
    setQueryCache({});
  };

  const cancelQuery = () => {
    clearQueryTimeout();
    setLoading(false);
    setError("Query execution cancelled by user");
  };

  return {
    loading,
    error,
    isTimeout,
    fetchFunctions,
    fetchPermissions,
    executeQuery,
    clearCache,
    cancelQuery,
    queryCache,
  };
};
