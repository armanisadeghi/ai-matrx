/**
 * Prism syntax themes for streamed / embedded code blocks.
 *
 * JSON uses JetBrains Darcula–inspired token colors — the de-facto standard
 * for readable JSON in IDEs — with green string values and distinct hues for
 * booleans, numbers, keys, and null.
 */

import type { CSSProperties } from "react";
import {
  vscDarkPlus,
  vs,
} from "react-syntax-highlighter/dist/cjs/styles/prism";
import { normalizeLanguage } from "@/features/code-editor/config/languages";

export type PrismTheme = Record<string, CSSProperties>;

/**
 * Darcula JSON palette (dark).
 * @see https://github.com/JetBrains/intellij-community/blob/master/platform/core-ui/src/ui/DarculaColors.kt
 */
const JSON_DARK_TOKENS: PrismTheme = {
  ".language-json .token.property": { color: "#7dd3fc" },
  ".language-json .token.string": { color: "#6ee7b7" },
  ".language-json .token.number": { color: "#fbbf24" },
  ".language-json .token.boolean": { color: "#c4b5fd" },
  ".language-json .token.null": { color: "#a1a1aa" },
  ".language-json .token.null.keyword": { color: "#a1a1aa" },
  ".language-json .token.keyword": { color: "#c4b5fd" },
  ".language-json .token.punctuation": { color: "#a1a1aa" },
  ".language-json .token.operator": { color: "#a1a1aa" },
};

/** Light-mode companion — same semantic roles, higher contrast on pale backgrounds. */
const JSON_LIGHT_TOKENS: PrismTheme = {
  ".language-json .token.property": { color: "#0369a1" },
  ".language-json .token.string": { color: "#047857" },
  ".language-json .token.number": { color: "#b45309" },
  ".language-json .token.boolean": { color: "#6d28d9" },
  ".language-json .token.null": { color: "#71717a" },
  ".language-json .token.null.keyword": { color: "#71717a" },
  ".language-json .token.keyword": { color: "#6d28d9" },
  ".language-json .token.punctuation": { color: "#4b5563" },
  ".language-json .token.operator": { color: "#4b5563" },
};

function mergeThemes(base: PrismTheme, overrides: PrismTheme): PrismTheme {
  return { ...base, ...overrides };
}

export function isJsonLanguage(language: string | undefined): boolean {
  if (!language) return false;
  const normalized = normalizeLanguage(language).toLowerCase();
  return normalized === "json" || normalized === "jsonc";
}

/**
 * Resolve the Prism style object for a code block.
 * Non-JSON languages keep VS Code Light / Dark+; JSON gets Darcula token colors.
 */
export function resolvePrismSyntaxStyle(
  language: string | undefined,
  mode: "light" | "dark",
): PrismTheme {
  const base = (mode === "dark" ? vscDarkPlus : vs) as PrismTheme;

  if (!isJsonLanguage(language)) {
    return base;
  }

  const jsonTokens = mode === "dark" ? JSON_DARK_TOKENS : JSON_LIGHT_TOKENS;
  return mergeThemes(base, jsonTokens);
}
