/**
 * Content Splitter V2 - PRODUCTION Parser
 *
 * A streamlined, registry-based markdown parser optimized for streaming content.
 * This is the current production parser used by MarkdownStream.
 *
 * Key improvements over V1:
 * - Registry-based architecture for block types (easy to extend)
 * - Clear separation: detection → extraction → validation
 * - Organized by content type (JSON, XML, Markdown)
 * - 38% code reduction (1253 → 781 lines)
 * - Maintains all streaming logic and caching from V1
 *
 * Parsing order (deterministic):
 * 1. MATRX patterns
 * 2. Code blocks (with JSON special types)
 * 3. XML tag blocks
 * 4. Images
 * 5. Videos
 * 6. Tables
 * 7. Text (fallback)
 *
 * Legacy V1 parser available in content-splitter.ts for rollback if needed.
 */

import { getMetadataFromText } from "@/features/rich-text-editor/utils/patternUtils";
import type { TypedRenderBlock } from "@/types/python-generated/stream-events";
import type { MissingBlockType } from "@/types/python-generated/missing-types";

/**
 * All block type strings this splitter can emit — the union of:
 *   - TypedRenderBlock["type"]  : types defined in Python's auto-generated stream-events.ts
 *   - MissingBlockType          : client-only types (tree, accent-divider, heavy-divider)
 *                                 and server-only types not yet in stream-events.ts
 */
type SplitterBlockType = TypedRenderBlock["type"] | MissingBlockType;

/**
 * SplitterBlock — the output type of splitContentIntoBlocksV2.
 *
 * Structurally aligned with TypedRenderBlock so that the same type
 * discriminant works across the splitter, Redux, server events, and renderer.
 * Omits blockId/blockIndex/status/data (server/Redux concerns) and adds
 * language/src/alt which are needed by BlockRenderer for code/image/video blocks.
 *
 * The bridge field `serverData` is NOT defined here — BlockRenderer adds it
 * via its local `BlockWithServerData` extension when merging server-processed blocks.
 */
export interface SplitterBlock {
  type: SplitterBlockType;
  content: string;
  language?: string;
  src?: string;
  alt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * @deprecated Use SplitterBlock instead.
 * Kept as an alias so existing imports continue to compile during migration.
 */
export type ContentBlock = SplitterBlock;

const MATRX_PATTERN = /<<<MATRX_START>>>(.*?)<<<MATRX_END>>>/gs;

/**
 * Code-fence languages that promote to a first-class block type (the fence
 * language becomes the block type). Mirrors SPECIAL_CODE_LANGUAGES in
 * aidream block_detector.py — keep the two in lockstep.
 */
export const SPECIAL_CODE_LANGUAGES = [
  "transcript",
  "tasks",
  "structured_info",
  "questionnaire",
  "flashcards",
  "cooking_recipe",
  "mermaid",
  "svg",
];

/**
 * Fence-language aliases that normalize to a canonical special language
 * (e.g. ```mmd → mermaid). Mirrors CODE_LANGUAGE_ALIASES in block_detector.py.
 */
export const CODE_LANGUAGE_ALIASES: Record<string, string> = { mmd: "mermaid" };

export function normalizeCodeLanguage(
  language: string | undefined,
): string | undefined {
  if (!language) return language;
  const lower = language.toLowerCase();
  return CODE_LANGUAGE_ALIASES[lower] ?? lower;
}

interface ExtractionResult {
  content: string;
  nextIndex: number;
  metadata?: any;
}

interface StreamingState {
  isComplete: boolean;
  shouldShow: boolean;
  metadata?: any;
}

interface ParsingContext {
  line: string;
  trimmedLine: string;
  lineIndex: number;
  isInCodeBlock: boolean;
  previousBlockType?: string;
}

// ============================================================================
// JSON BLOCK DETECTORS
// ============================================================================

const JSON_BLOCK_PATTERNS = {
  quiz: {
    rootKey: "quiz_title",
    validate: (parsed: any) =>
      parsed?.quiz_title &&
      Array.isArray(parsed.multiple_choice) &&
      parsed.multiple_choice.length > 0,
  },
  presentation: {
    rootKey: "presentation",
    validate: (parsed: any) =>
      parsed?.presentation?.slides && Array.isArray(parsed.presentation.slides),
  },
  decision_tree: {
    rootKey: "decision_tree",
    validate: (parsed: any) =>
      parsed?.decision_tree?.title && parsed.decision_tree.root,
  },
  comparison_table: {
    rootKey: "comparison",
    validate: (parsed: any) =>
      parsed?.comparison?.title &&
      Array.isArray(parsed.comparison.items) &&
      Array.isArray(parsed.comparison.criteria),
  },
  diagram: {
    rootKey: "diagram",
    validate: (parsed: any) =>
      parsed?.diagram?.title && Array.isArray(parsed.diagram.nodes),
  },
  math_problem: {
    rootKey: "math_problem",
    validate: (parsed: any) =>
      parsed?.math_problem && typeof parsed.math_problem === "object",
  },
} as const;

/** Extracts the first key from a JSON object string without full parsing. */
function extractFirstJsonKey(content: string): string | null {
  const match = content.trimStart().match(/^\{\s*"([^"]+)"/);
  return match ? match[1] : null;
}

export function detectJsonBlockType(
  content: string,
): keyof typeof JSON_BLOCK_PATTERNS | null {
  const firstKey = extractFirstJsonKey(content);
  if (!firstKey) return null;

  for (const [type, pattern] of Object.entries(JSON_BLOCK_PATTERNS)) {
    if (pattern.rootKey === firstKey) {
      return type as keyof typeof JSON_BLOCK_PATTERNS;
    }
  }

  return null;
}

/**
 * Detects placeholder/template text that indicates the AI output a schema
 * description instead of real JSON data (e.g. "[array of solution objects]").
 * Applied to all JSON block types before any parse attempt.
 */
function containsPlaceholderText(content: string): boolean {
  return (
    /\[\s*(array|object|string|number|boolean|description|example|etc|list|item)[^\]]*\]/i.test(
      content,
    ) ||
    /:\s*"?\[?(array|list) of /i.test(content) ||
    /:\s*"?object with /i.test(content) ||
    /:\s*"?<[a-z_]+>/i.test(content) ||
    /:\s*"?\.\.\."?/.test(content)
  );
}

