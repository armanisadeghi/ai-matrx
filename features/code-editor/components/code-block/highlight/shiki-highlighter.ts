// The ONE syntax highlighter for rendered code (chat code blocks, previews,
// diff renderers) — Shiki 4 with the JavaScript regex engine (no WASM fetch,
// no cold start) and fine-grained bundles: the core, two themes, and each
// language grammar as its own lazily-imported chunk, loaded the first time a
// block in that language renders.
//
// Themes: VS Code "Dark+" / "Light+" — the same palettes the Monaco editor in
// /code uses, so a snippet looks the same in chat and in the editor — plus
// the Darcula-inspired JSON palette (JSON_SYNTAX_COLORS) layered on as JSON
// scopes, so JSON keeps its established look.
//
// Import this module only through `import()` (useHighlightedLines does) so
// Shiki never enters a caller's initial chunk.

import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledLanguages, bundledLanguagesAlias } from "shiki/langs";
import type { ThemeRegistration } from "shiki/core";
import { JSON_SYNTAX_COLORS } from "@/features/code-editor/config/syntax-themes";

export const SHIKI_THEME = { light: "matrx-light", dark: "matrx-dark" } as const;

/** Languages Shiki renders without a grammar. */
const PLAIN_LANGUAGES = new Set(["text", "plaintext", "plain", "txt", ""]);

/** Our fence spellings that Shiki names differently. */
const LANGUAGE_ALIASES: Record<string, string> = {
  react: "tsx",
  shell: "shellscript",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  console: "shellsession",
  terminal: "shellsession",
  golang: "go",
  "c#": "csharp",
  "c++": "cpp",
  plaintext: "text",
  vue: "vue",
  jsonc: "jsonc",
  json5: "json5",
};

function jsonScopes(palette: (typeof JSON_SYNTAX_COLORS)["dark"]) {
  return [
    {
      scope: ["support.type.property-name.json"],
      settings: { foreground: palette.key },
    },
    {
      scope: ["string.quoted.double.json", "string.json"],
      settings: { foreground: palette.string },
    },
    {
      scope: ["constant.numeric.json"],
      settings: { foreground: palette.number },
    },
    {
      scope: ["constant.language.json"],
      settings: { foreground: palette.boolean },
    },
    {
      scope: [
        "punctuation.separator.dictionary.key-value.json",
        "punctuation.separator.dictionary.pair.json",
        "punctuation.separator.array.json",
        "punctuation.definition.dictionary.begin.json",
        "punctuation.definition.dictionary.end.json",
        "punctuation.definition.array.begin.json",
        "punctuation.definition.array.end.json",
      ],
      settings: { foreground: palette.punctuation },
    },
  ];
}

async function loadTheme(
  base: Promise<{ default: ThemeRegistration }>,
  name: string,
  palette: (typeof JSON_SYNTAX_COLORS)["dark"],
): Promise<ThemeRegistration> {
  const theme = (await base).default;
  return {
    ...theme,
    name,
    tokenColors: [
      ...(theme.tokenColors ?? theme.settings ?? []),
      ...jsonScopes(palette),
    ],
    settings: undefined,
  };
}

let highlighterPromise: Promise<HighlighterCore> | null = null;

/** The shared highlighter (created once, on first use). */
export function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      engine: createJavaScriptRegexEngine({ forgiving: true }),
      themes: [
        loadTheme(
          import("@shikijs/themes/light-plus"),
          SHIKI_THEME.light,
          JSON_SYNTAX_COLORS.light,
        ),
        loadTheme(
          import("@shikijs/themes/dark-plus"),
          SHIKI_THEME.dark,
          JSON_SYNTAX_COLORS.dark,
        ),
      ],
      langs: [],
    }).catch((error: unknown) => {
      highlighterPromise = null;
      throw error;
    });
  }
  return highlighterPromise;
}

/**
 * The Shiki language id for a fence language, or "text" when Shiki has no
 * grammar for it (the block then renders as plain, readable text).
 */
export function resolveShikiLanguage(raw: string | undefined | null): string {
  const lower = (raw ?? "").trim().toLowerCase();
  if (PLAIN_LANGUAGES.has(lower)) return "text";
  const aliased = LANGUAGE_ALIASES[lower] ?? lower;
  if (aliased in bundledLanguages) return aliased;
  const canonical = (bundledLanguagesAlias as Record<string, unknown>)[aliased];
  if (canonical) return aliased;
  return "text";
}

const loading = new Map<string, Promise<void>>();

/** Load a language grammar into the shared highlighter (once). */
export async function ensureLanguage(
  highlighter: HighlighterCore,
  language: string,
): Promise<void> {
  if (language === "text") return;
  if (highlighter.getLoadedLanguages().includes(language)) return;
  let pending = loading.get(language);
  if (!pending) {
    const importer = (bundledLanguages as Record<string, () => Promise<unknown>>)[
      language
    ];
    if (!importer) return;
    pending = importer()
      .then((mod) =>
        highlighter.loadLanguage(
          (mod as { default: Parameters<HighlighterCore["loadLanguage"]>[0] })
            .default,
        ),
      )
      .catch((error: unknown) => {
        loading.delete(language);
        throw error;
      });
    loading.set(language, pending);
  }
  await pending;
}
