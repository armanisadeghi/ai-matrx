import ObjectPathExtractor from './wildcard-utils';
import { JsonPathSegment, Bookmark, TypeInfo, PathArray, PathWithTypeInfo } from '../types';

// Parse path string into structured segments
export const parsePathString = (pathString: string): JsonPathSegment[] => {
  if (!pathString || typeof pathString !== 'string') return [];

  let cleanPath = pathString.startsWith('data') ? pathString.substring(4) : pathString;
  if (cleanPath.startsWith('.')) cleanPath = cleanPath.substring(1);

  const pathSegments: JsonPathSegment[] = [];
  let bracketRemaining = cleanPath;
  const bracketRegex = /\["([^"]+)"\]|\[(\d+)\]/g;
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = bracketRegex.exec(bracketRemaining)) !== null) {
    if (match.index > lastIndex) {
      const dotSegment = bracketRemaining.substring(lastIndex, match.index);
      dotSegment.split('.').forEach(part => {
        if (part.trim()) pathSegments.push({ type: 'key', value: part.trim() });
      });
    }

    if (match[1] !== undefined) {
      pathSegments.push({ type: 'key', value: match[1] });
    } else if (match[2] !== undefined) {
      pathSegments.push({ type: 'index', value: parseInt(match[2]) });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < bracketRemaining.length) {
    bracketRemaining.substring(lastIndex).split('.').forEach(part => {
      if (part.trim()) pathSegments.push({ type: 'key', value: part.trim() });
    });
  }

  if (pathSegments.length === 0 && cleanPath) {
    cleanPath.split('.').forEach(part => {
      if (part.trim()) pathSegments.push({ type: 'key', value: part.trim() });
    });
  }

  return pathSegments;
};

// Navigate data using path string
export const getValueByPath = (data: unknown, pathString: string): unknown => {
  if (!data) return undefined;
  
  // Check if path contains a wildcard
  if (pathString.includes('.*')) {
    return ObjectPathExtractor.extractValueByPath(data, pathString);
  }

  const pathSegments = parsePathString(pathString);
  let current: unknown = data;

  try {
    for (const segment of pathSegments) {
      if (current === undefined || current === null || typeof current !== 'object') {
        return undefined;
      }
      const currentRecord = current as Record<string, unknown>;

      if (segment.type === 'key') {
        if (segment.value === 'parsed_content' && typeof currentRecord.parsed_content === 'string') {
          try {
            current = JSON.parse(currentRecord.parsed_content);
          } catch {
            current = currentRecord.parsed_content;
          }
        } else {
          current = currentRecord[segment.value];
        }
      } else {
        current = currentRecord[segment.value];
      }

      if (current === undefined || current === null) return current;
    }

    return current;
  } catch (error) {
    console.error(`Error navigating path: ${pathString}`, error);
    return undefined;
  }
};

// Create a reusable path bookmark with type information
export const createPathBookmark = (
  pathString: string, 
  name: string, 
  description: string, 
  typeInfo?: PathWithTypeInfo,
  configKey: string = 'default',
  configName: string = 'Default'
): Bookmark => ({
  id: crypto.randomUUID?.() ?? `bookmark-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
  path: pathString,
  segments: parsePathString(pathString),
  name: name || pathString,
  description,
  createdAt: Date.now(),
  lastAccessed: Date.now(),
  // Include TypeInfo fields with defaults if not provided
  type: typeInfo?.type || 'Unknown',
  subtype: typeInfo?.subtype || null,
  depth: typeInfo?.depth || 0,
  isEmpty: typeInfo?.isEmpty || false,
  count: typeInfo?.count || 0,
  readibleType: typeInfo?.readibleType || 'Unknown',
  // Generate a temporary brokerId if needed - will be replaced with real IDs later
  brokerId: `broker-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
  // Include config information
  configKey,
  configName
});

// Retrieve value using a bookmark
export const getValueByBookmark = (data: unknown, bookmark: Bookmark): unknown => {
  if (!bookmark?.path) return undefined;
  return getValueByPath(data, bookmark.path);
};

// Save bookmarks to localStorage
export const saveBookmarks = (bookmarks: Bookmark[]): void => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem('json_path_bookmarks', JSON.stringify(bookmarks));
    } catch (error) {
      console.error('Failed to save bookmarks to localStorage', error);
    }
  }
};

// Load bookmarks from localStorage
export const loadBookmarks = (): Bookmark[] => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const storedBookmarks = window.localStorage.getItem('json_path_bookmarks');
      return storedBookmarks ? JSON.parse(storedBookmarks) : [];
    } catch (error) {
      console.error('Failed to load bookmarks from localStorage', error);
      return [];
    }
  }
  return [];
};

