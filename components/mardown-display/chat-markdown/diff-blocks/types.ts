/**
 * Streaming Diff Block Types
 * 
 * Defines types for different streaming diff styles and their states
 */

/**
 * Different styles of diffs we support
 */
export type DiffStyle = 
  | 'search-replace'  // SEARCH/REPLACE blocks with delimiters
  | 'unified'         // Standard unified diff format (+ and -)
  | 'git'            // Git-style diff
  | 'inline'         // Inline diff markers
  | 'unknown';       // Not yet identified or unsupported

/**
 * Streaming state for diff rendering
 */
export type StreamingDiffState = 
  | 'detecting'      // Still figuring out what style
  | 'buffering'      // Collecting content before showing
  | 'streaming'      // Actively showing content streaming
  | 'complete'       // Finished, show final diff view
  | 'fallback';      // Couldn't parse, show as code

/**
 * Parsed SEARCH/REPLACE block (streaming-aware — tracks per-block completion)
 */
export interface SearchReplaceBlock {
  search: string;
  replace: string;
  searchComplete: boolean;
  replaceComplete: boolean;
  isComplete: boolean;
}

/**
 * Parsed unified diff (line-based) block
 */
export interface UnifiedDiffBlock {
  lines: string[];
}

/**
 * Union of every shape a diff style handler's parse() can return.
 * Extend this when a new DiffStyleHandler is added.
 */
export type ParsedDiffBlock = SearchReplaceBlock | UnifiedDiffBlock;

/**
 * Result of diff style detection
 */
export interface DiffStyleDetection {
  style: DiffStyle;
  confidence: number; // 0-1
  metadata?: {
    hasSearchKeyword?: boolean;
    hasReplaceKeyword?: boolean;
    hasDelimiters?: boolean;
    hasDiffMarkers?: boolean;
  };
}

/**
 * Configuration for a diff style handler
 */
export interface DiffStyleHandler {
  name: string;
  detect: (content: string) => DiffStyleDetection;
  parse: (content: string) => ParsedDiffBlock; // Style-specific parsed result
  canShowPartial: boolean; // Whether we can show partial content
}