function validateJsonBlock(
  content: string,
  type: keyof typeof JSON_BLOCK_PATTERNS,
): StreamingState {
  // Aggressively clean content - remove trailing backticks, whitespace, etc.
  let trimmed = content.trim();

  // Remove any trailing backticks that might have been included
  trimmed = trimmed.replace(/```+\s*$/, "").trim();

  // Reject placeholder/template text for all block types — still streaming or malformed
  if (containsPlaceholderText(trimmed)) {
    return { isComplete: false, shouldShow: false };
  }

  // First, try to parse the JSON directly - if it parses and validates, it's complete
  try {
    const parsed = JSON.parse(trimmed);
    const pattern = JSON_BLOCK_PATTERNS[type];
    const isValid = pattern.validate(parsed);

    if (isValid) {
      return {
        isComplete: true,
        shouldShow: true,
        metadata: { isComplete: true },
      };
    }

    // Parsed fine but failed validation — show as code fallback, don't loop
    return {
      isComplete: true,
      shouldShow: false,
      metadata: { isComplete: true },
    };
  } catch (error) {
    // JSON parse failed, continue with brace analysis
  }

  // Count braces to determine completion
  const openBraces = (trimmed.match(/\{/g) || []).length;
  const closeBraces = (trimmed.match(/\}/g) || []).length;

  // Still streaming
  if (openBraces > closeBraces) {
    return { isComplete: false, shouldShow: false };
  }

  // Balanced braces and ends with } — JSON parse already failed above, so this is malformed
  if (trimmed.endsWith("}") && openBraces === closeBraces) {
    return {
      isComplete: true,
      shouldShow: false,
      metadata: { isComplete: true },
    };
  }

  // More closing than opening — malformed, stop waiting
  if (closeBraces > openBraces) {
    return {
      isComplete: true,
      shouldShow: false,
      metadata: { isComplete: true },
    };
  }

  // Not complete
  return { isComplete: false, shouldShow: false };
}

// ============================================================================
// STREAMING STATE CACHES
// ============================================================================

const questionnaireCache = new Map<
  string,
  { content: string; hash: string; metadata: any }
>();
const flashcardCache = new Map<
  string,
  { content: string; hash: string; metadata: any }
>();
const recipeCache = new Map<
  string,
  { content: string; hash: string; metadata: any }
>();
const tableCache = new Map<
  string,
  { content: string; hash: string; metadata: any }
>();

// ============================================================================
// XML TAG BLOCK DETECTORS
// ============================================================================

const XML_TAG_BLOCKS = {
  thinking: ["<thinking>", "<think>"],
  reasoning: ["<reasoning>"],
  info: ["<info>"],
  task: ["<task>"],
  database: ["<database>"],
  private: ["<private>"],
  plan: ["<plan>"],
  event: ["<event>"],
  tool: ["<tool>"],
  questionnaire: ["<questionnaire>"],
  flashcards: ["<flashcards>"],
  cooking_recipe: ["<cooking_recipe>"],
  timeline: ["<timeline>"],
  progress_tracker: ["<progress_tracker>"],
  troubleshooting: ["<troubleshooting>"],
  resources: ["<resources>"],
  research: ["<research>"],
} as const;

// ============================================================================
// ATTRIBUTE-BEARING XML BLOCKS (tags with key="value" attributes)
// ============================================================================

const ATTRIBUTE_XML_BLOCKS = [
  "decision",
  "artifact",
  // Editor pills — round-trip representation of code-editor errors and
  // selected code snippets. Attributes carry file/line/severity/language; the
  // body carries <message>+<surrounding_code> for errors, raw code for snippets.
  "editor_error",
  "editor_code_snippet",
] as const;
type AttributeXmlBlockType = (typeof ATTRIBUTE_XML_BLOCKS)[number];

/** Extracts key="value" pairs from an XML opening tag string. */
export function parseXmlAttributes(openingTag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(openingTag)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

interface AttributeXmlDetection {
  type: AttributeXmlBlockType;
  fullOpeningTag: string;
  attributes: Record<string, string>;
}

function detectAttributeXmlBlock(line: string): AttributeXmlDetection | null {
  const trimmed = line.trim();
  for (const type of ATTRIBUTE_XML_BLOCKS) {
    const prefix = `<${type}`;
    if (
      trimmed.startsWith(prefix) &&
      (trimmed[prefix.length] === " " || trimmed[prefix.length] === ">")
    ) {
      const closeBracket = trimmed.indexOf(">");
      if (closeBracket === -1) return null;
      const fullOpeningTag = trimmed.slice(0, closeBracket + 1);
      const attributes = parseXmlAttributes(fullOpeningTag);
      return { type, fullOpeningTag, attributes };
    }
  }
  return null;
}

/**
 * Detects a `<decision ...>` tag that appears mid-line (not at the very start
 * of the trimmed line). Returns the byte offset of the `<` in the original
 * line, or -1 if no mid-line tag was found.
 *
 * We only need to handle attribute-XML blocks (i.e. `decision`) for the
 * mid-line case — simple XML tags like `<flashcards>` are never emitted
 * mid-sentence by models.
 */
function detectMidLineAttributeXml(line: string): {
  tagStart: number;
  type: AttributeXmlBlockType;
  fullOpeningTag: string;
  attributes: Record<string, string>;
} | null {
  for (const type of ATTRIBUTE_XML_BLOCKS) {
    const prefix = `<${type}`;
    const idx = line.indexOf(prefix);
    if (idx === -1) continue;

    // Must NOT be at the very start of the trimmed line (that's handled by detectAttributeXmlBlock)
    if (line.trimStart().startsWith(prefix)) continue;

    const afterPrefix = line[idx + prefix.length];
    if (afterPrefix !== " " && afterPrefix !== ">") continue;

    const closeBracket = line.indexOf(">", idx);
    if (closeBracket === -1) continue;

    const fullOpeningTag = line.slice(idx, closeBracket + 1);
    const attributes = parseXmlAttributes(fullOpeningTag);
    return { tagStart: idx, type, fullOpeningTag, attributes };
  }
  return null;
}

interface DecisionOption {
  id: string;
  label: string;
  text: string;
}

interface DecisionData {
  id: string;
  prompt: string;
  options: DecisionOption[];
}

/**
 * Extracts an attribute-bearing XML block (e.g. `<decision ...>` or `<artifact ...>`)
 * starting at `startIndex`.
 *
 * `rawXmlOverride` — when the opening tag was found mid-line, the caller
 * passes the original (un-split) source lines so that rawXml matches the
 * exact substring in the full content string (required for replaceBlockContent).
 */
function extractAttributeXmlBlock(
  detection: AttributeXmlDetection,
  startIndex: number,
  lines: string[],
  rawXmlOverride?: string,
): ExtractionResult {
  const closingTag = `</${detection.type}>`;
  const rawLines: string[] = [];
  // consumedLines tracks source lines for rawXml when no override is given.
  const consumedLines: string[] = [];
  let i = startIndex;
  let foundClosingTag = false;

  const firstLine = removeMatrxPattern(lines[i]).trim();
  consumedLines.push(lines[i]);
  const afterOpening = firstLine.slice(firstLine.indexOf(">") + 1);

  if (afterOpening.includes(closingTag)) {
    const closingIdx = afterOpening.indexOf(closingTag);
    const inner = afterOpening.slice(0, closingIdx).trim();
    if (inner) rawLines.push(inner);
    const remainderAfterClose = afterOpening
      .slice(closingIdx + closingTag.length)
      .trim();
    foundClosingTag = true;
    i++;
    if (remainderAfterClose) {
      lines.splice(i, 0, remainderAfterClose);
    }
  } else {
    if (afterOpening.trim()) rawLines.push(afterOpening.trim());
    i++;

    while (i < lines.length) {
      const current = removeMatrxPattern(lines[i]).trim();
      const closingIdx = current.indexOf(closingTag);
      if (closingIdx !== -1) {
        const before = current.slice(0, closingIdx).trim();
        if (before) rawLines.push(before);
        // Capture only up to (and including) the closing tag — not the remainder.
        const originalLine = lines[i];
        const originalClosingIdx = originalLine.indexOf(closingTag);
        consumedLines.push(
          originalClosingIdx !== -1
            ? originalLine.slice(0, originalClosingIdx + closingTag.length)
            : originalLine,
        );
        const remainderAfterClose = current
          .slice(closingIdx + closingTag.length)
          .trim();
        foundClosingTag = true;
        i++;
        // Re-inject any content after the closing tag so the main loop
        // can detect it as a new block (interstitial text or next opening tag).
        if (remainderAfterClose) {
          lines.splice(i, 0, remainderAfterClose);
        }
        break;
      }
      if (current === closingTag) {
        consumedLines.push(lines[i]);
        foundClosingTag = true;
        i++;
        break;
      }
      consumedLines.push(lines[i]);
      rawLines.push(lines[i]);
      i++;
    }
  }

  const innerContent = rawLines.join("\n");

  // rawXml must exactly match the substring in the original content string so
  // that replaceBlockContent(rawXml, chosenText) finds and replaces it correctly.
  // For mid-line blocks an override is passed from the call site (step 5.5),
  // because the synthetic lines in `lines` no longer match the original verbatim.
  const fullXml = rawXmlOverride ?? consumedLines.join("\n");

  // Type-specific metadata construction

  // Editor pill tags — pass attributes straight through as metadata so the
  // chip component can render file/line/severity/language without parsing.
  if (
    detection.type === "editor_error" ||
    detection.type === "editor_code_snippet"
  ) {
    return {
      content: innerContent,
      nextIndex: i,
      metadata: {
        isComplete: foundClosingTag,
        ...detection.attributes,
        rawXml: fullXml,
      },
    };
  }

  if (detection.type === "artifact") {
    const artifactId = detection.attributes.id || `artifact-${startIndex}`;
    const artifactIndex = artifactId.includes("_")
      ? parseInt(artifactId.split("_").pop() || "0", 10)
      : startIndex;

    return {
      content: innerContent,
      nextIndex: i,
      metadata: {
        isComplete: foundClosingTag,
        artifactId,
        artifactIndex,
        artifactType: detection.attributes.type || "text",
        artifactTitle: detection.attributes.title || "",
        rawXml: fullXml,
      },
    };
  }

  // Default: decision block parsing
  const options: DecisionOption[] = [];
  const optionRegex = /<option\s+label="([^"]*)">([\s\S]*?)<\/option>/g;
  let optMatch: RegExpExecArray | null;
  let optIndex = 0;
  while ((optMatch = optionRegex.exec(innerContent)) !== null) {
    options.push({
      id: `opt-${optIndex++}`,
      label: optMatch[1],
      text: optMatch[2].trim(),
    });
  }

  const prompt = detection.attributes.prompt || "Make a selection";

  const decision: DecisionData = {
    id: `decision-${startIndex}`,
    prompt,
    options,
  };

  return {
    content: innerContent,
    nextIndex: i,
    metadata: {
      isComplete: foundClosingTag,
      decision,
      rawXml: fullXml,
    },
  };
}

/** Returns { type, matchedTag } when line starts with a known XML block tag (allows content on same line). */
function detectXmlBlockType(
  line: string,
): { type: keyof typeof XML_TAG_BLOCKS; matchedTag: string } | null {
  const trimmed = line.trim();

  for (const [type, tags] of Object.entries(XML_TAG_BLOCKS)) {
    const matchedTag = tags.find(
      (tag) => trimmed === tag || trimmed.startsWith(tag),
    );
    if (matchedTag) {
      return { type: type as keyof typeof XML_TAG_BLOCKS, matchedTag };
    }
  }

  return null;
}

function extractXmlBlock(
  type: keyof typeof XML_TAG_BLOCKS,
  matchedTag: string,
  startIndex: number,
  lines: string[],
): ExtractionResult {
  const content: string[] = [];
  let i = startIndex;
  let foundClosingTag = false;
  // Collects any text that appears after the closing tag on the same line
  // (e.g. a new opening tag). Inserted back into `lines` so the caller's
  // loop can process it as a new block.
  let remainderAfterClose = "";

  const tagName = matchedTag.slice(1, -1);
  const closingTag = `</${tagName}>`;

  // First line may have content after the opening tag: <reasoning>test or <reasoning>test</reasoning>
  const firstLine = lines[i];
  const processedFirst = removeMatrxPattern(firstLine).trim();
  if (processedFirst.startsWith(matchedTag)) {
    const afterTag = processedFirst.slice(matchedTag.length);
    const closingIdx = afterTag.indexOf(closingTag);
    if (closingIdx !== -1) {
      const beforeClosing = afterTag.slice(0, closingIdx).trim();
      if (beforeClosing) content.push(beforeClosing);
      remainderAfterClose = afterTag
        .slice(closingIdx + closingTag.length)
        .trim();
      foundClosingTag = true;
      i++;
      if (remainderAfterClose) {
        lines.splice(i, 0, remainderAfterClose);
      }
      const fullContent = content.join("\n");
      const result = validateStreamingXmlBlock(
        type,
        fullContent,
        foundClosingTag,
      );
      return {
        content: result.content || fullContent,
        nextIndex: i,
        metadata: result.metadata,
      };
    }
    const afterTagTrimmed = afterTag.trim();
    if (afterTagTrimmed) content.push(afterTagTrimmed);
    i++;
  }

  while (i < lines.length) {
    const currentTrimmed = removeMatrxPattern(lines[i]).trim();

    if (currentTrimmed === closingTag) {
      foundClosingTag = true;
      i++;
      break;
    }

    // Closing tag inline: "content</reasoning>" or "---</flashcards><flashcards>"
    const closingIdx = currentTrimmed.indexOf(closingTag);
    if (closingIdx !== -1) {
      const beforeClosing = currentTrimmed.slice(0, closingIdx).trim();
      if (beforeClosing) content.push(beforeClosing);
      remainderAfterClose = currentTrimmed
        .slice(closingIdx + closingTag.length)
        .trim();
      foundClosingTag = true;
      i++;
      // Re-inject any text after the closing tag (e.g. a new opening tag)
      // so the main loop can detect and parse it as a separate block.
      if (remainderAfterClose) {
        lines.splice(i, 0, remainderAfterClose);
      }
      break;
    }

    // Special handling for thinking blocks with markers
    if (
      type === "thinking" &&
      currentTrimmed.startsWith("### I have everything")
    ) {
      content.push(lines[i]);
      i++;
      break;
    }

    content.push(lines[i]);
    i++;
  }

  const fullContent = content.join("\n");

  // Apply streaming validation based on type
  const result = validateStreamingXmlBlock(type, fullContent, foundClosingTag);

  return {
    content: result.content || fullContent,
    nextIndex: i,
    metadata: result.metadata,
  };
}

function validateStreamingXmlBlock(
  type: keyof typeof XML_TAG_BLOCKS,
  content: string,
  foundClosingTag: boolean,
): { content: string; metadata: any } {
  // Simple blocks that don't need streaming logic
  if (!["questionnaire", "flashcards", "cooking_recipe"].includes(type)) {
    return {
      content,
      metadata: { isComplete: foundClosingTag },
    };
  }

  // Complex blocks with streaming logic
  if (type === "questionnaire") {
    return validateQuestionnaireStreaming(content, foundClosingTag);
  }

  if (type === "flashcards") {
    return validateFlashcardStreaming(content, foundClosingTag);
  }

  if (type === "cooking_recipe") {
    return validateRecipeStreaming(content, foundClosingTag);
  }

  return {
    content,
    metadata: { isComplete: foundClosingTag },
  };
}

function validateQuestionnaireStreaming(
  content: string,
  foundClosingTag: boolean,
): { content: string; metadata: any } {
  const lines = content.split("\n");
  const completeQuestions: string[] = [];
  let currentQuestion: string[] = [];
  let totalQuestions = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (
      line.match(/^###\s+\*\*Q\d+:/) ||
      line.match(/^###\s+Q\d+:/) ||
      line.match(/^\*\*Q\d+:/)
    ) {
      totalQuestions++;
      if (currentQuestion.length > 0) {
        completeQuestions.push(currentQuestion.join("\n"));
      }
      currentQuestion = [lines[i]];
    } else if (line === "---") {
      currentQuestion.push(lines[i]);
      if (currentQuestion.length > 1) {
        completeQuestions.push(currentQuestion.join("\n"));
      }
      currentQuestion = [];
    } else if (currentQuestion.length > 0 || line.length > 0) {
      currentQuestion.push(lines[i]);
    }
  }

  if (foundClosingTag && currentQuestion.length > 0) {
    completeQuestions.push(currentQuestion.join("\n"));
  }

  const contentHash = `${completeQuestions.length}-${foundClosingTag}`;
  const cacheKey = `questionnaire-${contentHash}`;

  let contentToRelease = foundClosingTag
    ? content
    : completeQuestions.join("\n\n---\n\n");

  const cached = questionnaireCache.get(cacheKey);
  if (cached && cached.content === contentToRelease) {
    return cached;
  }

  const result = {
    content: contentToRelease,
    metadata: {
      isComplete: foundClosingTag,
      completeQuestionCount: completeQuestions.length,
      totalQuestions,
      hasPartialContent: !foundClosingTag && currentQuestion.length > 0,
    },
  };

  questionnaireCache.set(cacheKey, {
    content: contentToRelease,
    hash: contentHash,
    metadata: result.metadata,
  });

  return result;
}

function validateFlashcardStreaming(
  content: string,
  foundClosingTag: boolean,
): { content: string; metadata: any } {
  const lines = content.split("\n");
  const completeCards: string[] = [];
  let currentCard: string[] = [];
  let totalCards = 0;
  let hasFront = false;
  let hasBack = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.match(/^(?:Front|Question):/i)) {
      if (currentCard.length > 0 && hasFront && hasBack) {
        completeCards.push(currentCard.join("\n"));
      }
      currentCard = [lines[i]];
      hasFront = true;
      hasBack = false;
      totalCards++;
    } else if (line.match(/^(?:Back|Answer):/i)) {
      currentCard.push(lines[i]);
      hasBack = true;
    } else if (line === "---") {
      if (currentCard.length > 0 && hasFront && hasBack) {
        completeCards.push(currentCard.join("\n"));
      }
      currentCard = [];
      hasFront = false;
      hasBack = false;
    } else if (currentCard.length > 0) {
      // Include blank lines and content lines as part of the current card
      // (supports multi-line Back: content)
      currentCard.push(lines[i]);
    }
  }

  if (foundClosingTag && currentCard.length > 0 && hasFront && hasBack) {
    completeCards.push(currentCard.join("\n"));
  }

  const contentHash = `${completeCards.length}-${foundClosingTag}`;
  const cacheKey = `flashcards-${contentHash}`;

  let contentToRelease = foundClosingTag
    ? content
    : completeCards.join("\n\n---\n\n");

  const cached = flashcardCache.get(cacheKey);
  if (cached && cached.content === contentToRelease) {
    return cached;
  }

  const result = {
    content: contentToRelease,
    metadata: {
      isComplete: foundClosingTag,
      completeCardCount: completeCards.length,
      totalCards,
      hasPartialContent: !foundClosingTag && currentCard.length > 0,
    },
  };

  flashcardCache.set(cacheKey, {
    content: contentToRelease,
    hash: contentHash,
    metadata: result.metadata,
  });

  return result;
}

function validateRecipeStreaming(
  content: string,
  foundClosingTag: boolean,
): { content: string; metadata: any } {
  const hasTitle = /^###\s+.+$/m.test(content);
  const hasIngredients = /####\s*Ingredients?:/i.test(content);
  const hasInstructions = /####\s*Instructions?:/i.test(content);
  const contentLength = content.length;

  const contentHash = `${contentLength}-${foundClosingTag}-${hasTitle}-${hasIngredients}-${hasInstructions}`;
  const cacheKey = `cooking_recipe-${contentHash}`;

  let contentToRelease = "";

  if (foundClosingTag) {
    contentToRelease = content;
  } else if (hasTitle && (hasIngredients || hasInstructions)) {
    contentToRelease = content;
  }

  const cached = recipeCache.get(cacheKey);
  if (cached && cached.content === contentToRelease) {
    return cached;
  }

  const result = {
    content: contentToRelease,
    metadata: {
      isComplete: foundClosingTag,
      hasTitle,
      hasIngredients,
      hasInstructions,
      hasPartialContent: !foundClosingTag && contentLength > 0,
    },
  };

  recipeCache.set(cacheKey, {
    content: contentToRelease,
    hash: contentHash,
    metadata: result.metadata,
  });

  return result;
}

// ============================================================================
// MARKDOWN BLOCK DETECTORS
// ============================================================================

function detectCodeBlock(line: string): {
  isCodeBlock: boolean;
  language?: string;
  ticks?: number;
} {
  const trimmed = line.trim();

  // Count the opening run of backticks. CommonMark requires >= 3, and the
  // length of this run is load-bearing: the block only closes on a later bare
  // fence with at least this many backticks (so a longer ```` fence can wrap
  // inner ``` blocks). Mirrors extractFenceInfo() in the Redux stream parser.
  let ticks = 0;
  while (ticks < trimmed.length && trimmed[ticks] === "`") ticks++;
  if (ticks < 3) {
    return { isCodeBlock: false };
  }

  const language = trimmed.slice(ticks).trim().split(/\s/)[0] || undefined;

  return { isCodeBlock: true, language, ticks };
}

