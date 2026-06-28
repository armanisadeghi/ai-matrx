// @ts-nocheck
// File: hooks/useDatabase.ts

import { useState, useCallback, useEffect } from "react";
import {
  databaseApi,
  QueryOptions,
  TableOrView,
} from "@/utils/supabase/api-wrapper";
import {
  FlexibleId,
  flexibleIdToString,
  isValidFlexibleId,
} from "@/types/FlexibleId";
import {
  getPrettyNameForTable,
  getNonFkFields,
  getForeignKeys,
  getInverseForeignKeys,
  getAllKeys,
  getAllFields,
  generateJsonTemplate,
} from "@/utils/schema/schemaUtils";
import { ensureId } from "@/utils/schema/lite";
import { TableName } from "@/types/junk/automationTableTypes";

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

interface useDatabaseResult<T> {
  data: T[] | null;
  loading: boolean;
  error: Error | null;
  paginationInfo: PaginationInfo | null;
  fetchOne: (
    name: TableOrView,
    matrxRecordId: string,
    options?: Omit<QueryOptions<TableOrView>, "limit" | "offset">,
  ) => Promise<void>;
  fetchAll: (
    name: TableOrView,
    options?: Omit<QueryOptions<TableOrView>, "limit" | "offset">,
  ) => Promise<void>;
  fetchFk: (
    name: TableOrView,
    matrxRecordId: string,
    foreignKeys: any,
  ) => Promise<void>;
  fetchIfk: (
    name: TableOrView,
    matrxRecordId: string,
    inverseForeignKeys: any,
  ) => Promise<void>;
  fetchM2m: (
    name: TableOrView,
    matrxRecordId: string,
    manyToMany: any,
  ) => Promise<void>;
  fetchPaginated: (
    name: TableOrView,
    options: QueryOptions<TableOrView>,
  ) => Promise<void>;
  create: (name: TableOrView, data: Partial<T>) => Promise<void>;
  update: (
    name: TableOrView,
    matrxRecordId: string,
    data: Partial<T>,
  ) => Promise<void>;
  delete: (name: TableOrView, matrxRecordId: string | number) => Promise<void>;
  executeCustomQuery: (
    name: TableOrView,
    query: (baseQuery: any) => any,
  ) => Promise<void>;
  subscribeToChanges: (name: TableOrView) => void;
  unsubscribeFromChanges: (name: TableOrView) => void;
}

