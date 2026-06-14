/**
 * Prism + Monaco syntax themes for JSON code blocks.
 *
 * JSON uses JetBrains Darcula–inspired token colors. Prism inline styles
 * only match bare token keys (`string`, `property`, …) — not CSS selectors
 * like `.language-json .token.string`.
 */

import type { CSSProperties } from "react";
import {
  vscDarkPlus,
  vs,
} from "react-syntax-highlighter/dist/cjs/styles/prism";
import { normalizeLanguage } from "@/features/code-editor/config/languages";

export type PrismTheme = Record<string, CSSProperties>;

/** Darcula-inspired JSON palette — single source of truth for Prism + Monaco. */
export const JSON_SYNTAX_COLORS = {
  dark: {
    key: "#7dd3fc",
    string: "#6ee7b7",
    number: "#fbbf24",
    boolean: "#c4b5fd",
    null: "#a1a1aa",
    punctuation: "#a1a1aa",
  },
  light: {
    key: "#0369a1",
    string: "#047857",
    number: "#b45309",
    boolean: "#6d28d9",
    null: "#71717a",
    punctuation: "#4b5563",
  },
} as const;

const JSON_DARK_PRISM: PrismTheme = {
  property: { color: JSON_SYNTAX_COLORS.dark.key },
  string: { color: JSON_SYNTAX_COLORS.dark.string },
  char: { color: JSON_SYNTAX_COLORS.dark.string },
  number: { color: JSON_SYNTAX_COLORS.dark.number },
  boolean: { color: JSON_SYNTAX_COLORS.dark.boolean },
  null: { color: JSON_SYNTAX_COLORS.dark.null },
  keyword: { color: JSON_SYNTAX_COLORS.dark.boolean },
  punctuation: { color: JSON_SYNTAX_COLORS.dark.punctuation },
  operator: { color: JSON_SYNTAX_COLORS.dark.punctuation },
};

const JSON_LIGHT_PRISM: PrismTheme = {
  property: { color: JSON_SYNTAX_COLORS.light.key },
  string: { color: JSON_SYNTAX_COLORS.light.string },
  char: { color: JSON_SYNTAX_COLORS.light.string },
  number: { color: JSON_SYNTAX_COLORS.light.number },
  boolean: { color: JSON_SYNTAX_COLORS.light.boolean },
  null: { color: JSON_SYNTAX_COLORS.light.null },
  keyword: { color: JSON_SYNTAX_COLORS.light.boolean },
  punctuation: { color: JSON_SYNTAX_COLORS.light.punctuation },
  operator: { color: JSON_SYNTAX_COLORS.light.punctuation },
};

function mergeThemes(base: PrismTheme, overrides: PrismTheme): PrismTheme {
  return { ...base, ...overrides };
}

function hexForMonaco(color: string): string {
  return color.replace("#", "").toUpperCase();
}

let monacoJsonThemesRegistered = false;

export function registerJsonMonacoThemes(
  monaco: typeof import("monaco-editor"),
): void {
  if (monacoJsonThemesRegistered) return;
  monacoJsonThemesRegistered = true;

  const dark = JSON_SYNTAX_COLORS.dark;
  const light = JSON_SYNTAX_COLORS.light;

  monaco.editor.defineTheme("matrx-json-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "string.key.json", foreground: hexForMonaco(dark.key) },
      { token: "string.value.json", foreground: hexForMonaco(dark.string) },
      { token: "number.json", foreground: hexForMonaco(dark.number) },
      { token: "keyword.json", foreground: hexForMonaco(dark.boolean) },
      {
        token: "delimiter.bracket.json",
        foreground: hexForMonaco(dark.punctuation),
      },
      {
        token: "delimiter.array.json",
        foreground: hexForMonaco(dark.punctuation),
      },
      {
        token: "delimiter.colon.json",
        foreground: hexForMonaco(dark.punctuation),
      },
      {
        token: "delimiter.comma.json",
        foreground: hexForMonaco(dark.punctuation),
      },
    ],
    colors: {},
  });

  monaco.editor.defineTheme("matrx-json-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "string.key.json", foreground: hexForMonaco(light.key) },
      { token: "string.value.json", foreground: hexForMonaco(light.string) },
      { token: "number.json", foreground: hexForMonaco(light.number) },
      { token: "keyword.json", foreground: hexForMonaco(light.boolean) },
      {
        token: "delimiter.bracket.json",
        foreground: hexForMonaco(light.punctuation),
      },
      {
        token: "delimiter.array.json",
        foreground: hexForMonaco(light.punctuation),
      },
      {
        token: "delimiter.colon.json",
        foreground: hexForMonaco(light.punctuation),
      },
      {
        token: "delimiter.comma.json",
        foreground: hexForMonaco(light.punctuation),
      },
    ],
    colors: {},
  });
}

export function isJsonLanguage(language: string | undefined): boolean {
  if (!language) return false;
  const normalized = normalizeLanguage(language).toLowerCase();
  return normalized === "json" || normalized === "jsonc";
}

/** Prism style for SyntaxHighlighter view mode. */
export function resolvePrismSyntaxStyle(
  language: string | undefined,
  mode: "light" | "dark",
): PrismTheme {
  const base = (mode === "dark" ? vscDarkPlus : vs) as PrismTheme;

  if (!isJsonLanguage(language)) {
    return base;
  }

  const jsonTokens = mode === "dark" ? JSON_DARK_PRISM : JSON_LIGHT_PRISM;
  return mergeThemes(base, jsonTokens);
}

/** Monaco theme id for SmallCodeEditor edit mode. */
export function resolveMonacoEditorTheme(
  language: string | undefined,
  mode: "light" | "dark",
): string {
  if (isJsonLanguage(language)) {
    return mode === "dark" ? "matrx-json-dark" : "matrx-json-light";
  }
  return mode === "dark" ? "vs-dark" : "vs";
}
