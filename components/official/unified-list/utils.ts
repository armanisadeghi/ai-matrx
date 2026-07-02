/**
 * Unified List Layout System - Utility Functions
 * 
 * Helper functions for filtering, sorting, and managing list state.
 */

import { BaseListItem, HierarchicalListItem, FilterDefinition, SortOption, UnifiedListLayoutConfig } from './types';

// ============================================================================
// FILTERING UTILITIES
// ============================================================================

/**
 * Apply search filter to items
 */
export function applySearchFilter<T extends BaseListItem>(
  items: T[],
  searchTerm: string,
  filterFn: (item: T, searchTerm: string) => boolean
): T[] {
  if (!searchTerm.trim()) {
    return items;
  }
  
  const normalizedTerm = searchTerm.toLowerCase().trim();
  return items.filter(item => filterFn(item, normalizedTerm));
}

/**
 * Apply custom filters to items
 */
export function applyCustomFilters<T extends BaseListItem>(
  items: T[],
  filters: FilterDefinition<T>[],
  filterValues: Record<string, unknown>
): T[] {
  return items.filter(item => {
    return filters.every(filter => {
      const value = filterValues[filter.id];
      
      // Skip if no value or default value
      if (value === undefined || value === filter.defaultValue) {
        return true;
      }
      
      // Skip if filter type is 'select' and value is 'all'
      if (filter.type === 'select' && value === 'all') {
        return true;
      }
      
      // Skip if filter type is 'multiselect' or 'tags' and empty array
      if ((filter.type === 'multiselect' || filter.type === 'tags') && Array.isArray(value) && value.length === 0) {
        return true;
      }
      
      // Apply filter function
      return filter.filterFn(item, value);
    });
  });
}

/**
 * Apply sorting to items
 */
export function applySorting<T extends BaseListItem>(
  items: T[],
  sortOptions: SortOption<T>[],
  sortBy: string
): T[] {
  const sortOption = sortOptions.find(opt => opt.value === sortBy);
  
  if (!sortOption) {
    return items;
  }
  
  // Create a copy to avoid mutating original array
  return [...items].sort(sortOption.sortFn);
}

/**
 * Check if any filters are active
 */
export function hasActiveFilters<T extends BaseListItem>(
  filters: FilterDefinition<T>[],
  filterValues: Record<string, unknown>,
  sortBy: string,
  defaultSort: string = 'updated-desc'
): boolean {
  // Check if sort is non-default
  if (sortBy !== defaultSort) {
    return true;
  }
  
  // Check if any filter has a non-default value
  return filters.some(filter => {
    const value = filterValues[filter.id];
    
    if (value === undefined || value === filter.defaultValue) {
      return false;
    }
    
    if (filter.type === 'select' && value === 'all') {
      return false;
    }
    
    if ((filter.type === 'multiselect' || filter.type === 'tags') && Array.isArray(value) && value.length === 0) {
      return false;
    }
    
    return true;
  });
}

// ============================================================================
// HIERARCHY UTILITIES
// ============================================================================

/**
 * Filter items by current folder.
 *
 * Reads `parentId` off the item's open index signature (BaseListItem allows
 * arbitrary extra properties), so this works for both HierarchicalListItem
 * and any BaseListItem that happens to carry a parentId field.
 */
export function filterByFolder<T extends BaseListItem>(
  items: T[],
  currentFolderId: string | null
): T[] {
  const getParentId = (item: T): string | null | undefined => {
    const raw = item.parentId;
    return typeof raw === 'string' || raw === null || raw === undefined ? raw : undefined;
  };

  if (currentFolderId === null) {
    // Root level: items with no parent
    return items.filter(item => !getParentId(item));
  }

  // Items with matching parent
  return items.filter(item => getParentId(item) === currentFolderId);
}

/**
 * Build breadcrumb path for an item
 */
export function buildBreadcrumbPath<T extends HierarchicalListItem>(
  item: T,
  allItems: T[]
): Array<{ id: string; name: string }> {
  const path: Array<{ id: string; name: string }> = [];
  let current: T | undefined = item;
  
  while (current) {
    path.unshift({ id: current.id, name: current.name });

    const parentId = current.parentId;
    current = parentId ? allItems.find(i => i.id === parentId) : undefined;
  }
  
  return path;
}

/**
 * Get all descendants of a folder
 */
export function getDescendants<T extends HierarchicalListItem>(
  folderId: string,
  allItems: T[]
): T[] {
  const descendants: T[] = [];
  const queue: string[] = [folderId];
  
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined) break;
    const children = allItems.filter(item => item.parentId === currentId);
    
    descendants.push(...children);
    queue.push(...children.map(c => c.id));
  }
  
  return descendants;
}

