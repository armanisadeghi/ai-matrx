"use client";

import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Resolve a lowercase icon name (as stored in ctx_scope_types.icon) to a
 * Lucide component. Falls back to Folder on miss. Names are stored kebab/
 * snake/space-cased and mapped to the PascalCase Lucide export.
 */
export function resolveIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Icons.Folder;
  const pascal = name
    .split(/[-_\s]/)
    .map((p) => (p.length ? p[0].toUpperCase() + p.slice(1) : ""))
    .join("");
  const found = (Icons as unknown as Record<string, LucideIcon>)[pascal];
  return found ?? Icons.Folder;
}
