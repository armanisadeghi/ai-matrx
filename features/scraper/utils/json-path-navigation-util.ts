/**
 * JSON Path Navigation Utilities
 * 
 * This module provides utilities for navigating complex JSON structures using path strings.
 */

type PathSegment =
  | { type: 'key'; value: string }
  | { type: 'index'; value: number };

/**
 * NOTE: `segments` is typed as `{ type: string; value: string }[]` here — a
 * looser shape than the internal `PathSegment` union (whose index variant
 * carries a numeric `value`) — to stay structurally compatible with the
 * separate local `PathBookmark` interface hand-declared in
 * `features/scraper/parts/BookmarkViewer.tsx`. Both bookmark types should be
 * unified onto this one; see decision brief in the wave-6 handoff.
 */
export interface PathBookmark {
  id: string;
  path: string;
  segments: Array<{ type: string; value: string }>;
  name: string;
  description: string;
  createdAt: number;
}

/**
 * Converts a path string into a structured path object
 * @param {string} pathString - Path string like 'data["key1"][0]["key2"]'
 * @returns {Array} - Array of path segments with type and value
 */
export const parsePathString = (pathString: string): PathSegment[] => {
  if (!pathString || typeof pathString !== 'string') {
    return [];
  }
  
  // Remove the initial 'data' part if it exists
  const cleanPath = pathString.startsWith('data') 
    ? pathString.substring(4) 
    : pathString;
  
  const pathSegments: PathSegment[] = [];
  const regex = /\["([^"]+)"\]|\[(\d+)\]/g;
  let match;
  
  while ((match = regex.exec(cleanPath)) !== null) {
    if (match[1] !== undefined) {
      // This is an object key
      pathSegments.push({ type: 'key', value: match[1] });
    } else if (match[2] !== undefined) {
      // This is an array index
      pathSegments.push({ type: 'index', value: parseInt(match[2]) });
    }
  }
  
  return pathSegments;
};

/**
 * Access data using a path string
 * @param {unknown} data - The data to navigate
 * @param {string} pathString - Path string like 'data["key1"][0]["key2"]'
 * @returns {unknown} - The value at the specified path or undefined if not found
 */
export const getValueByPath = (data: unknown, pathString: string): unknown => {
  if (!data) return undefined;

  const pathSegments = parsePathString(pathString);
  let current: unknown = data;

  try {
    for (const segment of pathSegments) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      const currentRecord = current as Record<string, unknown>;

      if (segment.type === 'key') {
        // Special handling for parsed_content which might be a string
        if (segment.value === 'parsed_content' && typeof currentRecord.parsed_content === 'string') {
          try {
            // Try to parse it as JSON
            current = JSON.parse(currentRecord.parsed_content);
          } catch (e) {
            // If parsing fails, just use it as is
            current = currentRecord.parsed_content;
          }
        } else {
          current = currentRecord[segment.value];
        }
      } else if (segment.type === 'index') {
        current = currentRecord[segment.value];
      }

      // Exit early if we hit undefined or null
      if (current === undefined || current === null) {
        return current;
      }
    }

    return current;
  } catch (error) {
    console.error(`Error navigating path: ${pathString}`, error);
    return undefined;
  }
};

/**
 * Creates a path bookmark that can be saved and used later
 * @param {string} pathString - Path string like 'data["key1"][0]["key2"]'
 * @param {string} name - Optional name for this bookmark
 * @param {string} description - Optional description
 * @returns {Object} - A bookmark object that can be saved and used later
 */
export const createPathBookmark = (pathString: string, name = '', description = ''): PathBookmark => {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    path: pathString,
    segments: parsePathString(pathString).map((segment) => ({
      type: segment.type,
      value: String(segment.value),
    })),
    name: name || pathString,
    description,
    createdAt: Date.now()
  };
};

/**
 * Gets a value from data using a bookmark. Only reads `path`, so accepts any
 * bookmark-shaped object with at least that field (matches both this
 * module's PathBookmark and the local bookmark type in BookmarkViewer.tsx).
 * @param {unknown} data - The data to navigate
 * @param {{ path: string } | null | undefined} bookmark - A bookmark with a path
 * @returns {unknown} - The value at the bookmarked path
 */
export const getValueByBookmark = (
  data: unknown,
  bookmark: { path: string } | null | undefined,
): unknown => {
  if (!bookmark || !bookmark.path) {
    return undefined;
  }

  return getValueByPath(data, bookmark.path);
};

/**
 * Save bookmarks to localStorage
 * @param {PathBookmark[]} bookmarks - Array of bookmark objects
 */
export const saveBookmarks = (bookmarks: PathBookmark[]): void => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem('json_path_bookmarks', JSON.stringify(bookmarks));
    } catch (error) {
      console.error('Failed to save bookmarks to localStorage', error);
    }
  }
};

/**
 * Load bookmarks from localStorage
 * @returns {PathBookmark[]} - Array of bookmark objects or empty array if none found
 */
export const loadBookmarks = (): PathBookmark[] => {
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

/**
 * Export bookmarks to a JSON string
 * @param {PathBookmark[]} bookmarks - Array of bookmark objects
 * @returns {string} - JSON string representation of bookmarks
 */
export const exportBookmarks = (bookmarks: PathBookmark[]): string => {
  try {
    return JSON.stringify(bookmarks, null, 2);
  } catch (error) {
    console.error('Failed to export bookmarks', error);
    return '[]';
  }
};

/**
 * Import bookmarks from a JSON string. The input is untrusted external data
 * (pasted by the user) — the shape is NOT runtime-validated against
 * PathBookmark, only asserted at the type level to match prior behavior.
 * @param {string} jsonString - JSON string of bookmarks
 * @returns {PathBookmark[]} - Array of parsed entries
 */
export const importBookmarks = (jsonString: string): PathBookmark[] => {
  try {
    const parsed: unknown = JSON.parse(jsonString);
    return Array.isArray(parsed) ? (parsed as PathBookmark[]) : [];
  } catch (error) {
    console.error('Failed to import bookmarks', error);
    return [];
  }
};