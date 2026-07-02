'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  getDatabaseEnums,
  searchEnums,
  createEnum,
  updateEnum,
  deleteEnum,
  getEnumUsage,
} from '@/actions/admin/enum-functions';
import { DatabaseEnum, EnumFilter, EnumSort, CreateEnumRequest, UpdateEnumRequest, EnumUsage } from '@/types/enum-types';

export interface UseEnumsProps {
  initialData?: DatabaseEnum[];
  defaultFilter?: EnumFilter;
  defaultSort?: EnumSort;
}

export function useEnums({
  initialData,
  defaultFilter,
  defaultSort = { field: 'name', direction: 'asc' },
}: UseEnumsProps = {}) {
  // State
  const [enums, setEnums] = useState<DatabaseEnum[]>(initialData ?? []);
  const [filteredEnums, setFilteredEnums] = useState<DatabaseEnum[]>(enums);
  const [loading, setLoading] = useState<boolean>(!initialData);
  const [error, setError] = useState<Error | null>(null);
  // MATRX-EXCEPTION: React state initializer default for a genuinely optional
  // hook prop (no filters applied) — not a boundary write.
  const [filter, setFilter] = useState<EnumFilter>(defaultFilter ?? {});
  const [sort, setSort] = useState<EnumSort>(defaultSort);
  const [selectedEnum, setSelectedEnum] = useState<DatabaseEnum | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Fetch enums
  const fetchEnums = useCallback(async (skipIfInitialData = true) => {
    if (initialData && skipIfInitialData) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await getDatabaseEnums();
      setEnums(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An error occurred while fetching enums'));
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [initialData]);

  // Refresh enums
  const refreshEnums = useCallback(async () => {
    setIsRefreshing(true);
    await fetchEnums(false); // Force fetch even if initialData exists
  }, [fetchEnums]);

  // Search enums
  const searchEnumsFiltered = useCallback(async (searchFilter: EnumFilter) => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await searchEnums(searchFilter);
      setEnums(data);
      setFilter(searchFilter);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An error occurred while searching enums'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Create enum
  const createEnumType = useCallback(async (request: CreateEnumRequest) => {
    setLoading(true);
    setError(null);
    
    try {
      const success = await createEnum(request);
      if (success) {
        // Fetch fresh data directly
        const data = await getDatabaseEnums();
        setEnums(data);
        setLoading(false);
        return success;
      } else {
        setLoading(false);
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An error occurred while creating enum'));
      setLoading(false);
      return false;
    }
  }, []);

  // Update enum
  const updateEnumType = useCallback(async (request: UpdateEnumRequest) => {
    setLoading(true);
    setError(null);
    
    try {
      const success = await updateEnum(request);
      if (success) {
        // Fetch fresh data directly
        const data = await getDatabaseEnums();
        setEnums(data);
        setLoading(false);
        return success;
      } else {
        setLoading(false);
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An error occurred while updating enum'));
      setLoading(false);
      return false;
    }
  }, []);

  // Delete enum
  const deleteEnumType = useCallback(async (schema: string, name: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const success = await deleteEnum(schema, name);
      if (success) {
        // Fetch fresh data directly
        const data = await getDatabaseEnums();
        setEnums(data);
        setLoading(false);
        return success;
      } else {
        setLoading(false);
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An error occurred while deleting enum'));
      setLoading(false);
      return false;
    }
  }, []);

  // Get enum usage
  const fetchEnumUsage = useCallback(async (schema: string, name: string): Promise<EnumUsage[]> => {
    try {
      return await getEnumUsage(schema, name);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An error occurred while fetching enum usage'));
      return [];
    }
  }, []);

  // Filter and sort enums
  const applyFilterAndSort = useCallback(() => {
    let result = [...enums];
    
    // Apply filters
    if (filter.name) {
      const nameFilter = filter.name.toLowerCase();
      result = result.filter(enumType =>
        enumType.name.toLowerCase().includes(nameFilter)
      );
    }

    if (filter.schema) {
      const schemaFilter = filter.schema.toLowerCase();
      result = result.filter(enumType =>
        enumType.schema.toLowerCase().includes(schemaFilter)
      );
    }

    if (filter.hasValue) {
      const hasValueFilter = filter.hasValue.toLowerCase();
      result = result.filter(enumType =>
        enumType.values.some(value =>
          value.toLowerCase().includes(hasValueFilter)
        )
      );
    }
    
    // Apply sorting
    result.sort((a, b) => {
      let fieldA: string | number;
      let fieldB: string | number;

      switch (sort.field) {
        case 'name':
          fieldA = a.name;
          fieldB = b.name;
          break;
        case 'schema':
          fieldA = a.schema;
          fieldB = b.schema;
          break;
        case 'values_count':
          fieldA = a.values.length;
          fieldB = b.values.length;
          break;
        case 'usage_count':
          fieldA = a.usage_count || 0;
          fieldB = b.usage_count || 0;
          break;
        default:
          fieldA = a.name;
          fieldB = b.name;
      }
      
      if (typeof fieldA === 'string' && typeof fieldB === 'string') {
        return sort.direction === 'asc' 
          ? fieldA.localeCompare(fieldB)
          : fieldB.localeCompare(fieldA);
      }
      
      if (typeof fieldA === 'number' && typeof fieldB === 'number') {
        return sort.direction === 'asc' 
          ? fieldA - fieldB
          : fieldB - fieldA;
      }
      
      return 0;
    });
    
    setFilteredEnums(result);
  }, [enums, filter, sort]);

  // Select enum
  const selectEnum = useCallback((enumType: DatabaseEnum | null) => {
    setSelectedEnum(enumType);
  }, []);

  // Update filter
  const updateFilter = useCallback((newFilter: EnumFilter) => {
    setFilter(prev => ({ ...prev, ...newFilter }));
  }, []);

  // Update sort
  const updateSort = useCallback((field: EnumSort['field']) => {
    setSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!initialData) {
      fetchEnums(false);
    }
  }, [fetchEnums, initialData]);

  // Apply filter and sort when enums, filter, or sort change
  useEffect(() => {
    applyFilterAndSort();
  }, [enums, filter, sort, applyFilterAndSort]);

  return {
    // Data
    enums: filteredEnums,
    loading,
    error,
    isRefreshing,
    selectedEnum,
    filter,
    sort,
    
    // Actions
    refreshEnums,
    searchEnums: searchEnumsFiltered,
    createEnum: createEnumType,
    updateEnum: updateEnumType,
    deleteEnum: deleteEnumType,
    getEnumUsage: fetchEnumUsage,
    selectEnum,
    updateFilter,
    updateSort,
  };
} 