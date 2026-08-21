/**
 * Text Matching Logic
 * 
 * Implements strict -> fuzzy fallback matching strategy:
 * 1. First pass: Exact match (including whitespace)
 * 2. Second pass: Fuzzy match (whitespace-insensitive)
 * 
 * Returns match location or error if 0 or >1 matches found.
 */

export interface MatchResult {
  found: boolean;
  startIndex?: number;
  endIndex?: number;
  matchedText?: string;
  matchType?: 'exact' | 'fuzzy';
  error?: string;
}

/**
 * Normalize text for fuzzy matching
 */
function normalize(text: string): string {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .toLowerCase();
}

/**
 * Find all exact matches in text
 */
function findExactMatches(text: string, search: string): number[] {
  const matches: number[] = [];
  let index = 0;
  
  while ((index = text.indexOf(search, index)) !== -1) {
    matches.push(index);
    index += 1; // Move forward to find overlapping matches
  }
  
  return matches;
}

/**
 * Find all fuzzy matches (whitespace-insensitive)
 */
function findFuzzyMatches(text: string, search: string): Array<{ start: number; end: number; matched: string }> {
  const matches: Array<{ start: number; end: number; matched: string }> = [];
  const normalizedSearch = normalize(search);
  const searchLines = search.split('\n');
  const textLines = text.split('\n');
  
  // Sliding window through text lines
  for (let i = 0; i <= textLines.length - searchLines.length; i++) {
    const window = textLines.slice(i, i + searchLines.length);
    const windowText = window.join('\n');
    const normalizedWindow = normalize(windowText);
    
    if (normalizedWindow === normalizedSearch) {
      // Calculate character positions
      const start = textLines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
      const end = start + windowText.length;
      
      matches.push({
        start,
        end,
        matched: windowText
      });
    }
  }
  
  return matches;
}

/**
 * Find search pattern in text with strict -> fuzzy fallback
 */
export function matchText(text: string, search: string): MatchResult {
  if (!text || !search) {
    return {
      found: false,
      error: 'Text or search pattern is empty'
    };
  }
  
  // FIRST PASS: Exact match
  const exactMatches = findExactMatches(text, search);
  
  if (exactMatches.length === 1) {
    const startIndex = exactMatches[0];
    return {
      found: true,
      startIndex,
      endIndex: startIndex + search.length,
      matchedText: search,
      matchType: 'exact'
    };
  }
  
  if (exactMatches.length > 1) {
    return {
      found: false,
      error: `Found ${exactMatches.length} exact matches. Search pattern is ambiguous.`
    };
  }
  
  // SECOND PASS: Fuzzy match (whitespace-insensitive)
  const fuzzyMatches = findFuzzyMatches(text, search);
  
  if (fuzzyMatches.length === 1) {
    const match = fuzzyMatches[0];
    return {
      found: true,
      startIndex: match.start,
      endIndex: match.end,
      matchedText: match.matched,
      matchType: 'fuzzy'
    };
  }
  
  if (fuzzyMatches.length > 1) {
    return {
      found: false,
      error: `Found ${fuzzyMatches.length} fuzzy matches. Search pattern is ambiguous.`
    };
  }
  
  // NO MATCH FOUND
  return {
    found: false,
    // access-errors: ok — in-memory text search over caller-provided content, not a record read
    error: 'Search pattern not found in text'
  };
}

/**
 * Match multiple search patterns and return results
 */
export function matchMultiple(
  text: string,
  searches: string[]
): MatchResult[] {
  return searches.map(search => matchText(text, search));
}

/**
 * Check if all patterns can be matched
 */
export function canMatchAll(text: string, searches: string[]): boolean {
  return searches.every(search => matchText(text, search).found);
}