// Export bookmarks as JSON string
export const exportBookmarks = (bookmarks: Bookmark[]): string => {
  try {
    return JSON.stringify(bookmarks, null, 2);
  } catch (error) {
    console.error('Failed to export bookmarks', error);
    return '[]';
  }
};

// Import bookmarks from JSON string
export const importBookmarks = (jsonString: string): Bookmark[] => {
  try {
    const parsed = JSON.parse(jsonString);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to import bookmarks', error);
    return [];
  }
};

// Clean and optionally stringify JSON data
export const cleanJson = (data: unknown, indent: number, returnAsString: boolean): unknown => {
  const cleanRecursively = (input: unknown, visited: WeakSet<object> = new WeakSet()): unknown => {
    if (input === null || typeof input !== 'object') return input;
    if (visited.has(input)) return null;
    visited.add(input);

    if (Array.isArray(input)) {
      return input.map(item => cleanRecursively(item, visited));
    }

    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, cleanRecursively(value, visited)])
    );
  };

  const cleanedData = cleanRecursively(data);
  return returnAsString ? JSON.stringify(cleanedData, null, indent) : cleanedData;
};

// Format JSON data as string
export const formatJson = (data: unknown, indent?: number): string => cleanJson(data, indent ?? 2, true) as string;

// Get keys at specified path
export const getKeysAtPath = (data: unknown, path: string[]): string[] => {
  try {
    let currentData: unknown = data;

    for (const key of path) {
      if (key === 'All') continue;
      if (currentData === undefined || currentData === null || typeof currentData !== 'object') {
        currentData = undefined;
        continue;
      }
      const currentRecord = currentData as Record<string, unknown>;
      if (key === '*') {
        currentData = Array.isArray(currentData) ? currentData[0] : currentData;
      } else if (key.startsWith('Item ')) {
        currentData = currentRecord[String(parseInt(key.replace('Item ', '')))];
      } else if (key.startsWith('Object ')) {
        currentData = currentRecord[String(parseInt(key.replace('Object ', '')))];
      } else {
        currentData = currentRecord[key];
      }
    }

    if (currentData && typeof currentData === 'object') {
      if (Array.isArray(currentData)) {
        // Always include wildcard "*" option for arrays, regardless of length
        return ['All', '*', ...currentData.map((_, i) => `Item ${i}`)];
      }
      const keys = Object.keys(currentData);
      return keys.length > 0 ? ['All', ...keys] : ['All'];
    }

    return ['All'];
  } catch (error) {
    console.error('Error getting keys at path:', error);
    return ['All'];
  }
};

// Retrieve data at specified path
export const getDataAtPath = (data: unknown, path: string[]): unknown => {
  try {
    let currentData: unknown = data;

    for (const key of path) {
      if (key === 'All') continue;
      if (currentData === undefined || currentData === null || typeof currentData !== 'object') {
        currentData = undefined;
        continue;
      }
      const currentRecord = currentData as Record<string, unknown>;
      if (key === '*') {
        // For wildcards, use the first item (index 0) in the array
        currentData = Array.isArray(currentData) ? currentData[0] : currentData;
      } else if (key.startsWith('Item ')) {
        currentData = currentRecord[String(parseInt(key.replace('Item ', '')))];
      } else if (key.startsWith('Object ')) {
        currentData = currentRecord[String(parseInt(key.replace('Object ', '')))];
      } else {
        currentData = currentRecord[key];
      }
    }

    return currentData;
  } catch (error) {
    console.error('Error getting data at path:', error);
    return null;
  }
};

// Get navigation options for next level
export const getNextLevelOptions = (data: unknown): string[] => {
  if (!data || typeof data !== 'object') return ['All'];
  if (Array.isArray(data)) {
    return data.length === 0 ? ['All'] : ['All', ...data.map((_, i) => `Item ${i}`)];
  }
  const keys = Object.keys(data);
  return keys.length === 0 ? ['All'] : ['All', ...keys];
};

export const generateAccessPath = (currentPath: PathArray): string => {
  if (currentPath.length === 0) return 'data';

  let accessPath = 'data';
  for (const [, key] of currentPath) {
    if (key === 'All') continue;
    
    // Handle wildcard character directly
    if (key === '*') {
      accessPath += '.*';
      continue;
    }
    
    const keyStr = String(key);
    if (keyStr.startsWith('Item ') || keyStr.startsWith('Object ')) {
      accessPath += `[${parseInt(keyStr.replace(/^(Item|Object) /, ''))}]`;
    } else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(keyStr)) {
      accessPath += `.${keyStr}`;
    } else {
      accessPath += `["${keyStr}"]`;
    }
  }

  return accessPath;
};