/**
 * Build tree structure from flat array
 */
export function buildTree<T extends HierarchicalListItem>(
  items: T[],
  parentId: string | null = null
): T[] {
  const tree: T[] = [];
  
  items.forEach(item => {
    if (item.parentId === parentId) {
      const children = buildTree(items, item.id);
      tree.push({
        ...item,
        children: children.length > 0 ? children : undefined
      } as T);
    }
  });
  
  return tree;
}

// ============================================================================
// FILTER OPTION EXTRACTION
// ============================================================================

/**
 * Extract unique values for a property from items
 */
export function extractUniqueValues<T extends BaseListItem>(
  items: T[],
  property: keyof T
): string[] {
  const values = new Set<string>();
  
  items.forEach(item => {
    const value = item[property];
    if (value !== undefined && value !== null) {
      if (typeof value === 'string') {
        values.add(value);
      } else if (typeof value === 'number') {
        values.add(String(value));
      }
    }
  });
  
  return Array.from(values).sort();
}

/**
 * Extract unique tags from items
 */
export function extractUniqueTags<T extends BaseListItem>(
  items: T[],
  tagsProperty: keyof T = 'tags' as keyof T
): string[] {
  const tags = new Set<string>();
  
  items.forEach(item => {
    const itemTags = item[tagsProperty];
    
    if (!itemTags) return;
    
    try {
      // Handle string JSON
      const parsedTags: unknown = typeof itemTags === 'string'
        ? JSON.parse(itemTags)
        : itemTags;

      // Handle array
      if (Array.isArray(parsedTags)) {
        parsedTags.forEach(tag => tags.add(String(tag)));
      }
      // Handle object with tags property
      else if (parsedTags && typeof parsedTags === 'object' && 'tags' in parsedTags) {
        const nestedTags = (parsedTags as { tags: unknown }).tags;
        if (Array.isArray(nestedTags)) {
          nestedTags.forEach((tag: unknown) => tags.add(String(tag)));
        }
      }
    } catch (e) {
      // Ignore parsing errors
    }
  });
  
  return Array.from(tags).sort();
}

// ============================================================================
// STATE MANAGEMENT UTILITIES
// ============================================================================

/**
 * Initialize filter values with defaults
 */
export function initializeFilterValues<T extends BaseListItem>(
  filters: FilterDefinition<T>[]
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  
  filters.forEach(filter => {
    if (filter.defaultValue !== undefined) {
      values[filter.id] = filter.defaultValue;
    } else {
      // Set reasonable defaults based on type
      switch (filter.type) {
        case 'select':
          values[filter.id] = 'all';
          break;
        case 'multiselect':
        case 'tags':
          values[filter.id] = [];
          break;
        case 'toggle':
          values[filter.id] = false;
          break;
        default:
          values[filter.id] = null;
      }
    }
  });
  
  return values;
}

/**
 * Clear all filters to defaults
 */
export function clearFilters<T extends BaseListItem>(
  filters: FilterDefinition<T>[]
): Record<string, unknown> {
  return initializeFilterValues(filters);
}

// ============================================================================
// NAVIGATION UTILITIES
// ============================================================================

/**
 * Check if currently navigating
 */
export function isNavigating(navigatingId: string | null): boolean {
  return navigatingId !== null;
}

/**
 * Check if specific item is navigating
 */
export function isItemNavigating(itemId: string, navigatingId: string | null): boolean {
  return navigatingId === itemId;
}

/**
 * Prevent duplicate navigation
 */
export function canNavigate(currentNavigatingId: string | null): boolean {
  return currentNavigatingId === null;
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate configuration object
 */
export function validateConfig<T extends BaseListItem>(
  config: Partial<UnifiedListLayoutConfig<T>>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  if (!config.page) {
    errors.push('config.page is required');
  } else {
    if (!config.page.title) {
      errors.push('config.page.title is required');
    }
  }

  if (!config.search) {
    errors.push('config.search is required');
  } else {
    if (typeof config.search.enabled !== 'boolean') {
      errors.push('config.search.enabled must be a boolean');
    }
    if (!config.search.placeholder) {
      errors.push('config.search.placeholder is required');
    }
    if (!config.search.filterFn) {
      errors.push('config.search.filterFn is required');
    }
  }

  if (!config.actions || !Array.isArray(config.actions)) {
    errors.push('config.actions must be an array');
  }

  if (!config.layout) {
    errors.push('config.layout is required');
  } else {
    if (!config.layout.gridCols) {
      errors.push('config.layout.gridCols is required');
    }
    if (!config.layout.gap) {
      errors.push('config.layout.gap is required');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// PERFORMANCE UTILITIES
// ============================================================================

/**
 * Debounce function for search input
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/**
 * Throttle function for scroll events
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

