/**
 * Query History Storage Utility
 * Manages saving and retrieving SQL query history from localStorage
 */

export interface StoredQuery {
  id: string;
  query: string;
  timestamp: number;
  result?: unknown;
  executionTime?: number;
  tags?: string[];
  description?: string;
}

const STORAGE_KEY = 'sql-query-history';
const MAX_QUERIES = 100;

/**
 * Save a successful query to localStorage
 */
export const saveQuery = (query: string, result: unknown, executionTime?: number): StoredQuery => {
  try {
    const queryHistory = getQueryHistory();
    
    // Create new query entry
    const newQuery = {
      id: generateQueryId(),
      query,
      timestamp: Date.now(),
      result,
      executionTime,
    };
    
    // Add to history and limit size
    const updatedHistory = [newQuery, ...queryHistory].slice(0, MAX_QUERIES);
    
    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
    
    return newQuery;
  } catch (error) {
    console.error('Failed to save query to localStorage:', error);
    return {
      id: generateQueryId(),
      query,
      timestamp: Date.now(),
    };
  }
};

/**
 * Get all stored queries
 */
export const getQueryHistory = (): StoredQuery[] => {
  try {
    const storedData = localStorage.getItem(STORAGE_KEY);
    return storedData ? JSON.parse(storedData) : [];
  } catch (error) {
    console.error('Failed to retrieve query history:', error);
    return [];
  }
};

/**
 * Delete a specific query by ID
 */
export const deleteQuery = (queryId: string): boolean => {
  try {
    const queryHistory = getQueryHistory();
    const filteredHistory = queryHistory.filter(q => q.id !== queryId);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredHistory));
    return true;
  } catch (error) {
    console.error('Failed to delete query:', error);
    return false;
  }
};

/**
 * Clear all query history
 */
export const clearQueryHistory = (): boolean => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error('Failed to clear query history:', error);
    return false;
  }
};

/**
 * Update existing query (add tags, description)
 */
export const updateQuery = (queryId: string, updates: Partial<StoredQuery>): boolean => {
  try {
    const queryHistory = getQueryHistory();
    const updatedHistory = queryHistory.map(q => 
      q.id === queryId ? { ...q, ...updates } : q
    );
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
    return true;
  } catch (error) {
    console.error('Failed to update query:', error);
    return false;
  }
};

/**
 * Generate a unique ID for a query
 */
const generateQueryId = (): string => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

/**
 * Search queries by text
 */
export const searchQueries = (searchText: string): StoredQuery[] => {
  const queryHistory = getQueryHistory();
  if (!searchText.trim()) return queryHistory;
  
  const lowerSearch = searchText.toLowerCase();
  
  return queryHistory.filter(q => 
    q.query.toLowerCase().includes(lowerSearch) || 
    q.description?.toLowerCase().includes(lowerSearch) ||
    q.tags?.some(tag => tag.toLowerCase().includes(lowerSearch))
  );
}; 