/**
 * Checks whether a triple-backtick sequence at `backtickPos` in `line` is
 * inside a JSON string literal, given the cumulative string-context state
 * (`inString`, `escaped`) carried over from previous lines.
 *
 * Returns { isInsideString, inString, escaped } so the caller can thread the
 * state across lines.
 */
function isBacktickInsideJsonString(
  line: string,
  backtickPos: number,
  inString: boolean,
  escaped: boolean,
): { isInsideString: boolean; inString: boolean; escaped: boolean } {
  for (let idx = 0; idx < backtickPos; idx++) {
    const ch = line[idx];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
    }
  }
  return { isInsideString: inString, inString, escaped };
}

/** Length of the run of backticks starting at `pos` in `str`. */
function backtickRunLength(str: string, pos: number): number {
  let n = 0;
  while (pos + n < str.length && str[pos + n] === "`") n++;
  return n;
}

function extractCodeBlock(
  language: string | undefined,
  openTicks: number,
  startIndex: number,
  lines: string[],
): ExtractionResult {
  const content: string[] = [];
  let i = startIndex;
  // Track JSON string context across lines so we don't mistake ``` inside a
  // string value for the closing fence.
  const isJson = language === "json";
  let jsonInString = false;
  let jsonEscaped = false;

  // Advance the JSON string-context machine across a slice of the line.
  const advanceJsonState = (line: string, from: number) => {
    for (let idx = from; idx < line.length; idx++) {
      const ch = line[idx];
      if (jsonEscaped) {
        jsonEscaped = false;
        continue;
      }
      if (ch === "\\" && jsonInString) {
        jsonEscaped = true;
        continue;
      }
      if (ch === '"') jsonInString = !jsonInString;
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Closing fence at the start of the line (the normal, CommonMark case).
    if (trimmedLine.startsWith("```")) {
      if (isJson) {
        const { isInsideString, inString, escaped } =
          isBacktickInsideJsonString(
            line,
            line.indexOf("```"),
            jsonInString,
            jsonEscaped,
          );
        if (isInsideString) {
          content.push(line);
          i++;
          jsonInString = inString;
          jsonEscaped = escaped;
          advanceJsonState(line, line.indexOf("```"));
          continue;
        }
      }

      // CommonMark fence rule (identical to the Redux StreamBlockAccumulator):
      // the block closes only on a *bare* run of backticks at least as long as
      // the opening fence. An info string (e.g. ```js) or a shorter run is
      // literal content — that's how a code block nests inside a longer ````
      // fence, and it's the only unambiguous way to express nesting.
      const closeTicks = backtickRunLength(trimmedLine, 0);
      const isBareFence = trimmedLine.slice(closeTicks).trim() === "";
      if (isBareFence && closeTicks >= openTicks) {
        break;
      }

      content.push(line);
      i++;
      if (isJson) advanceJsonState(line, 0);
      continue;
    }

    // Inline closing fence (e.g. `}``` `). Only a bare run of >= openTicks
    // backticks with nothing meaningful after it closes the block.
    const backtickIndex = line.indexOf("```");
    if (backtickIndex !== -1) {
      if (isJson) {
        const { isInsideString, inString, escaped } =
          isBacktickInsideJsonString(
            line,
            backtickIndex,
            jsonInString,
            jsonEscaped,
          );
        if (isInsideString) {
          content.push(line);
          i++;
          jsonInString = inString;
          jsonEscaped = escaped;
          advanceJsonState(line, backtickIndex);
          continue;
        }
      }

      const closeTicks = backtickRunLength(line, backtickIndex);
      const afterFence = line.slice(backtickIndex + closeTicks).trim();
      if (closeTicks >= openTicks && afterFence === "") {
        const contentBeforeBackticks = line.substring(0, backtickIndex);
        if (contentBeforeBackticks.trim()) {
          content.push(contentBeforeBackticks);
        }
        break;
      }

      content.push(line);
      i++;
      if (isJson) advanceJsonState(line, 0);
      continue;
    }

    content.push(line);
    i++;
    if (isJson) advanceJsonState(line, 0);
  }

  return {
    content: content.join("\n"),
    nextIndex: i + 1, // Skip closing ```
    metadata: { language },
  };
}

function detectTableRow(line: string): boolean {
  const trimmed = removeMatrxPattern(line).trim();
  return trimmed.startsWith("|") && trimmed.includes("|", 1);
}

function isTableSeparator(line: string): boolean {
  const trimmed = removeMatrxPattern(line).trim();
  return /^\|[:\s|\-]+\|?$/.test(trimmed);
}

function extractTable(startIndex: number, lines: string[]): ExtractionResult {
  const tableLines: string[] = [lines[startIndex]];
  let i = startIndex + 1;

  // Collect all consecutive table rows
  while (i < lines.length && detectTableRow(lines[i])) {
    tableLines.push(lines[i]);
    i++;
  }

  // Validate table structure (must have header + separator)
  if (tableLines.length < 2 || !isTableSeparator(tableLines[1])) {
    return {
      content: "",
      nextIndex: startIndex + 1,
      metadata: { isValid: false },
    };
  }

  // Determine if table has ended: if we hit a non-table line, table is complete
  const tableHasEnded = i < lines.length;

  // Analyze completion state with caching
  const result = analyzeTableCompletionWithCache(tableLines, tableHasEnded);

  return {
    content: result.content,
    nextIndex: i,
    metadata: result.metadata,
  };
}

function analyzeTableCompletionWithCache(
  tableLines: string[],
  tableHasEnded: boolean,
): { content: string; metadata: any } {
  if (tableLines.length < 2) {
    return {
      content: "",
      metadata: { isComplete: false, completeRowCount: 0 },
    };
  }

  // Create stable cache key based on header structure and row count
  const headerHash = tableLines.slice(0, 2).join("|").replace(/\s+/g, "");
  const rowCount = tableLines.length;
  const cacheKey = `table-${headerHash}-${rowCount}-${tableHasEnded}`;

  // Analyze table state
  const state = analyzeTableCompletion(tableLines, tableHasEnded);

  // ALWAYS include all rows in the content - the renderer handles streaming display.
  // Previously we filtered out the last row during streaming, but this caused the
  // last row to be permanently lost when streaming ended (the splitter doesn't know
  // when isStreamActive changes). Now we include all rows and let the renderer use
  // metadata.hasPartialContent to show a streaming indicator when appropriate.
  const contentToRelease = tableLines.join("\n");

  // Check cache
  const cached = tableCache.get(cacheKey);
  if (cached && cached.content === contentToRelease) {
    return cached;
  }

  // Update cache
  const result = {
    content: contentToRelease,
    metadata: {
      cacheKey,
      isComplete: state.isComplete,
      completeRowCount: state.completeRowCount,
      totalRows: state.totalRows,
      hasPartialContent: state.bufferRow.length > 0,
    },
  };

  tableCache.set(cacheKey, {
    content: contentToRelease,
    hash: `${state.completeRowCount}-${state.isComplete}-${rowCount}`,
    metadata: result.metadata,
  });

  return result;
}

function analyzeTableCompletion(
  tableLines: string[],
  tableHasEnded: boolean,
): {
  isComplete: boolean;
  completeRowCount: number;
  totalRows: number;
  bufferRow: string;
} {
  if (tableLines.length < 3) {
    return {
      isComplete: false,
      completeRowCount: 0,
      totalRows: 0,
      bufferRow: "",
    };
  }

  const dataLines = tableLines.slice(2);
  const completeRows: string[] = [];
  let bufferRow = "";

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const trimmedLine = removeMatrxPattern(line).trim();

    if (trimmedLine.startsWith("|") && trimmedLine.includes("|", 1)) {
      // If table has ended (hit non-table line), all rows are complete
      // Otherwise, only rows before the last are complete (last is still streaming)
      const isCompleteRow = tableHasEnded || i < dataLines.length - 1;

      if (isCompleteRow) {
        completeRows.push(line);
      } else {
        bufferRow = line;
      }
    }
  }

  return {
    isComplete: tableHasEnded || bufferRow.length === 0,
    completeRowCount: completeRows.length,
    totalRows: dataLines.length,
    bufferRow,
  };
}