// Determine data type at path
export const getPathAndTypeInfo = (data: unknown, currentPath: PathArray): PathWithTypeInfo => {
  try {
    const pathString = generateAccessPath(currentPath);
    
    // Check if the path contains a wildcard
    const hasWildcard = currentPath.some(([_, key]) => key === '*');
    
    // If we have a wildcard, handle it differently
    if (hasWildcard) {
      // Use the ObjectPathExtractor directly for wildcard paths
      const wildcardResults = ObjectPathExtractor.extractValueByPath(data, pathString, { preserveArrays: true });
      
      if (Array.isArray(wildcardResults)) {
        return { 
          path: pathString, 
          type: 'WildcardResults', 
          subtype: wildcardResults.length > 0 ? 
            (typeof wildcardResults[0] === 'object' ? 
              (Array.isArray(wildcardResults[0]) ? 'Arrays' : 'Objects') 
              : typeof wildcardResults[0] + 's') 
            : null,
          depth: 1, 
          isEmpty: wildcardResults.length === 0, 
          count: wildcardResults.length, 
          readibleType: `Wildcard matching ${wildcardResults.length} items` 
        };
      }
    }
    
    const value = getValueByPath(data, pathString);

    if (value === null) {
      return { path: pathString, type: 'Null', subtype: null, depth: 0, isEmpty: true, count: 0, readibleType: 'Null' };
    }
    if (value === undefined) {
      return { path: pathString, type: 'Undefined', subtype: null, depth: 0, isEmpty: true, count: 0, readibleType: 'Undefined' };
    }

    const calculateDepth = (val: unknown, visited: WeakSet<object> = new WeakSet()): number => {
      if (!val || typeof val !== 'object' || visited.has(val)) return 0;
      visited.add(val);
      if (Array.isArray(val)) {
        if (val.length === 0) return 1;
        return 1 + Math.max(...val.map(item => calculateDepth(item, visited)), 0);
      }
      const valRecord = val as Record<string, unknown>;
      const keys = Object.keys(valRecord);
      if (keys.length === 0) return 1;
      return 1 + Math.max(...keys.map(key => calculateDepth(valRecord[key], visited)), 0);
    };

    const depth = calculateDepth(value);

    if (Array.isArray(value)) {
      const isEmpty = value.length === 0;
      const count = value.length;
      const subtype = isEmpty ? null : (typeof value[0] === 'object' ? (Array.isArray(value[0]) ? 'Arrays' : 'Objects') : typeof value[0] + 's');
      const readibleType = isEmpty ? `Empty Array (depth ${depth}, count ${count})` : `Array of ${subtype} (depth ${depth}, count ${count})`;
      return { path: pathString, type: 'Array', subtype, depth, isEmpty, count, readibleType };
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value);
      const isEmpty = keys.length === 0;
      const count = keys.length;
      const readibleType = `Object (depth ${depth}, count ${count})`;
      return { path: pathString, type: 'Object', subtype: null, depth, isEmpty, count, readibleType };
    }

    // Handle primitives (string, number, boolean, etc.)
    const readibleType = typeof value;
    return { path: pathString, type: typeof value, subtype: null, depth: 0, isEmpty: false, count: 1, readibleType };
  } catch (error) {
    console.error(`Error determining data type for path: ${generateAccessPath(currentPath)}`, error);
    return { path: 'unknown', type: 'Unknown', subtype: null, depth: 0, isEmpty: true, count: 0, readibleType: 'Unknown' };
  }
};

// Add to your json-path-navigation-util.ts
export const convertUiPathToExtractorPath = (pathArray: PathArray): string => {
  let accessPath = 'data';
  
  for (const [, key] of pathArray) {
    if (key === 'All') continue;
    if (key === '*') {
      accessPath += '.*'; // Using the wildcard character
      continue;
    }
    
    const keyStr = String(key);
    if (keyStr.startsWith('Item ')) {
      accessPath += `[${parseInt(keyStr.replace('Item ', ''))}]`;
    } else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(keyStr)) {
      accessPath += `.${keyStr}`;
    } else {
      accessPath += `["${keyStr}"]`;
    }
  }
  
  return accessPath;
}

export const getWildcardData = (data: unknown, wildcardPath: string, options = {}) => {
  return ObjectPathExtractor.extractValueByPath(data, wildcardPath, options);
};

// Convert a path with wildcards to a concrete path using a specific index (usually 0)
// This is used to access concrete data for navigation when displaying UI elements
export const convertWildcardPathToConcreteIndexPath = (path: string, indexToUse: number = 0): string => {
  // Replace all wildcards (.*) with array indexing ([indexToUse])
  return path.replace(/\.\*/g, `[${indexToUse}]`);
};

