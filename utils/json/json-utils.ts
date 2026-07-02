export interface JsonConversionResult {
  success: boolean;
  data?: unknown;
  formattedJson?: string;
  error?: string;
  warnings?: string[];
}

/**
 * Converts Python-style syntax to valid JSON
 * Handles: True/False -> true/false, None -> null, trailing commas, single quotes
 */
export function pythonToJson(input: string): string {
  if (!input || typeof input !== "string") {
    return input;
  }

  let processed = input;

  // Replace Python boolean and null values (case-sensitive, word boundaries)
  processed = processed.replace(/\bTrue\b/g, "true");
  processed = processed.replace(/\bFalse\b/g, "false");
  processed = processed.replace(/\bNone\b/g, "null");

  // Convert single quotes to double quotes (but be careful about escaped quotes)
  // This is a simplified approach - for more complex cases, a proper parser would be needed
  processed = processed.replace(/'/g, '"');

  // Remove trailing commas before closing brackets/braces
  processed = processed.replace(/,(\s*[}\]])/g, "$1");

  return processed;
}

/**
 * Attempts to parse JSON with various fallback strategies
 */
export function flexibleJsonParse(input: string): JsonConversionResult {
  const warnings: string[] = [];

  if (!input || typeof input !== "string") {
    return {
      success: false,
      error: "Input must be a non-empty string",
    };
  }

  const trimmed = input.trim();

  if (trimmed === "") {
    return {
      success: true,
      data: {},
      formattedJson: "{}",
      warnings: ["Empty input converted to empty object"],
    };
  }

  // Strategy 1: Try parsing as-is
  try {
    const data = JSON.parse(trimmed);
    const formattedJson = JSON.stringify(data, null, 2);
    return {
      success: true,
      data,
      formattedJson,
      warnings,
    };
  } catch (error) {
    // Continue to fallback strategies
  }

  // Strategy 2: Try Python-to-JSON conversion
  try {
    const converted = pythonToJson(trimmed);
    if (converted !== trimmed) {
      warnings.push("Converted Python syntax to JSON");
    }

    const data = JSON.parse(converted);
    const formattedJson = JSON.stringify(data, null, 2);
    return {
      success: true,
      data,
      formattedJson,
      warnings,
    };
  } catch (error) {
    // Continue to more aggressive strategies
  }

  // Strategy 3: Try wrapping in braces if it looks like object properties
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    try {
      const wrapped = `{${trimmed}}`;
      const converted = pythonToJson(wrapped);
      const data = JSON.parse(converted);
      const formattedJson = JSON.stringify(data, null, 2);
      warnings.push("Wrapped content in braces to form valid object");
      return {
        success: true,
        data,
        formattedJson,
        warnings,
      };
    } catch (error) {
      // Continue
    }
  }

  // Strategy 4: Try fixing common issues more aggressively
  try {
    let fixed = pythonToJson(trimmed);

    // Fix unquoted keys (simple case)
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    // Remove multiple trailing commas
    fixed = fixed.replace(/,+(\s*[}\]])/g, "$1");

    const data = JSON.parse(fixed);
    const formattedJson = JSON.stringify(data, null, 2);
    warnings.push("Applied aggressive JSON fixes");
    return {
      success: true,
      data,
      formattedJson,
      warnings,
    };
  } catch (error) {
    // Final fallback failed
  }

  return {
    success: false,
    error: "Unable to parse as valid JSON after all conversion attempts",
    warnings,
  };
}

/**
 * Safe JSON stringify that handles undefined, functions, etc.
 */
export function safeJsonStringify(obj: unknown, indent: number = 2): string {
  try {
    return JSON.stringify(
      obj,
      (key, value) => {
        // Handle undefined
        if (value === undefined) {
          return null;
        }
        // Handle functions (convert to string)
        if (typeof value === "function") {
          return value.toString();
        }
        return value;
      },
      indent,
    );
  } catch (error) {
    return String(obj);
  }
}

/**
 * Validates if a string is valid JSON
 */
export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Formats JSON string with proper indentation
 */
export function formatJson(
  input: string,
  indent: number = 2,
): JsonConversionResult {
  const parseResult = flexibleJsonParse(input);

  if (!parseResult.success) {
    return parseResult;
  }

  try {
    const formattedJson = JSON.stringify(parseResult.data, null, indent);
    return {
      ...parseResult,
      formattedJson,
    };
  } catch (error) {
    return {
      success: false,
      error: "Failed to format JSON",
      warnings: parseResult.warnings,
    };
  }
}

/**
 * Minifies JSON by removing unnecessary whitespace
 */
export function minifyJson(input: string): JsonConversionResult {
  const parseResult = flexibleJsonParse(input);

  if (!parseResult.success) {
    return parseResult;
  }

  try {
    const minifiedJson = JSON.stringify(parseResult.data);
    return {
      ...parseResult,
      formattedJson: minifiedJson,
    };
  } catch (error) {
    return {
      success: false,
      error: "Failed to minify JSON",
      warnings: parseResult.warnings,
    };
  }
}

/**
 * Deep clones an object using JSON parse/stringify
 */
export function deepClone<T>(obj: T): T {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    // Fallback for objects that can't be JSON serialized
    return obj;
  }
}

/**
 * Converts a value to a string representation suitable for text input
 * Objects and arrays are converted to formatted JSON strings
 */
export function valueToString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value);
    }
  }

  return String(value);
}

/**
 * Checks if a value has meaningful content
 * For objects/arrays, checks if they have properties/elements
 * For strings, checks if non-empty after trimming
 */
export function hasContent(value: unknown): boolean {
  if (!value) return false;

  if (typeof value === "object") {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return Object.keys(value).length > 0;
  }

  return String(value).trim().length > 0;
}

// =============================================================================
// JSON Close / Repair (used by streaming extraction)
// =============================================================================

import { computeClosingSequence } from "./json-structural";

export interface JsonCloseResult {
  closed: string;
  closingChars: string;
  bracketsClosed: number;
  bracesClosed: number;
}

/**
 * Takes an incomplete JSON string and attempts to close it by appending
 * the necessary `"`, `}`, `]` characters. Returns null if the string
 * is empty or has no open structures.
 */
export function attemptJsonClose(partial: string): JsonCloseResult | null {
  if (!partial || !partial.trim()) return null;

  const closing = computeClosingSequence(partial);
  if (!closing) return null;

  const bracesClosed = (closing.match(/}/g) || []).length;
  const bracketsClosed = (closing.match(/]/g) || []).length;

  return {
    closed: partial + closing,
    closingChars: closing,
    bracketsClosed,
    bracesClosed,
  };
}

/**
 * Strips a list of keys from a parsed JSON object. Non-mutating.
 * Useful as a post-extraction step when consumer needs to remove
 * runtime-only fields like `id`, `userId`, etc.
 */
export function stripKeys<T extends Record<string, unknown>>(
  obj: T,
  keys: string[],
): Partial<T> {
  const keySet = new Set(keys);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!keySet.has(k)) result[k] = v;
  }
  return result as Partial<T>;
}
