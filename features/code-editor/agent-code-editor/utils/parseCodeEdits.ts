/**
 * Parse AI Code Edit Response
 *
 * Extracts SEARCH/REPLACE blocks from AI-generated responses
 * Format:
 * ```
 * SEARCH:
 * <<<
 * [code to find]
 * >>>
 *
 * REPLACE:
 * <<<
 * [replacement code]
 * >>>
 * ```
 *
 * Copied verbatim from features/code-editor/utils/parseCodeEdits.ts — this
 * utility is pure and has no dependency on the prompt or agent systems.
 */

export interface CodeEdit {
  search: string;
  replace: string;
  id: string;
}

export interface ParseResult {
  edits: CodeEdit[];
  explanation?: string;
  success: boolean;
  error?: string;
  rawResponse?: string;
  parseDetails?: {
    foundSearchBlocks: number;
    foundReplaceBlocks: number;
    skippedBlocks: string[];
    warnings: string[];
  };
}

/**
 * Parse the AI response to extract SEARCH/REPLACE blocks
 *
 * STRICT PARSING:
 * - Delimiters MUST be on their own line
 * - Opening and closing delimiters must match (<<<...>>> or <<...>> or <...>)
 * - Everything between matching delimiters is treated as code (no partial matches)
 */
export function parseCodeEdits(response: string): ParseResult {
  const warnings: string[] = [];
  const skippedBlocks: string[] = [];

  try {
    const edits: CodeEdit[] = [];
    const rawResponse = response;

    // Remove markdown code fences if present (but keep the content)
    const cleanedResponse = response.replace(/```[\s\S]*?```/g, (match) => {
      return match.replace(/```[a-z]*\n?/g, "").replace(/\n?```/g, "");
    });

    // Try each delimiter set separately to ensure proper pairing.
    // Priority: <<< ... >>> (most common), then << ... >>, then < ... >
    const blockPatterns = [
      /SEARCH:\s*\n\s*(<<<)\s*\n([\s\S]*?)\n\s*(>>>)\s*\n\s*REPLACE:\s*\n\s*(<<<)\s*\n([\s\S]*?)\n\s*(>>>)\s*/gi,
      /SEARCH:\s*\n\s*(<<)\s*\n([\s\S]*?)\n\s*(>>)\s*\n\s*REPLACE:\s*\n\s*(<<)\s*\n([\s\S]*?)\n\s*(>>)\s*/gi,
      /SEARCH:\s*\n\s*(<)\s*\n([\s\S]*?)\n\s*(>)\s*\n\s*REPLACE:\s*\n\s*(<)\s*\n([\s\S]*?)\n\s*(>)\s*/gi,
    ];

    const explanation = cleanedResponse.split(/SEARCH:/i)[0].trim();

    interface MatchResult {
      index: number;
      searchOpenDelim: string;
      searchContent: string;
      searchCloseDelim: string;
      replaceOpenDelim: string;
      replaceContent: string;
      replaceCloseDelim: string;
      fullMatch: string;
    }

    const allMatches: MatchResult[] = [];

    for (const blockPattern of blockPatterns) {
      let match;
      blockPattern.lastIndex = 0;

      while ((match = blockPattern.exec(cleanedResponse)) !== null) {
        allMatches.push({
          index: match.index,
          searchOpenDelim: match[1],
          searchContent: match[2].trim(),
          searchCloseDelim: match[3],
          replaceOpenDelim: match[4],
          replaceContent: match[5].trim(),
          replaceCloseDelim: match[6],
          fullMatch: match[0],
        });
      }
    }

    // Dedupe overlapping matches (keeps the first / most-specific hit)
    allMatches.sort((a, b) => a.index - b.index);

    const dedupedMatches: MatchResult[] = [];
    for (const match of allMatches) {
      const matchEnd = match.index + match.fullMatch.length;
      const overlaps = dedupedMatches.some((existing) => {
        const existingEnd = existing.index + existing.fullMatch.length;
        return (
          (match.index >= existing.index && match.index < existingEnd) ||
          (matchEnd > existing.index && matchEnd <= existingEnd) ||
          (match.index <= existing.index && matchEnd >= existingEnd)
        );
      });

      if (!overlaps) {
        dedupedMatches.push(match);
      }
    }

    let blockIndex = 0;
    for (const match of dedupedMatches) {
      blockIndex++;

      const searchDelimMatch =
        (match.searchOpenDelim === "<<<" && match.searchCloseDelim === ">>>") ||
        (match.searchOpenDelim === "<<" && match.searchCloseDelim === ">>") ||
        (match.searchOpenDelim === "<" && match.searchCloseDelim === ">");

      const replaceDelimMatch =
        (match.replaceOpenDelim === "<<<" &&
          match.replaceCloseDelim === ">>>") ||
        (match.replaceOpenDelim === "<<" && match.replaceCloseDelim === ">>") ||
        (match.replaceOpenDelim === "<" && match.replaceCloseDelim === ">");

      if (!searchDelimMatch) {
        warnings.push(
          `Block ${blockIndex}: SEARCH delimiters don't match (${match.searchOpenDelim} vs ${match.searchCloseDelim})`,
        );
        continue;
      }

      if (!replaceDelimMatch) {
        warnings.push(
          `Block ${blockIndex}: REPLACE delimiters don't match (${match.replaceOpenDelim} vs ${match.replaceCloseDelim})`,
        );
        continue;
      }

      if (!match.searchContent) {
        warnings.push(`Block ${blockIndex}: Empty SEARCH content`);
        skippedBlocks.push(`Empty SEARCH at position ${match.index}`);
        continue;
      }

      edits.push({
        id: `edit-${blockIndex}`,
        search: match.searchContent,
        replace: match.replaceContent,
      });
    }

    const parseDetails = {
      foundSearchBlocks: blockIndex,
      foundReplaceBlocks: blockIndex,
      skippedBlocks,
      warnings,
    };

    if (edits.length === 0) {
      const hasSearchKeyword = /SEARCH:/i.test(cleanedResponse);
      const hasReplaceKeyword = /REPLACE:/i.test(cleanedResponse);
      const hasDelimiters =
        /<{1,3}/.test(cleanedResponse) && />{1,3}/.test(cleanedResponse);

      let errorMsg = `No valid SEARCH/REPLACE blocks found.\n\n`;
      errorMsg += `Diagnostics:\n`;
      errorMsg += `- Contains "SEARCH:": ${hasSearchKeyword ? "✓" : "✗"}\n`;
      errorMsg += `- Contains "REPLACE:": ${hasReplaceKeyword ? "✓" : "✗"}\n`;
      errorMsg += `- Contains delimiters: ${hasDelimiters ? "✓" : "✗"}\n`;
      errorMsg += `- Parsed blocks: ${blockIndex}\n`;

      if (warnings.length > 0) {
        errorMsg += `\nWarnings:\n`;
        warnings.forEach((w, idx) => {
          errorMsg += `${idx + 1}. ${w}\n`;
        });
      }

      errorMsg += `\nRequired format (delimiters MUST be on their own lines):\n\n`;
      errorMsg += `SEARCH:\n<<<\n[exact code to find]\n>>>\n\n`;
      errorMsg += `REPLACE:\n<<<\n[replacement code]\n>>>\n`;

      return {
        success: false,
        edits: [],
        error: errorMsg,
        rawResponse,
        parseDetails,
      };
    }

    return {
      success: true,
      edits,
      explanation: explanation || undefined,
      rawResponse,
      parseDetails,
    };
  } catch (error) {
    return {
      success: false,
      edits: [],
      error: error instanceof Error ? error.message : "Unknown parsing error",
      rawResponse: response,
      parseDetails: {
        foundSearchBlocks: 0,
        foundReplaceBlocks: 0,
        skippedBlocks,
        warnings: [...warnings, `Exception during parsing: ${error}`],
      },
    };
  }
}

