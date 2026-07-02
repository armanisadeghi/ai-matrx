"use client";

import { useState, useCallback, useEffect } from "react";
import {
  getSqlFunctions,
  searchSqlFunctions,
  createSqlFunction,
  updateSqlFunction,
  deleteSqlFunction,
} from "@/actions/admin/sql-functions";
import {
  SqlFunction,
  SqlFunctionFilter,
  SqlFunctionSort,
} from "@/types/sql-functions";

export interface UseSqlFunctionsProps {
  initialData?: SqlFunction[];
  defaultFilter?: SqlFunctionFilter;
  defaultSort?: SqlFunctionSort;
}

export function useSqlFunctions({
  initialData,
  defaultFilter,
  defaultSort = { field: "name", direction: "asc" },
}: UseSqlFunctionsProps = {}) {
  // State
  const [functions, setFunctions] = useState<SqlFunction[]>(initialData ?? []);
  const [filteredFunctions, setFilteredFunctions] =
    useState<SqlFunction[]>(functions);
  const [loading, setLoading] = useState<boolean>(!initialData);
  const [error, setError] = useState<Error | null>(null);
  // MATRX-EXCEPTION: React state initializer default for a genuinely optional
  // hook prop (no filters applied) — not a boundary write.
  const [filter, setFilter] = useState<SqlFunctionFilter>(defaultFilter ?? {});
  const [sort, setSort] = useState<SqlFunctionSort>(defaultSort);
  const [selectedFunction, setSelectedFunction] = useState<SqlFunction | null>(
    null,
  );
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Fetch functions
  const fetchFunctions = useCallback(
    async (force = false) => {
      if (initialData && !force) return;

      setLoading(true);
      setError(null);

      try {
        const data = await getSqlFunctions();
        setFunctions(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("An error occurred while fetching SQL functions"),
        );
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [initialData],
  );

  // Refresh functions
  const refreshFunctions = useCallback(() => {
    setIsRefreshing(true);
    fetchFunctions(true);
  }, [fetchFunctions]);

  // Search functions
  const searchFunctions = useCallback(
    async (searchFilter: SqlFunctionFilter) => {
      setLoading(true);
      setError(null);

      try {
        const data = await searchSqlFunctions(searchFilter);
        setFunctions(data);
        setFilter(searchFilter);
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("An error occurred while searching SQL functions"),
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Create function
  const createFunction = useCallback(
    async (functionDefinition: string) => {
      setLoading(true);
      setError(null);

      try {
        await createSqlFunction(functionDefinition);
        refreshFunctions();
        return true;
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("An error occurred while creating SQL function"),
        );
        return false;
      } finally {
        setLoading(false);
      }
    },
    [refreshFunctions],
  );

  // Update function
  const updateFunction = useCallback(
    async (functionDefinition: string) => {
      setLoading(true);
      setError(null);

      try {
        await updateSqlFunction(functionDefinition);
        refreshFunctions();
        return true;
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("An error occurred while updating SQL function"),
        );
        return false;
      } finally {
        setLoading(false);
      }
    },
    [refreshFunctions],
  );

  // Delete function
  const deleteFunction = useCallback(
    async (schema: string, name: string, argumentTypes: string) => {
      setLoading(true);
      setError(null);

      try {
        await deleteSqlFunction(schema, name, argumentTypes);
        refreshFunctions();
        return true;
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("An error occurred while deleting SQL function"),
        );
        return false;
      } finally {
        setLoading(false);
      }
    },
    [refreshFunctions],
  );

  // Filter and sort functions
  const applyFilterAndSort = useCallback(() => {
    let result = [...functions];

    // Apply filters
    if (filter.name) {
      const nameFilter = filter.name.toLowerCase();
      result = result.filter((func) =>
        func.name.toLowerCase().includes(nameFilter),
      );
    }

    if (filter.schema) {
      const schemaFilter = filter.schema.toLowerCase();
      result = result.filter((func) =>
        func.schema.toLowerCase().includes(schemaFilter),
      );
    }

    if (filter.returnType) {
      const returnTypeFilter = filter.returnType.toLowerCase();
      result = result.filter((func) =>
        func.returns.toLowerCase().includes(returnTypeFilter),
      );
    }

    if (filter.securityType) {
      result = result.filter(
        (func) => func.security_type === filter.securityType,
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      const fieldA = a[sort.field];
      const fieldB = b[sort.field];

      if (typeof fieldA === "string" && typeof fieldB === "string") {
        return sort.direction === "asc"
          ? fieldA.localeCompare(fieldB)
          : fieldB.localeCompare(fieldA);
      }

      return 0;
    });

    setFilteredFunctions(result);
  }, [functions, filter, sort]);

  // Select function — always store a fresh object so detail panel updates on every click
  const selectFunction = useCallback((func: SqlFunction | null) => {
    setSelectedFunction(func ? { ...func } : null);
  }, []);

  // Update filter
  const updateFilter = useCallback((newFilter: SqlFunctionFilter) => {
    setFilter((prev) => ({ ...prev, ...newFilter }));
  }, []);

  // Update sort
  const updateSort = useCallback((field: SqlFunctionSort["field"]) => {
    setSort((prev) => ({
      field,
      direction:
        prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!initialData) {
      fetchFunctions();
    }
  }, [fetchFunctions, initialData]);

  // Apply filter and sort when functions, filter, or sort change
  useEffect(() => {
    applyFilterAndSort();
  }, [functions, filter, sort, applyFilterAndSort]);

  return {
    functions: filteredFunctions,
    loading,
    error,
    isRefreshing,
    selectedFunction,
    filter,
    sort,
    refreshFunctions,
    searchFunctions,
    createFunction,
    updateFunction,
    deleteFunction,
    selectFunction,
    updateFilter,
    updateSort,
  };
}
