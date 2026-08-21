/**
 * Universal Diff Parser
 * 
 * Parses AI-generated diffs in multiple formats:
 * 1. Search/Replace blocks (for text and code)
 * 2. Line-based replacements
 * 3. Individual +/- line diffs
 * 
 * Format Examples:
 * 
 * SEARCH/REPLACE:
 * ```
 * SEARCH:
 * <<<
 * [exact text to find]
 * >>>
 * REPLACE:
 * <<<
 * [replacement text]
 * >>>
 * ```
 * 
 * LINE-BASED:
 * ```
 * LINES:
 * <<<
 * START: 5
 * END: 12
 * >>>
 * REPLACE:
 * <<<
 * new content
 * >>>
 * ```
 */

export interface SearchReplaceDiff {
  type: 'search-replace';
  id: string;
  search: string;
  replace: string;
}

export interface LineRangeDiff {
  type: 'line-range';
  id: string;
  startLine: number;
  endLine: number;
  replace: string;
}

export type TextDiff = SearchReplaceDiff | LineRangeDiff;

export interface ParseDiffResult {
  success: boolean;
  diffs: TextDiff[];
  explanation?: string;
  error?: string;
  rawResponse: string;
  parseDetails?: {
    foundBlocks: number;
    skippedBlocks: string[];
    warnings: string[];
  };
}

/**
 * Parse AI response to extract diff blocks
 */