/**
 * Normalize code for fuzzy matching (whitespace-insensitive)
 */
function normalizeForMatching(code: string): string {
  return code
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * Find fuzzy matches (whitespace-insensitive)
 */
function findFuzzyMatches(code: string, searchPattern: string): number {
  const normalizedPattern = normalizeForMatching(searchPattern);
  const codeLines = code.split("\n");
  const searchLines = searchPattern.split("\n");
  let matchCount = 0;

  for (let i = 0; i <= codeLines.length - searchLines.length; i++) {
    const potentialMatch = codeLines
      .slice(i, i + searchLines.length)
      .join("\n");
    const normalizedMatch = normalizeForMatching(potentialMatch);

    if (normalizedMatch === normalizedPattern) {
      matchCount++;
    }
  }

  return matchCount;
}

/**
 * Validate that search blocks can be found in the source code
 */
export function validateEdits(
  code: string,
  edits: CodeEdit[],
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    const exactMatch = code.indexOf(edit.search);

    if (exactMatch !== -1) {
      const secondMatch = code.indexOf(edit.search, exactMatch + 1);
      if (secondMatch !== -1) {
        errors.push(
          `\n━━━ Edit ${i + 1} of ${edits.length} ━━━\n❌ Multiple exact matches found\n💡 Make search pattern more specific to uniquely identify the code block\n`,
        );
      }
      continue;
    }

    const fuzzyMatchCount = findFuzzyMatches(code, edit.search);

    if (fuzzyMatchCount === 1) {
      warnings.push(
        `Edit ${i + 1}: Will use fuzzy matching (whitespace differs but pattern is unique)`,
      );
      continue;
    }

    if (fuzzyMatchCount > 1) {
      errors.push(
        `\n━━━ Edit ${i + 1} of ${edits.length} ━━━\n❌ Found ${fuzzyMatchCount} similar patterns (ambiguous)\n💡 Make search pattern more specific to uniquely identify the code block\n`,
      );
      continue;
    }

    // No match at all — provide detailed debugging
    const searchLines = edit.search.split("\n");
    const firstLine = searchLines[0].trim();
    const lastLine = searchLines[searchLines.length - 1].trim();

    let errorMsg = `\n━━━ Edit ${i + 1} of ${edits.length} ━━━\n`;
    errorMsg += `❌ SEARCH pattern not found in code\n\n`; // access-errors: ok — in-memory string match against the local editor buffer; indexOf verified the pattern is absent
    errorMsg += `📝 Search Pattern (${searchLines.length} lines, ${edit.search.length} chars):\n`;
    errorMsg += `   First line: "${firstLine.substring(0, 60)}${firstLine.length > 60 ? "..." : ""}"\n`;
    if (searchLines.length > 1) {
      errorMsg += `   Last line:  "${lastLine.substring(0, 60)}${lastLine.length > 60 ? "..." : ""}"\n`;
    }
    errorMsg += `\n`;

    const firstLineMatches = code.includes(firstLine);
    const fuzzyMatch = findSimilarContent(code, firstLine);

    if (firstLineMatches) {
      errorMsg += `✓ First line DOES exist in the code\n`;
      errorMsg += `⚠️  But the full pattern doesn't match (even with fuzzy matching)\n`;
      errorMsg += `💡 Likely issue: Missing lines, or surrounding code differs significantly\n\n`;
      const firstLineIndex = code.indexOf(firstLine);
      const contextStart = Math.max(0, firstLineIndex - 100);
      const contextEnd = Math.min(
        code.length,
        firstLineIndex + firstLine.length + 100,
      );
      const context = code.substring(contextStart, contextEnd);
      errorMsg += `📍 First line found near:\n\`\`\`\n${context}\n\`\`\`\n`;
    } else if (fuzzyMatch) {
      errorMsg += `🔍 Similar content found: "${fuzzyMatch.substring(0, 80)}..."\n`;
      errorMsg += `💡 The AI's search pattern might not match the actual code exactly\n`;
    } else {
      errorMsg += `❌ First line not found anywhere in the code\n`; // access-errors: ok — code.includes verified the line is absent from the local editor buffer
      errorMsg += `💡 The AI might be editing code that doesn't exist in this file\n`;
    }

    errorMsg += `\n📋 Full SEARCH pattern:\n${"─".repeat(60)}\n`;
    errorMsg += edit.search;
    errorMsg += `\n${"─".repeat(60)}\n`;

    errors.push(errorMsg);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Find similar content in the code (fuzzy matching)
 */
function findSimilarContent(code: string, searchLine: string): string | null {
  const normalized = searchLine.replace(/\s+/g, " ").trim().toLowerCase();

  if (normalized.length < 10) return null;

  const searchPart = normalized.substring(0, 30);
  const codeLines = code.split("\n");

  for (const line of codeLines) {
    const normalizedLine = line.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalizedLine.includes(searchPart)) {
      return line.trim();
    }
  }

  return null;
}