function useDatabase<T extends { matrxRecordId: string } = any>(
  initialTable?: TableOrView,
): useDatabaseResult<T> & {
  getPrettyNameForTable: typeof getPrettyNameForTable;
  getNonFkFields: typeof getNonFkFields;
  getForeignKeys: typeof getForeignKeys;
  getInverseForeignKeys: typeof getInverseForeignKeys;
  getAllKeys: typeof getAllKeys;
  getAllFields: typeof getAllFields;
  generateJsonTemplate: typeof generateJsonTemplate;
  ensureId: typeof ensureId;
} {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [paginationInfo, setPaginationInfo] = useState<PaginationInfo | null>(
    null,
  );

  const fetchOne = useCallback(
    async (
      tableName: TableName,
      matrxRecordId: string,
      options?: Omit<QueryOptions<TableOrView>, "limit" | "offset">,
    ) => {
      setLoading(true);
      try {
        const result = await databaseApi.fetchOne(
          tableName,
          matrxRecordId,
          options,
        );
        setData([result] as T[]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("An unexpected error occurred"),
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const fetchAll = useCallback(
    async (
      tableName: TableName,
      options?: Omit<QueryOptions<TableOrView>, "limit" | "offset">,
    ) => {
      setLoading(true);
      try {
        const result = await databaseApi.fetchAll(tableName, options);
        setData(result as T[]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("An unexpected error occurred"),
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const fetchFk = useCallback(
    async (tableName: TableName, matrxRecordId: string, foreignKeys: any) => {
      setLoading(true);
      try {
        const result = await databaseApi.fetchFk(
          tableName,
          matrxRecordId,
          foreignKeys,
        );
        setData([result] as T[]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("An unexpected error occurred"),
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const fetchIfk = useCallback(
    async (
      tableName: TableName,
      matrxRecordId: string,
      inverseForeignKeys: any,
    ) => {
      setLoading(true);
      try {
        const result = await databaseApi.fetchIfk(
          tableName,
          matrxRecordId,
          inverseForeignKeys,
        );
        setData([result] as T[]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("An unexpected error occurred"),
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const fetchM2m = useCallback(
    async (tableName: TableName, matrxRecordId: string, manyToMany: any) => {
      setLoading(true);
      try {
        const result = await databaseApi.fetchM2m(
          tableName,
          matrxRecordId,
          manyToMany,
        );
        setData([result] as T[]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("An unexpected error occurred"),
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const fetchPaginated = useCallback(
    async (
      tableName: TableName,
      options: QueryOptions<TableOrView>,
      page: number = 1,
      pageSize: number = 10,
      maxCount: number = 10000,
    ) => {
      setLoading(true);

      try {
        // Call the updated fetchPaginated method from the database API
        const {
          page: currentPage,
          allNamesAndIds,
          pageSize: returnedPageSize,
          totalCount,
          paginatedData,
        } = await databaseApi.fetchPaginated(
          tableName,
          options,
          page,
          pageSize,
          maxCount,
        );

        // Set the returned data and pagination info in the state
        setData(paginatedData as T[]);
        setPaginationInfo({
          currentPage: currentPage,
          totalPages: Math.ceil(totalCount / returnedPageSize),
          totalCount: totalCount,
        });

        // Optionally, if you want to use `allNamesAndIds` somewhere else in the component, you can set it to a state:
        // setAllNamesAndIds(allNamesAndIds);
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("An unexpected error occurred"),
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const create = useCallback(
    async (tableName: TableName, payload: Partial<T>) => {
      setLoading(true);
      try {
        const result = await databaseApi.create(tableName, payload);
        setData((prevData) => (prevData ? [...prevData, result] : [result]));
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("An unexpected error occurred"),
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const update = useCallback(
    async (
      tableName: TableName,
      matrxRecordId: string,
      payload: Partial<T>,
    ) => {
      setLoading(true);
      try {
        const result = await databaseApi.update(
          tableName,
          matrxRecordId,
          payload,
        );
        setData(
          (prevData) =>
            prevData?.map((item) =>
              item.matrxRecordId === matrxRecordId ? result : item,
            ) as T[],
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("An unexpected error occurred"),
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const deleteRecord = useCallback(
    async (tableName: TableName, matrxRecordId: FlexibleId) => {
      if (!isValidFlexibleId(matrxRecordId)) {
        throw new Error("Invalid ID provided");
      }

      setLoading(true);
      try {
        const stringId = flexibleIdToString(matrxRecordId);
        await databaseApi.delete(tableName, stringId);
        setData(
          (prevData) =>
            prevData?.filter(
              (item) => item.matrxRecordId !== matrxRecordId,
            ) as T[],
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("An unexpected error occurred"),
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const executeCustomQuery = useCallback(
    async (tableName: TableName, queryFn: (baseQuery: any) => any) => {
      setLoading(true);
      try {
        const result = await databaseApi.executeCustomQuery(tableName, queryFn);
        setData(result as T[]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("An unexpected error occurred"),
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const subscribeToChanges = useCallback((tableName: TableName) => {
    databaseApi.subscribeToChanges(tableName, (newData) => {
      setData(newData as T[]);
    });
  }, []);

  const unsubscribeFromChanges = useCallback((tableName: TableName) => {
    databaseApi.unsubscribeFromChanges(tableName);
  }, []);

  useEffect(() => {
    if (initialTable) {
      fetchAll(initialTable);
      subscribeToChanges(initialTable);
    }
    return () => {
      if (initialTable) {
        unsubscribeFromChanges(initialTable);
      }
    };
  }, [initialTable, fetchAll, subscribeToChanges, unsubscribeFromChanges]);

  return {
    data,
    loading,
    error,
    paginationInfo,
    fetchOne,
    fetchAll,
    fetchFk,
    fetchIfk,
    fetchM2m,
    fetchPaginated,
    create,
    update,
    delete: deleteRecord,
    executeCustomQuery,
    subscribeToChanges,
    unsubscribeFromChanges,
    // Schema utilities
    getPrettyNameForTable,
    getNonFkFields,
    getForeignKeys,
    getInverseForeignKeys,
    getAllKeys,
    getAllFields,
    generateJsonTemplate,
    ensureId,
  };
}

export default useDatabase;
