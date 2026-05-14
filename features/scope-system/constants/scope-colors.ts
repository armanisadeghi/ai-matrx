/**
 * Tinted color palette used to render scope-type icon pills.
 * Each entry pairs a tailwind background tint and a text/icon foreground
 * that works in both light and dark mode.
 *
 * Color picker in AddScopeModal lets users override; otherwise we hash the
 * scope-type id into a deterministic color so each scope reads distinctly.
 */
export interface ScopeColor {
  key: string;
  bg: string;
  fg: string;
  ring: string;
}

export const SCOPE_COLORS: ScopeColor[] = [
  {
    key: "teal",
    bg: "bg-teal-50 dark:bg-teal-950/40",
    fg: "text-teal-600 dark:text-teal-400",
    ring: "ring-teal-500/20",
  },
  {
    key: "violet",
    bg: "bg-violet-50 dark:bg-violet-950/40",
    fg: "text-violet-600 dark:text-violet-400",
    ring: "ring-violet-500/20",
  },
  {
    key: "amber",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    fg: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/20",
  },
  {
    key: "sky",
    bg: "bg-sky-50 dark:bg-sky-950/40",
    fg: "text-sky-600 dark:text-sky-400",
    ring: "ring-sky-500/20",
  },
  {
    key: "emerald",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    fg: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/20",
  },
  {
    key: "rose",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    fg: "text-rose-600 dark:text-rose-400",
    ring: "ring-rose-500/20",
  },
  {
    key: "indigo",
    bg: "bg-indigo-50 dark:bg-indigo-950/40",
    fg: "text-indigo-600 dark:text-indigo-400",
    ring: "ring-indigo-500/20",
  },
  {
    key: "purple",
    bg: "bg-purple-50 dark:bg-purple-950/40",
    fg: "text-purple-600 dark:text-purple-400",
    ring: "ring-purple-500/20",
  },
];

export function pickColorForId(id: string): ScopeColor {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return SCOPE_COLORS[Math.abs(hash) % SCOPE_COLORS.length];
}

export function pickColorByKey(key: string | undefined): ScopeColor {
  if (!key) return SCOPE_COLORS[0];
  const found = SCOPE_COLORS.find((c) => c.key === key);
  return found ?? SCOPE_COLORS[0];
}
