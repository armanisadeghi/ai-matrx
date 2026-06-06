import { createElement } from "react";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";

interface ScopeGlyphProps {
  /** Stored scope-type icon name (kebab/snake/Pascal — `resolveIcon` normalizes). */
  icon: string | null | undefined;
  className?: string;
}

/**
 * Stable, module-scope wrapper that renders a scope-type's Lucide icon by name.
 * Using `createElement(resolveIcon(...))` (instead of `const Icon = resolveIcon(); <Icon/>`)
 * keeps callsites clear of the `react-hooks/static-components` rule while preserving
 * `resolveIcon`'s case-normalization and Folder fallback (so the lowercase `folder`
 * default still renders correctly).
 */
export function ScopeGlyph({ icon, className }: ScopeGlyphProps) {
  return createElement(resolveIcon(icon), { className });
}
