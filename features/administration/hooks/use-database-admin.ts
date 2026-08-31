// features/administration/hooks/use-database-admin.ts
import { useState } from "react";
import {
  getFunctions,
  getPermissions,
  executeSqlQuery,
} from "@/actions/admin/database";

// Type definitions
interface QueryHistoryItem {
  query: string;
  result: unknown;
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
  ) => {
    // Check cache first if enabled
    if (useCache && queryCache[query]) {
      return queryCache[query].result;
    }

    try {
      setLoading(true);
      setError(null);

      const startTime = performance.now();
      // The privileged Server Action owns the terminal result. Do not race it
      // with a client timer or expose a fake Cancel control: neither aborts the
      // PostgreSQL statement, and claiming otherwise can let an admin start a
      // second query while the first still executes.
      const result = await executeSqlQuery(query);

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

  return {
    loading,
    error,
    fetchFunctions,
    fetchPermissions,
    executeQuery,
    clearCache,
    queryCache,
  };
};