export function detectImageMarkdown(line: string): {
  isImage: boolean;
  src?: string;
  alt?: string;
} {
  const trimmed = line.trim();

  // Allow an optional markdown title after the URL: ![alt](url "title") or
  // ![alt](url 'title'). Reference-style images (![alt][id]) are intentionally
  // NOT matched — their URL lives in a separate [id]: definition, so they must
  // stay in the text block where react-markdown can resolve the reference.
  const standardMatch = trimmed.match(
    /^!\[(.*?)\]\((https?:\/\/[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'))?\)/,
  );
  const customMatch = trimmed.match(/\[Image URL: (https?:\/\/[^\s\]]+)\]/);

  if (standardMatch) {
    return { isImage: true, alt: standardMatch[1], src: standardMatch[2] };
  }

  if (customMatch) {
    return { isImage: true, alt: "Image", src: customMatch[1] };
  }

  return { isImage: false };
}

export function detectVideoMarkdown(line: string): {
  isVideo: boolean;
  src?: string;
  alt?: string;
} {
  const trimmed = line.trim();

  const customMatch = trimmed.match(/\[Video URL: (https?:\/\/[^\s\]]+)\]/);

  if (customMatch) {
    return { isVideo: true, alt: "Video", src: customMatch[1] };
  }

  return { isVideo: false };
}

// Audio file extensions we recognize when a bare/markdown link points at a
// clip. The optional `?query` tail keeps signed S3 URLs (…/clip.mp3?X-Amz-…)
// matching since the extension sits before the query string.
export const AUDIO_URL_EXT =
  /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|weba|webm)(\?[^\s)]*)?$/i;