export function parseDiff(response: string): ParseDiffResult {
  const warnings: string[] = [];
  const skippedBlocks: string[] = [];
  
  try {
    const diffs: TextDiff[] = [];
    const rawResponse = response;
    
    console.log('=== PARSING DIFF RESPONSE ===');
    console.log('Response length:', response.length);
    
    // Remove markdown code fences but keep content
    let cleanedResponse = response.replace(/```[\s\S]*?```/g, (match) => {
      return match.replace(/```[a-z]*\n?/g, '').replace(/\n?```/g, '');
    });

    // Extract explanation (text before first diff block)
    const explanation = cleanedResponse.split(/SEARCH:|LINES:/i)[0].trim();

    // Pattern for SEARCH/REPLACE blocks
    const searchReplacePattern = /SEARCH:\s*\n\s*(<<<|<<|<)\s*\n([\s\S]*?)\n\s*(>>>|>>|>)\s*\n\s*REPLACE:\s*\n\s*(<<<|<<|<)\s*\n([\s\S]*?)\n\s*(>>>|>>|>)\s*/gi;
    
    // Pattern for LINE-BASED blocks
    const lineRangePattern = /LINES:\s*\n\s*(<<<|<<|<)\s*\n\s*START:\s*(\d+)\s*\n\s*END:\s*(\d+)\s*\n\s*(>>>|>>|>)\s*\n\s*REPLACE:\s*\n\s*(<<<|<<|<)\s*\n([\s\S]*?)\n\s*(>>>|>>|>)\s*/gi;
    
    let blockIndex = 0;
    
    // Parse LINE-BASED blocks first
    let match;
    while ((match = lineRangePattern.exec(cleanedResponse)) !== null) {
      blockIndex++;
      
      const linesOpenDelim = match[1];
      const startLine = parseInt(match[2], 10);
      const endLine = parseInt(match[3], 10);
      const linesCloseDelim = match[4];
      const replaceOpenDelim = match[5];
      const replaceContent = match[6].trim();
      const replaceCloseDelim = match[7];
      
      console.log(`\n--- Parsed LINE-RANGE block ${blockIndex} ---`);
      console.log(`Lines: ${startLine} to ${endLine}`);
      console.log(`Replace content length: ${replaceContent.length}`);
      
      // Validate delimiters
      const linesDelimMatch = 
        (linesOpenDelim === '<<<' && linesCloseDelim === '>>>') ||
        (linesOpenDelim === '<<' && linesCloseDelim === '>>') ||
        (linesOpenDelim === '<' && linesCloseDelim === '>');
      
      const replaceDelimMatch = 
        (replaceOpenDelim === '<<<' && replaceCloseDelim === '>>>') ||
        (replaceOpenDelim === '<<' && replaceCloseDelim === '>>') ||
        (replaceOpenDelim === '<' && replaceCloseDelim === '>');
      
      if (!linesDelimMatch || !replaceDelimMatch) {
        warnings.push(`Block ${blockIndex}: Mismatched delimiters`);
        continue;
      }
      
      if (isNaN(startLine) || isNaN(endLine) || startLine < 1 || endLine < startLine) {
        warnings.push(`Block ${blockIndex}: Invalid line range (${startLine}-${endLine})`);
        continue;
      }
      
      diffs.push({
        type: 'line-range',
        id: `diff-${blockIndex}`,
        startLine,
        endLine,
        replace: replaceContent,
      });
    }
    
    // Reset regex for SEARCH/REPLACE blocks
    searchReplacePattern.lastIndex = 0;
    
    // Parse SEARCH/REPLACE blocks
    while ((match = searchReplacePattern.exec(cleanedResponse)) !== null) {
      blockIndex++;
      
      const searchOpenDelim = match[1];
      const searchContent = match[2].trim();
      const searchCloseDelim = match[3];
      const replaceOpenDelim = match[4];
      const replaceContent = match[5].trim();
      const replaceCloseDelim = match[6];
      
      console.log(`\n--- Parsed SEARCH/REPLACE block ${blockIndex} ---`);
      console.log(`Search content length: ${searchContent.length}`);
      console.log(`Replace content length: ${replaceContent.length}`);
      
      // Validate delimiters
      const searchDelimMatch = 
        (searchOpenDelim === '<<<' && searchCloseDelim === '>>>') ||
        (searchOpenDelim === '<<' && searchCloseDelim === '>>') ||
        (searchOpenDelim === '<' && searchCloseDelim === '>');
      
      const replaceDelimMatch = 
        (replaceOpenDelim === '<<<' && replaceCloseDelim === '>>>') ||
        (replaceOpenDelim === '<<' && replaceCloseDelim === '>>') ||
        (replaceOpenDelim === '<' && replaceCloseDelim === '>');
      
      if (!searchDelimMatch) {
        warnings.push(`Block ${blockIndex}: SEARCH delimiters don't match`);
        continue;
      }
      
      if (!replaceDelimMatch) {
        warnings.push(`Block ${blockIndex}: REPLACE delimiters don't match`);
        continue;
      }
      
      if (!searchContent) {
        warnings.push(`Block ${blockIndex}: Empty SEARCH content`);
        skippedBlocks.push(`Empty SEARCH at position ${match.index}`);
        continue;
      }
      
      diffs.push({
        type: 'search-replace',
        id: `diff-${blockIndex}`,
        search: searchContent,
        replace: replaceContent,
      });
    }
    
    console.log(`\n=== Parsing complete: Found ${diffs.length} diffs ===`);
    
    const parseDetails = {
      foundBlocks: blockIndex,
      skippedBlocks,
      warnings,
    };
    
    if (diffs.length === 0) {
      const hasSearchKeyword = /SEARCH:/i.test(cleanedResponse);
      const hasLinesKeyword = /LINES:/i.test(cleanedResponse);
      const hasReplaceKeyword = /REPLACE:/i.test(cleanedResponse);
      const hasDelimiters = /<{1,3}/.test(cleanedResponse) && />{1,3}/.test(cleanedResponse);
      
      let errorMsg = `No valid diff blocks found.\n\n`;
      errorMsg += `Diagnostics:\n`;
      errorMsg += `- Contains "SEARCH:": ${hasSearchKeyword ? '✓' : '❌'}\n`;
      errorMsg += `- Contains "LINES:": ${hasLinesKeyword ? '✓' : '❌'}\n`;
      errorMsg += `- Contains "REPLACE:": ${hasReplaceKeyword ? '✓' : '❌'}\n`;
      errorMsg += `- Contains delimiters: ${hasDelimiters ? '✓' : '❌'}\n`;
      errorMsg += `- Parsed blocks: ${blockIndex}\n`;
      
      if (warnings.length > 0) {
        errorMsg += `\nWarnings:\n`;
        warnings.forEach((w, idx) => {
          errorMsg += `${idx + 1}. ${w}\n`;
        });
      }
      
      return {
        success: false,
        diffs: [],
        error: errorMsg,
        rawResponse,
        parseDetails,
      };
    }
    
    return {
      success: true,
      diffs,
      explanation: explanation || undefined,
      rawResponse,
      parseDetails,
    };
    
  } catch (error) {
    console.error('Error parsing diff:', error);
    return {
      success: false,
      diffs: [],
      error: error instanceof Error ? error.message : 'Unknown parsing error',
      rawResponse: response,
      parseDetails: {
        foundBlocks: 0,
        skippedBlocks,
        warnings: [...warnings, `Exception: ${error}`],
      },
    };
  }
}

