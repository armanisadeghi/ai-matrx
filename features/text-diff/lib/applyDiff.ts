/**
 * Apply Diffs to Text
 * 
 * Takes parsed diffs and applies them to text content
 * Supports both search-replace and line-based diffs
 */

import { TextDiff, SearchReplaceDiff, LineRangeDiff } from './parseDiff';
import { matchText, MatchResult } from './matchText';

export interface ApplyDiffResult {
  success: boolean;
  newText?: string;
  error?: string;
  appliedDiffs?: number;
  failedDiffs?: Array<{ diffId: string; error: string }>;
}

/**
 * Apply a single search-replace diff
 */
function applySearchReplaceDiff(
  text: string,
  diff: SearchReplaceDiff
): { success: boolean; newText?: string; error?: string } {
  const matchResult = matchText(text, diff.search);
  
  if (!matchResult.found) {
    return {
      success: false,
      // access-errors: ok — in-memory diff pattern match against caller-provided text, not a record read
      error: matchResult.error || 'Pattern not found'
    };
  }
  
  const { startIndex, endIndex, matchedText } = matchResult;
  
  if (startIndex === undefined || endIndex === undefined) {
    return {
      success: false,
      error: 'Invalid match indices'
    };
  }
  
  // Replace the matched text
  const before = text.substring(0, startIndex);
  const after = text.substring(endIndex);
  const newText = before + diff.replace + after;
  
  return {
    success: true,
    newText
  };
}

/**
 * Apply a single line-range diff
 */
function applyLineRangeDiff(
  text: string,
  diff: LineRangeDiff
): { success: boolean; newText?: string; error?: string } {
  const lines = text.split('\n');
  const totalLines = lines.length;
  
  // Validate line range
  if (diff.startLine < 1) {
    return {
      success: false,
      error: `Start line must be >= 1 (got ${diff.startLine})`
    };
  }
  
  if (diff.endLine > totalLines) {
    return {
      success: false,
      error: `End line ${diff.endLine} exceeds total lines (${totalLines})`
    };
  }
  
  if (diff.startLine > diff.endLine) {
    return {
      success: false,
      error: `Start line ${diff.startLine} > end line ${diff.endLine}`
    };
  }
  
  // Replace lines (convert to 0-based indexing)
  const before = lines.slice(0, diff.startLine - 1);
  const after = lines.slice(diff.endLine);
  const replacement = diff.replace.split('\n');
  
  const newLines = [...before, ...replacement, ...after];
  const newText = newLines.join('\n');
  
  return {
    success: true,
    newText
  };
}

/**
 * Apply multiple diffs sequentially to text
 * 
 * Note: Diffs are applied one at a time, so later diffs operate on
 * text that's been modified by earlier diffs. Order matters!
 */
export function applyDiffs(
  text: string,
  diffs: TextDiff[]
): ApplyDiffResult {
  let currentText = text;
  const failedDiffs: Array<{ diffId: string; error: string }> = [];
  let appliedCount = 0;
  
  for (const diff of diffs) {
    let result: { success: boolean; newText?: string; error?: string };
    
    if (diff.type === 'search-replace') {
      result = applySearchReplaceDiff(currentText, diff);
    } else {
      result = applyLineRangeDiff(currentText, diff);
    }
    
    if (result.success && result.newText) {
      currentText = result.newText;
      appliedCount++;
    } else {
      failedDiffs.push({
        diffId: diff.id,
        error: result.error || 'Unknown error'
      });
    }
  }
  
  if (failedDiffs.length > 0) {
    return {
      success: false,
      error: `Failed to apply ${failedDiffs.length} diff(s)`,
      appliedDiffs: appliedCount,
      failedDiffs
    };
  }
  
  return {
    success: true,
    newText: currentText,
    appliedDiffs: appliedCount
  };
}

/**
 * Apply a single diff (convenience function)
 */
export function applySingleDiff(
  text: string,
  diff: TextDiff
): ApplyDiffResult {
  return applyDiffs(text, [diff]);
}

/**
 * Preview what a diff would do without applying it
 */
export function previewDiff(
  text: string,
  diff: TextDiff
): {
  success: boolean;
  before?: string;
  after?: string;
  error?: string;
  lineRange?: { start: number; end: number };
} {
  if (diff.type === 'search-replace') {
    const matchResult = matchText(text, diff.search);
    
    if (!matchResult.found) {
      return {
        success: false,
        error: matchResult.error
      };
    }
    
    return {
      success: true,
      before: matchResult.matchedText,
      after: diff.replace
    };
  } else {
    // Line-range diff
    const lines = text.split('\n');
    
    if (diff.startLine < 1 || diff.endLine > lines.length) {
      return {
        success: false,
        error: 'Line range out of bounds'
      };
    }
    
    const before = lines.slice(diff.startLine - 1, diff.endLine).join('\n');
    
    return {
      success: true,
      before,
      after: diff.replace,
      lineRange: { start: diff.startLine, end: diff.endLine }
    };
  }
}

