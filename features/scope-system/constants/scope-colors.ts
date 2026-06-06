/**
 * Tinted color palette used to render scope-type icon pills.
 * Each entry pairs a tailwind background tint, a text/icon foreground, and a
 * ring tint — all working in both light and dark mode.
 *
 * This is the single source of truth for scope-type colors: the `ScopeColorPicker`
 * iterates exactly this list, so every color a user can pick is guaranteed to
 * resolve here (no silent fallback to a hashed color). The class strings are
 * written as literals on purpose so Tailwind's scanner generates them.
 *
 * If no color is stored, `resolveColor` hashes the scope-type id into a
 * deterministic color so each scope reads distinctly.
 */
export interface ScopeColor {
  key: string;
  /** Human label shown in the picker. */
  label: string;
  /** Solid swatch fill (the dot shown in the picker). */
  swatch: string;
  bg: string;
  fg: string;
  ring: string;
}

export const SCOPE_COLORS: ScopeColor[] = [
  {
    key: "blue",
    label: "Blue",
    swatch: "bg-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    fg: "text-blue-600 dark:text-blue-400",
    ring: "ring-blue-500/20",
  },
  {
    key: "sky",
    label: "Sky",
    swatch: "bg-sky-500",
    bg: "bg-sky-50 dark:bg-sky-950/40",
    fg: "text-sky-600 dark:text-sky-400",
    ring: "ring-sky-500/20",
  },
  {
    key: "cyan",
    label: "Cyan",
    swatch: "bg-cyan-500",
    bg: "bg-cyan-50 dark:bg-cyan-950/40",
    fg: "text-cyan-600 dark:text-cyan-400",
    ring: "ring-cyan-500/20",
  },
  {
    key: "teal",
    label: "Teal",
    swatch: "bg-teal-500",
    bg: "bg-teal-50 dark:bg-teal-950/40",
    fg: "text-teal-600 dark:text-teal-400",
    ring: "ring-teal-500/20",
  },
  {
    key: "emerald",
    label: "Emerald",
    swatch: "bg-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    fg: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/20",
  },
  {
    key: "green",
    label: "Green",
    swatch: "bg-green-500",
    bg: "bg-green-50 dark:bg-green-950/40",
    fg: "text-green-600 dark:text-green-400",
    ring: "ring-green-500/20",
  },
  {
    key: "lime",
    label: "Lime",
    swatch: "bg-lime-500",
    bg: "bg-lime-50 dark:bg-lime-950/40",
    fg: "text-lime-600 dark:text-lime-400",
    ring: "ring-lime-500/20",
  },
  {
    key: "amber",
    label: "Amber",
    swatch: "bg-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    fg: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/20",
  },
  {
    key: "orange",
    label: "Orange",
    swatch: "bg-orange-500",
    bg: "bg-orange-50 dark:bg-orange-950/40",
    fg: "text-orange-600 dark:text-orange-400",
    ring: "ring-orange-500/20",
  },
  {
    key: "red",
    label: "Red",
    swatch: "bg-red-500",
    bg: "bg-red-50 dark:bg-red-950/40",
    fg: "text-red-600 dark:text-red-400",
    ring: "ring-red-500/20",
  },
  {
    key: "rose",
    label: "Rose",
    swatch: "bg-rose-500",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    fg: "text-rose-600 dark:text-rose-400",
    ring: "ring-rose-500/20",
  },
  {
    key: "pink",
    label: "Pink",
    swatch: "bg-pink-500",
    bg: "bg-pink-50 dark:bg-pink-950/40",
    fg: "text-pink-600 dark:text-pink-400",
    ring: "ring-pink-500/20",
  },
  {
    key: "fuchsia",
    label: "Fuchsia",
    swatch: "bg-fuchsia-500",
    bg: "bg-fuchsia-50 dark:bg-fuchsia-950/40",
    fg: "text-fuchsia-600 dark:text-fuchsia-400",
    ring: "ring-fuchsia-500/20",
  },
  {
    key: "violet",
    label: "Violet",
    swatch: "bg-violet-500",
    bg: "bg-violet-50 dark:bg-violet-950/40",
    fg: "text-violet-600 dark:text-violet-400",
    ring: "ring-violet-500/20",
  },
  {
    key: "purple",
    label: "Purple",
    swatch: "bg-purple-500",
    bg: "bg-purple-50 dark:bg-purple-950/40",
    fg: "text-purple-600 dark:text-purple-400",
    ring: "ring-purple-500/20",
  },
  {
    key: "indigo",
    label: "Indigo",
    swatch: "bg-indigo-500",
    bg: "bg-indigo-50 dark:bg-indigo-950/40",
    fg: "text-indigo-600 dark:text-indigo-400",
    ring: "ring-indigo-500/20",
  },
  {
    key: "slate",
    label: "Slate",
    swatch: "bg-slate-500",
    bg: "bg-slate-100 dark:bg-slate-800/50",
    fg: "text-slate-600 dark:text-slate-300",
    ring: "ring-slate-500/20",
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

/** Prefer the stored color key; fall back to a deterministic hash of the id. */
export function resolveColor(scopeType: {
  id: string;
  color?: string | null;
}): ScopeColor {
  if (scopeType.color) {
    const found = SCOPE_COLORS.find((c) => c.key === scopeType.color);
    if (found) return found;
  }
  return pickColorForId(scopeType.id);
}
