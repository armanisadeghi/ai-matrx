// hooks/useTools.ts

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toolsService, DatabaseTool } from '@/utils/supabase/tools-service';
import { mapIcon } from '@/utils/icons/icon-mapper';
import { formatText } from '@/utils/text/text-case-converter';

export interface Tool {
  id: string;           // The actual tool identifier used for tool calls (from database 'name' field)
  name: string;         // Same as id for backward compatibility
  displayName: string;  // Human-readable name for display (formatted from tool identifier)
  description: string;
  category: string;
  icon: React.ReactNode;
}

interface UseToolsOptions {
  autoFetch?: boolean;
  category?: string;
  searchQuery?: string;
}

interface UseToolsReturn {
  tools: Tool[];
  databaseTools: DatabaseTool[];
  isLoading: boolean;
  error: string | null;
  fetchTools: () => Promise<void>;
  searchTools: (query: string) => Promise<void>;
  fetchToolsByCategory: (category: string) => Promise<void>;
  fetchToolsByIds: (ids: string[]) => Promise<void>;
  refetch: () => Promise<void>;
  categories: string[];
}

/**
 * Custom hook for managing tools data from Supabase
 */
export function useTools(options: UseToolsOptions = {}): UseToolsReturn {
  const { autoFetch = true, category, searchQuery } = options;
  
  const [databaseTools, setDatabaseTools] = useState<DatabaseTool[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Convert database tools to UI tools with icons
  const tools: Tool[] = useMemo(() => {
    return databaseTools.map(dbTool => ({
      id: dbTool.name,                                    // Use database 'name' as the tool identifier
      name: dbTool.name,                                  // Same as id for backward compatibility
      displayName: formatText(dbTool.name),               // Pretty formatted name for display
      description: dbTool.description,
      category: dbTool.category || 'Other',
      icon: mapIcon(dbTool.icon, dbTool.category ?? undefined)
    }));
  }, [databaseTools]);

  // Extract unique categories
  const categories: string[] = useMemo(() => {
    const categorySet = new Set(tools.map(tool => tool.category));
    return Array.from(categorySet).sort();
  }, [tools]);

  // Generic fetch function
  const performFetch = useCallback(async (fetchFn: () => Promise<DatabaseTool[]>) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await fetchFn();
      setDatabaseTools(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch tools';
      setError(errorMessage);
      console.error('Tools fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch all tools
  const fetchTools = useCallback(async () => {
    await performFetch(() => toolsService.fetchTools());
  }, [performFetch]);

  // Search tools
  const searchTools = useCallback(async (query: string) => {
    await performFetch(() => toolsService.searchTools(query));
  }, [performFetch]);

  // Fetch tools by category
  const fetchToolsByCategory = useCallback(async (categoryName: string) => {
    await performFetch(() => toolsService.fetchToolsByCategory(categoryName));
  }, [performFetch]);

  // Fetch tools by IDs
  const fetchToolsByIds = useCallback(async (ids: string[]) => {
    await performFetch(() => toolsService.fetchToolsByIds(ids));
  }, [performFetch]);

  // Refetch current data
  const refetch = useCallback(async () => {
    if (searchQuery) {
      await searchTools(searchQuery);
    } else if (category) {
      await fetchToolsByCategory(category);
    } else {
      await fetchTools();
    }
  }, [searchQuery, category, searchTools, fetchToolsByCategory, fetchTools]);

  // Auto-fetch on mount and when options change
  useEffect(() => {
    if (autoFetch) {
      refetch();
    }
  }, [autoFetch, refetch]);

  return {
    tools,
    databaseTools,
    isLoading,
    error,
    fetchTools,
    searchTools,
    fetchToolsByCategory,
    fetchToolsByIds,
    refetch,
    categories
  };
}

/**
 * Hook specifically for getting tools by IDs (useful for selected tools)
 */
export function useToolsByIds(ids: string[], autoFetch: boolean = true) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchToolsByIds = useCallback(async (toolIds: string[]) => {
    if (toolIds.length === 0) {
      setTools([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const databaseTools = await toolsService.fetchToolsByIds(toolIds);
      const mappedTools = databaseTools.map(dbTool => ({
        id: dbTool.name,                                    // Use database 'name' as the tool identifier
        name: dbTool.name,                                  // Same as id for backward compatibility
        displayName: formatText(dbTool.name),               // Pretty formatted name for display
        description: dbTool.description,
        category: dbTool.category || 'Other',
        icon: mapIcon(dbTool.icon, dbTool.category ?? undefined)
      }));
      setTools(mappedTools);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch tools';
      setError(errorMessage);
      console.error('Tools by IDs fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchToolsByIds(ids);
    }
  }, [ids, autoFetch, fetchToolsByIds]);

  return {
    tools,
    isLoading,
    error,
    fetchToolsByIds,
    refetch: () => fetchToolsByIds(ids)
  };
}