/**
 * Extracts the audio URL + label from a single line that is an audio link, or
 * returns null. Shared by the splitter, the streaming block accumulator, and
 * the content prefilter so all three agree on what counts as an audio link.
 * Three accepted shapes, all line-scoped:
 *   1. `[Audio URL: https://…]`  — backend custom format, symmetric with
 *      `[Image URL: …]` / `[Video URL: …]`.
 *   2. `[label](https://…/clip.mp3)` or `![label](…)` — a standard markdown
 *      link whose URL is an audio file AND which is the entire line (so inline
 *      links inside a sentence are left as ordinary links).
 *   3. A bare audio URL on its own line.
 */
export function extractAudioLink(
  line: string,
): { src: string; alt: string } | null {
  const trimmed = line.trim();

  const customMatch = trimmed.match(/\[Audio URL:\s*(https?:\/\/[^\s\]]+)\]/);
  if (customMatch) {
    return { src: customMatch[1], alt: "Audio" };
  }

  const linkMatch = trimmed.match(/^!?\[(.*?)\]\((https?:\/\/[^\s)]+)\)$/);
  if (linkMatch && AUDIO_URL_EXT.test(linkMatch[2])) {
    return { src: linkMatch[2], alt: linkMatch[1] || "Audio" };
  }

  if (/^https?:\/\/[^\s)]+$/.test(trimmed) && AUDIO_URL_EXT.test(trimmed)) {
    return { src: trimmed, alt: "Audio" };
  }

  return null;
}

