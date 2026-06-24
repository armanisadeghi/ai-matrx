/**
 * icon-resolve — the LEAN, payload-free side of the icon-by-name system.
 *
 * WHAT BELONGS HERE
 * Pure logic and styling helpers that DO NOT need any icon component:
 *   - color helpers (`isHexColor`, `getTextColorClass`)
 *   - name validation / registry queries (`isIconRegisteredSync`,
 *     `isRegisteredOrLucideIconName`, `getCuratedIconIdsForPicker`)
 *
 * WHAT MUST NOT BE ADDED HERE
 * Anything that statically imports `lucide-react`, `react-icons/*`, or returns a
 * rendered icon component. Those live in the heavy `IconResolver.tsx` and must
 * be reached through the `*.dynamic.tsx` front doors. This module is safe to
 * import from anywhere (utils, services, server-eligible code) precisely because
 * it carries ZERO icon payload — keep it that way.
 *
 * WHY
 * `IconResolver.tsx` statically imports ~145 lucide-react icons + ~30
 * react-icons/fc + react-icons/fa6. Importing it just to call a color helper or
 * validate a name dragged that entire payload into the importing chunk — a
 * build-time leak. This module breaks that coupling: logic-only callers import
 * from here and never touch the payload.
 */

import { isLucideModuleIconExport } from "@/utils/icons/lucide-module-icon";
import {
  isMatrxSvgIconValue,
  listMatrxSvgIconValues,
} from "@/utils/icons/matrx-public-svg-registry";
import { staticLucideIconNames, customIconNames } from "./icon-name-registry";

/**
 * Names that have already been resolved (and cached) by the heavy resolver at
 * runtime. The heavy module writes into this set; the lean module only reads it
 * so sync validation can recognize previously-loaded dynamic icons without
 * importing the payload.
 */
const resolvedDynamicNames = new Set<string>();

/** Called by the heavy resolver when it caches a dynamically-loaded icon. */
export function markIconResolved(name: string): void {
  resolvedDynamicNames.add(name);
}

/**
 * Finite list for the curated icon gallery: every statically bundled Lucide
 * name, custom registry id (react-icons), and all `svg:…` public assets.
 *
 * Pure — operates on NAME registries only, never the icon components.
 */
export function getCuratedIconIdsForPicker(): string[] {
  const set = new Set<string>();
  for (const k of staticLucideIconNames) set.add(k);
  for (const k of customIconNames) set.add(k);
  for (const id of listMatrxSvgIconValues()) set.add(id);
  return Array.from(set).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

/**
 * True if this exact name maps to a known icon (static Lucide, custom map, or a
 * dynamic Lucide name previously resolved at runtime).
 *
 * Does not import lucide-react — use with {@link isRegisteredOrLucideIconName}
 * for full checks.
 */
export function isIconRegisteredSync(
  iconName: string | null | undefined,
): boolean {
  if (!iconName || iconName.trim() === "") return false;
  if (customIconNames.has(iconName)) return true;
  if (staticLucideIconNames.has(iconName)) return true;
  return resolvedDynamicNames.has(iconName);
}

/**
 * True if `iconName` is a real icon id: custom/static/cached, an `svg:…` asset,
 * or a Lucide export that is a renderable component type.
 *
 * The lucide check is done via a dynamic `import("lucide-react")` so this module
 * stays payload-free until validation against the full set is actually needed.
 */
export async function isRegisteredOrLucideIconName(
  iconName: string | null | undefined,
): Promise<boolean> {
  if (!iconName || iconName.trim() === "") return false;
  if (isMatrxSvgIconValue(iconName)) return true;
  if (isIconRegisteredSync(iconName)) return true;
  try {
    const iconModule = await import("lucide-react");
    const Exported = iconModule[iconName as keyof typeof iconModule];
    return isLucideModuleIconExport(iconName, Exported);
  } catch {
    return false;
  }
}

/** Utility to detect if a string is a hex color code. */
export const isHexColor = (color: string): boolean => {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
};

export const getTextColorClass = (color?: string) => {
  if (!color) return "text-gray-600 dark:text-gray-400";

  // If it's a hex color, return null (caller uses inline styles instead).
  if (isHexColor(color)) return null;

  const colorMap: Record<string, string> = {
    gray: "text-gray-600 dark:text-gray-400",
    rose: "text-rose-600 dark:text-rose-400",
    blue: "text-blue-600 dark:text-blue-400",
    amber: "text-amber-600 dark:text-amber-400",
    cyan: "text-cyan-600 dark:text-cyan-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    fuchsia: "text-fuchsia-600 dark:text-fuchsia-400",
    green: "text-green-600 dark:text-green-400",
    indigo: "text-indigo-600 dark:text-indigo-400",
    lime: "text-lime-600 dark:text-lime-400",
    neutral: "text-neutral-600 dark:text-neutral-400",
    orange: "text-orange-600 dark:text-orange-400",
    pink: "text-pink-600 dark:text-pink-400",
    purple: "text-purple-600 dark:text-purple-400",
    red: "text-red-600 dark:text-red-400",
    sky: "text-sky-600 dark:text-sky-400",
    slate: "text-slate-600 dark:text-slate-400",
    stone: "text-stone-600 dark:text-stone-400",
    teal: "text-teal-600 dark:text-teal-400",
    violet: "text-violet-600 dark:text-violet-400",
    yellow: "text-yellow-600 dark:text-yellow-400",
    zinc: "text-zinc-600 dark:text-zinc-400",
  };

  return colorMap[color.toLowerCase()] || "text-gray-600 dark:text-gray-400";
};
