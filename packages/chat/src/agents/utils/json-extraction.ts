/**
 * LEGACY COMPATIBILITY WRAPPER
 *
 * All JSON extraction now lives in `utils/json/extract-json.ts`.
 * This file re-exports the old interface shape so existing callers
 * continue to work without changes. New code should import from
 * `@/utils/json` directly.
 */

import {
  extractAllJson,
  extractFirstJson,
  type ExtractedJson,
} from "@/utils/json/extract-json";
import { findAllFencedBlocks } from "@/utils/json/json-structural";

// ── Legacy interface preserved for backward compat ──────────────────────────

export interface JsonExtractionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  rawText: string;
}

/**
 * @deprecated Use `extractFirstJson` or `extractAllJson` from `@/utils/json`.
 */
export function extractJsonFromText(text: string): JsonExtractionResult {
  if (!text || typeof text !== "string") {
    return { success: false, error: "No text provided", rawText: text || "" };
  }

  const result = extractFirstJson(text, { allowFuzzy: false });
  if (result) {
    return { success: true, data: result.value, rawText: text };
  }

  return {
    success: false,
    error: "No JSON code block found in response",
    rawText: text,
  };
}

/**
 * @deprecated Use `extractAllJson` from `@/utils/json` with fenced block detection.
 */
export function extractJsonBlock(text: string): string | null {
  const blocks = findAllFencedBlocks(text);
  const jsonBlock = blocks.find(
    (b) => b.language === "json" || b.language === "",
  );
  return jsonBlock ? jsonBlock.content.trim() : null;
}

/**
 * @deprecated Markdown structure parsing should use `findAllFencedBlocks`.
 */
export function extractNonJsonContent(text: string): {
  before: string;
  after: string;
} {
  const blocks = findAllFencedBlocks(text);
  const jsonBlock = blocks.find(
    (b) => b.language === "json" || b.language === "",
  );

  if (!jsonBlock) {
    return { before: text.trim(), after: "" };
  }

  if (jsonBlock.isComplete) {
    return {
      before: text.slice(0, jsonBlock.fenceStart).trim(),
      after: text.slice(jsonBlock.fenceEnd).trim(),
    };
  }

  return {
    before: text.slice(0, jsonBlock.fenceStart).trim(),
    after: "",
  };
}