/**
 * Detects an audio response that arrives as a markdown/text link rather than a
 * structured media block — the streaming twin of the server-side
 * `audio_output` block. Without this, an audio-only assistant turn renders as a
 * plain clickable link mid-stream and only becomes a player after reload (when
 * the DB serves it as a `media` block).
 */
function detectAudioMarkdown(line: string): {
  isAudio: boolean;
  src?: string;
  alt?: string;
} {
  const audio = extractAudioLink(line);
  if (audio) {
    return { isAudio: true, src: audio.src, alt: audio.alt };
  }
  return { isAudio: false };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const TREE_CHARS = /[├└│┌┐┘┬┴┤┼─]/;
const ASCII_TREE_PATTERNS = /^[\s│|]*[├└+|][\s─\-]+/;

function isTreeLine(line: string): boolean {
  if (!line) return false;
  if (TREE_CHARS.test(line)) return true;
  if (ASCII_TREE_PATTERNS.test(line)) return true;
  return false;
}

function removeMatrxPattern(text: string): string {
  return text.replace(MATRX_PATTERN, "").trim() === ""
    ? ""
    : text.replace(MATRX_PATTERN, "");
}

function detectMatrxPattern(
  text: string,
  startIndex: number,
): { hasPattern: boolean; match?: RegExpExecArray } {
  MATRX_PATTERN.lastIndex = startIndex;
  const match = MATRX_PATTERN.exec(text);

  if (match && match.index < startIndex + text.length) {
    return { hasPattern: true, match };
  }

  return { hasPattern: false };
}

// ============================================================================
// MAIN SPLITTER
// ============================================================================

export const splitContentIntoBlocksV2 = (
  mdContent: string,
): SplitterBlock[] => {
  const blocks: SplitterBlock[] = [];
  const lines = mdContent.split(/\r?\n/);

  let currentText = "";
  let i = 0;
  // Keyed by the synthetic tagAndRest string that was spliced into `lines`.
  // Consumed once by step 3a so extractAttributeXmlBlock gets the correct rawXml.
  const pendingRawXmlOverrides = new Map<string, string>();

  while (i < lines.length) {
    const line = lines[i];
    const processedLine = removeMatrxPattern(line);
    const trimmedLine = processedLine.trim();

    // 🟠SKIP: line trimmed to empty after MATRX pattern removal — skipping it entirely
    if (trimmedLine === "" && processedLine !== "") {
      i++;
      continue;
    }

    // 1. Check for MATRX pattern
    const matrxCheck = detectMatrxPattern(line, 0);
    if (matrxCheck.hasPattern && matrxCheck.match) {
      if (currentText.trim()) {
        blocks.push({ type: "text", content: currentText.trimEnd() });
        currentText = "";
      }

      try {
        const metadata = getMetadataFromText(matrxCheck.match[0]);
        if (metadata.length > 0) {
          blocks.push({
            type: "matrxBroker",
            content: matrxCheck.match[0],
            metadata: metadata[0],
          });
        }
      } catch (error) {
        currentText += line;
      }

      i++;
      continue;
    }

    // 1b. Check for custom divider variants before they get absorbed as text.
    //  *** (or * * * etc.) = accent divider, #=== or # === = heavy divider.
    //  Standard --- is left for react-markdown to handle inside text blocks.
    if (/^\*\s*\*\s*\*\s*$/.test(trimmedLine)) {
      if (currentText.trim()) {
        blocks.push({ type: "text", content: currentText.trimEnd() });
        currentText = "";
      }
      blocks.push({ type: "accent-divider", content: trimmedLine });
      i++;
      continue;
    }
    if (/^#\s*={3,}\s*$/.test(trimmedLine)) {
      if (currentText.trim()) {
        blocks.push({ type: "text", content: currentText.trimEnd() });
        currentText = "";
      }
      blocks.push({ type: "heavy-divider", content: trimmedLine });
      i++;
      continue;
    }

    // 2. Check for code blocks
    const codeCheck = detectCodeBlock(processedLine);
    if (codeCheck.isCodeBlock) {
      if (currentText.trim()) {
        blocks.push({ type: "text", content: currentText.trimEnd() });
        currentText = "";
      }

      const extraction = extractCodeBlock(
        codeCheck.language,
        codeCheck.ticks ?? 3,
        i + 1,
        lines,
      );

      const normalizedLanguage = normalizeCodeLanguage(codeCheck.language);

      if (
        normalizedLanguage &&
        SPECIAL_CODE_LANGUAGES.includes(normalizedLanguage)
      ) {
        blocks.push({
          type: normalizedLanguage as SplitterBlockType,
          content: extraction.content,
          language: codeCheck.language,
        });
      } else if (codeCheck.language === "json") {
        // Check for special JSON block types
        const jsonType = detectJsonBlockType(extraction.content);

        if (jsonType) {
          const streamingState = validateJsonBlock(
            extraction.content,
            jsonType,
          );
          blocks.push({
            type: jsonType as SplitterBlockType,
            content: extraction.content,
            language: "json",
            metadata: streamingState.metadata,
          });
        } else {
          // Regular JSON code block
          blocks.push({
            type: "code",
            content: extraction.content,
            language: codeCheck.language,
          });
        }
      } else {
        // Regular code block
        blocks.push({
          type: "code",
          content: extraction.content,
          language: codeCheck.language,
        });
      }

      i = extraction.nextIndex;
      continue;
    }

    // 3a. Check for attribute-bearing XML blocks (e.g. <decision prompt="...">)
    const attrXmlMatch = detectAttributeXmlBlock(processedLine);
    if (attrXmlMatch) {
      if (currentText.trim()) {
        blocks.push({ type: "text", content: currentText.trimEnd() });
        currentText = "";
      }

      // If this line was produced by a mid-line split (step 5.5), consume
      // the pre-computed rawXml override so replaceBlockContent works correctly.
      const rawXmlOverride = pendingRawXmlOverrides.get(trimmedLine);
      if (rawXmlOverride !== undefined) {
        pendingRawXmlOverrides.delete(trimmedLine);
      }

      const extraction = extractAttributeXmlBlock(
        attrXmlMatch,
        i,
        lines,
        rawXmlOverride,
      );

      blocks.push({
        type: attrXmlMatch.type as SplitterBlockType,
        content: extraction.content,
        metadata: extraction.metadata,
      });

      i = extraction.nextIndex;
      continue;
    }

    // 3b. Check for simple XML tag blocks
    const xmlMatch = detectXmlBlockType(processedLine);
    if (xmlMatch) {
      if (currentText.trim()) {
        blocks.push({ type: "text", content: currentText.trimEnd() });
        currentText = "";
      }

      const extraction = extractXmlBlock(
        xmlMatch.type,
        xmlMatch.matchedTag,
        i,
        lines,
      );

      blocks.push({
        type: xmlMatch.type as SplitterBlockType,
        content: extraction.content,
        metadata: extraction.metadata,
      });

      i = extraction.nextIndex;
      continue;
    }

    // 4. Check for image markdown
    const imageCheck = detectImageMarkdown(line);
    if (imageCheck.isImage) {
      if (currentText.trim()) {
        blocks.push({ type: "text", content: currentText.trimEnd() });
        currentText = "";
      }

      blocks.push({
        type: "image",
        content: trimmedLine,
        src: imageCheck.src,
        alt: imageCheck.alt,
      });

      i++;
      continue;
    }

    // 4.5. Check for video markdown
    const videoCheck = detectVideoMarkdown(line);
    if (videoCheck.isVideo) {
      if (currentText.trim()) {
        blocks.push({ type: "text", content: currentText.trimEnd() });
        currentText = "";
      }

      blocks.push({
        type: "video",
        content: trimmedLine,
        src: videoCheck.src,
        alt: videoCheck.alt,
      });

      i++;
      continue;
    }

    // 4.6. Check for audio markdown
    const audioCheck = detectAudioMarkdown(line);
    if (audioCheck.isAudio) {
      if (currentText.trim()) {
        blocks.push({ type: "text", content: currentText.trimEnd() });
        currentText = "";
      }

      blocks.push({
        type: "audio",
        content: trimmedLine,
        src: audioCheck.src,
        alt: audioCheck.alt,
      });

      i++;
      continue;
    }

    // 5. Check for table rows
    if (detectTableRow(line)) {
      if (currentText.trim()) {
        blocks.push({ type: "text", content: currentText.trimEnd() });
        currentText = "";
      }

      const extraction = extractTable(i, lines);

      if (extraction.metadata?.isValid !== false) {
        blocks.push({
          type: "table",
          content: extraction.content,
          metadata: extraction.metadata,
        });
        i = extraction.nextIndex;
      } else {
        // Not a valid table, treat as text
        currentText += processedLine + "\n";
        i++;
      }

      continue;
    }

    // 5.6. Check for bare JSON objects (no ``` code fences).
    // Handles the case where a model outputs { "key": ... } directly without fencing.
    // Only triggers on lines that start with `{` — never inside an already-open block
    // because code/XML/table steps above would have consumed those first.
    if (trimmedLine.startsWith("{")) {
      const jsonLines: string[] = [processedLine];
      let openCount = (trimmedLine.match(/\{/g) || []).length;
      let closeCount = (trimmedLine.match(/\}/g) || []).length;
      let j = i + 1;

      // Collect subsequent lines until braces balance (multi-line JSON)
      while (j < lines.length && openCount > closeCount) {
        const nextLine = removeMatrxPattern(lines[j]);
        jsonLines.push(nextLine);
        openCount += (nextLine.match(/\{/g) || []).length;
        closeCount += (nextLine.match(/\}/g) || []).length;
        j++;
      }

      // Only proceed if braces are balanced and we have at least one pair
      if (openCount === closeCount && openCount > 0) {
        const jsonContent = jsonLines.join("\n").trim();
        let parsedOk = false;
        try {
          const parsed = JSON.parse(jsonContent);
          parsedOk = parsed !== null && typeof parsed === "object";
        } catch {
          // Not valid JSON — fall through to text accumulation
        }

        if (parsedOk) {
          if (currentText.trim()) {
            blocks.push({ type: "text", content: currentText.trimEnd() });
            currentText = "";
          }

          const jsonType = detectJsonBlockType(jsonContent);
          if (jsonType) {
            const streamingState = validateJsonBlock(jsonContent, jsonType);
            blocks.push({
              type: jsonType as SplitterBlockType,
              content: jsonContent,
              language: "json",
              metadata: streamingState.metadata,
            });
          } else {
            blocks.push({
              type: "code",
              content: jsonContent,
              language: "json",
            });
          }
          i = j;
          continue;
        }
      }
    }

    // 5.5. Check for mid-line attribute XML (e.g. "Hello <decision prompt="...">")
    // The tag is somewhere inside the line, not at the start. We:
    //   1. Emit the text before the tag as a text block.
    //   2. Replace the current line in `lines` with [textBefore?, tagAndRest]
    //      so the normal attribute-XML path handles the decision on the next pass.
    //   3. Pre-compute rawXmlOverride from the original source lines (before any
    //      splice mutations) so replaceBlockContent can find the exact substring.
    const midLineAttrXml = detectMidLineAttributeXml(processedLine);
    if (midLineAttrXml) {
      // Flush any accumulated text from prior lines
      if (currentText.trim()) {
        blocks.push({ type: "text", content: currentText.trimEnd() });
        currentText = "";
      }

      const textBefore = processedLine
        .slice(0, midLineAttrXml.tagStart)
        .trimEnd();
      const tagAndRest = processedLine.slice(midLineAttrXml.tagStart);

      // Build rawXmlOverride: scan forward from current line to find the matching
      // </decision> and capture that exact substring from the source lines.
      // This is done BEFORE any splice so the indices are still valid.
      const closingTag = `</${midLineAttrXml.type}>`;
      const rawXmlParts: string[] = [tagAndRest];
      let foundClose = tagAndRest.includes(closingTag);
      if (!foundClose) {
        for (let j = i + 1; j < lines.length; j++) {
          const jLine = lines[j];
          const jIdx = jLine.indexOf(closingTag);
          if (jIdx !== -1) {
            rawXmlParts.push(jLine.slice(0, jIdx + closingTag.length));
            foundClose = true;
            break;
          }
          rawXmlParts.push(jLine);
        }
      }
      const rawXmlOverride = rawXmlParts.join("\n");

      // Splice current line into [textBefore?, tagAndRest] — do NOT push textBefore
      // into the blocks here; let the next iteration handle it as a text line so
      // normal text accumulation runs (preserving surrounding paragraph context).
      const replacements: string[] = [];
      if (textBefore) replacements.push(textBefore);
      replacements.push(tagAndRest);
      // Store the override keyed by the trimmed tag line so step 3a can
      // look it up when it processes the synthetic tagAndRest line.
      pendingRawXmlOverrides.set(tagAndRest.trim(), rawXmlOverride);
      lines.splice(i, 1, ...replacements);
      // Re-process from i (now the textBefore line, or the tagAndRest line).
      continue;
    }

    // 5.7. Check for tree diagram lines — consecutive lines with box-drawing or ASCII tree connectors
    if (isTreeLine(trimmedLine)) {
      // Look ahead to see if this is part of a multi-line tree
      let treeEnd = i + 1;
      while (treeEnd < lines.length) {
        const nextTrimmed = removeMatrxPattern(lines[treeEnd]).trim();
        if (!nextTrimmed) {
          treeEnd++;
          continue;
        }
        if (isTreeLine(nextTrimmed)) {
          treeEnd++;
          continue;
        }
        break;
      }
      // Need at least 3 tree-like lines to constitute a tree block
      const treeLinesCount = lines
        .slice(i, treeEnd)
        .filter((l) => isTreeLine(removeMatrxPattern(l).trim())).length;
      if (treeLinesCount >= 3) {
        if (currentText.trim()) {
          blocks.push({ type: "text", content: currentText.trimEnd() });
          currentText = "";
        }
        const treeContent = lines
          .slice(i, treeEnd)
          .map((l) => removeMatrxPattern(l))
          .join("\n");
        blocks.push({ type: "tree", content: treeContent.trim() });
        i = treeEnd;
        continue;
      }
    }

    // 6. Accumulate as text - DO NOT GOBBLE UP BLANK LINES -- NEVER MODIFY THE CONTENT!!!!!!!!!!!!!!
    currentText += processedLine + (i < lines.length - 1 ? "\n" : "");
    i++;
  }

  // Push remaining text — 🟣TRIM: trimEnd() strips trailing whitespace/newlines from final block
  if (currentText.trim()) {
    blocks.push({ type: "text", content: currentText.trimEnd() });
  }

  return blocks;
};
