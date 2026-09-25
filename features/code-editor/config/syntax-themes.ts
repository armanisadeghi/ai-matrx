/**
 * Syntax palette shared by the Shiki code view (code-block/highlight) and the
 * Monaco editor: VS Code Dark+/Light+ everywhere, with JSON in a JetBrains
 * Darcula–inspired palette.
 */

import { normalizeLanguage } from "@/features/code-editor/config/languages";

/** Darcula-inspired JSON palette — single source of truth for Shiki + Monaco. */
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