/**
 * Normalize text for fuzzy matching (whitespace-insensitive)
 */
function normalizeForMatching(text: string): string {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

/**
 * Find fuzzy matches (whitespace-insensitive)
 */
function findFuzzyMatches(text: string, searchPattern: string): number {
  const normalizedPattern = normalizeForMatching(searchPattern);
  const textLines = text.split('\n');
  const searchLines = searchPattern.split('\n');
  let matchCount = 0;
  
  for (let i = 0; i <= textLines.length - searchLines.length; i++) {
    const potentialMatch = textLines.slice(i, i + searchLines.length).join('\n');
    const normalizedMatch = normalizeForMatching(potentialMatch);
    
    if (normalizedMatch === normalizedPattern) {
      matchCount++;
    }
  }
  
  return matchCount;
}

/**
 * Validate that search-replace diffs can be found in the source text
 */
export function validateSearchReplaceDiffs(
  text: string,
  diffs: SearchReplaceDiff[]
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  for (let i = 0; i < diffs.length; i++) {
    const diff = diffs[i];
    const exactMatch = text.indexOf(diff.search);
    
    // Try exact match first
    if (exactMatch !== -1) {
      // Check for duplicates
      const secondMatch = text.indexOf(diff.search, exactMatch + 1);
      if (secondMatch !== -1) {
        errors.push(
          `Diff ${i + 1}: Multiple exact matches found. Make search pattern more specific.`
        );
      }
      continue;
    }
    
    // Try fuzzy match
    const fuzzyMatchCount = findFuzzyMatches(text, diff.search);
    
    if (fuzzyMatchCount === 1) {
      warnings.push(
        `Diff ${i + 1}: Using fuzzy matching (whitespace differs but pattern is unique)`
      );
      continue;
    }
    
    if (fuzzyMatchCount > 1) {
      errors.push(
        `Diff ${i + 1}: Found ${fuzzyMatchCount} similar patterns (ambiguous). Make search more specific.`
      );
      continue;
    }
    
    // No match found
    errors.push(
      // access-errors: ok — in-memory diff validation over caller-provided text, not a record read
      `Diff ${i + 1}: Search pattern not found in text (${diff.search.substring(0, 50)}...)`
    );
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate line-range diffs
 */
export function validateLineRangeDiffs(
  text: string,
  diffs: LineRangeDiff[]
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = text.split('\n');
  const totalLines = lines.length;
  
  for (let i = 0; i < diffs.length; i++) {
    const diff = diffs[i];
    
    if (diff.startLine < 1) {
      errors.push(`Diff ${i + 1}: Start line must be >= 1 (got ${diff.startLine})`);
      continue;
    }
    
    if (diff.endLine > totalLines) {
      errors.push(
        `Diff ${i + 1}: End line ${diff.endLine} exceeds total lines (${totalLines})`
      );
      continue;
    }
    
    if (diff.startLine > diff.endLine) {
      errors.push(
        `Diff ${i + 1}: Start line ${diff.startLine} > end line ${diff.endLine}`
      );
      continue;
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

