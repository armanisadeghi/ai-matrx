// ─────────────────────────────────────────────────────────────────────────
// THE ONE CALLOUT VOCABULARY — GitHub alerts (`> [!NOTE]`), Obsidian callouts
// (`> [!tip]- Title`), MkDocs admonitions (`!!! warning "Title"`) and
// directive containers (`:::caution[Title]`) all resolve to one of these nine
// types and render through one component (callout hast + CalloutIcon).
//
// Environment-neutral, no React. The classes are literal strings so Tailwind
// sees every one of them (never build a class name from a variable).
// ─────────────────────────────────────────────────────────────────────────

export const CALLOUT_TYPES = [
  "note",
  "tip",
  "important",
  "warning",
  "caution",
  "info",
  "success",
  "question",
  "quote",
] as const;

export type CalloutType = (typeof CALLOUT_TYPES)[number];

/**
 * Every spelling the ecosystems use → our type. GitHub's five, Obsidian's
 * set (and its aliases), MkDocs / Docusaurus names. An unknown name is NOT a
 * callout (a blockquote that starts `[!foo]` stays a blockquote).
 */
const ALIASES: Readonly<Record<string, CalloutType>> = {
  note: "note",
  seealso: "note",
  example: "note",
  tip: "tip",
  hint: "tip",
  important: "important",
  warning: "warning",
  warn: "warning",
  attention: "warning",
  caution: "caution",
  danger: "caution",
  error: "caution",
  failure: "caution",
  fail: "caution",
  missing: "caution",
  bug: "caution",
  info: "info",
  abstract: "info",
  summary: "info",
  tldr: "info",
  todo: "info",
  success: "success",
  check: "success",
  done: "success",
  question: "question",
  help: "question",
  faq: "question",
  quote: "quote",
  cite: "quote",
};

export function resolveCalloutType(name: string | undefined | null): CalloutType | null {
  if (!name) return null;
  return ALIASES[name.trim().toLowerCase()] ?? null;
}

export const CALLOUT_LABEL: Readonly<Record<CalloutType, string>> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
  info: "Info",
  success: "Success",
  question: "Question",
  quote: "Quote",
};

/** Frame (border + wash) and title colour per type — light and dark. */
export const CALLOUT_CLASSES: Readonly<Record<CalloutType, { frame: string; title: string }>> = {
  note: {
    frame: "border-blue-500/70 bg-blue-500/5 dark:border-blue-400/70 dark:bg-blue-400/10",
    title: "text-blue-700 dark:text-blue-300",
  },
  tip: {
    frame: "border-emerald-500/70 bg-emerald-500/5 dark:border-emerald-400/70 dark:bg-emerald-400/10",
    title: "text-emerald-700 dark:text-emerald-300",
  },
  important: {
    frame: "border-violet-500/70 bg-violet-500/5 dark:border-violet-400/70 dark:bg-violet-400/10",
    title: "text-violet-700 dark:text-violet-300",
  },
  warning: {
    frame: "border-amber-500/80 bg-amber-500/5 dark:border-amber-400/70 dark:bg-amber-400/10",
    title: "text-amber-700 dark:text-amber-300",
  },
  caution: {
    frame: "border-red-500/70 bg-red-500/5 dark:border-red-400/70 dark:bg-red-400/10",
    title: "text-red-700 dark:text-red-300",
  },
  info: {
    frame: "border-sky-500/70 bg-sky-500/5 dark:border-sky-400/70 dark:bg-sky-400/10",
    title: "text-sky-700 dark:text-sky-300",
  },
  success: {
    frame: "border-green-600/70 bg-green-600/5 dark:border-green-400/70 dark:bg-green-400/10",
    title: "text-green-700 dark:text-green-300",
  },
  question: {
    frame: "border-indigo-500/70 bg-indigo-500/5 dark:border-indigo-400/70 dark:bg-indigo-400/10",
    title: "text-indigo-700 dark:text-indigo-300",
  },
  quote: {
    frame: "border-zinc-400/80 bg-zinc-500/5 dark:border-zinc-500/80 dark:bg-zinc-400/10",
    title: "text-zinc-600 dark:text-zinc-300",
  },
};
