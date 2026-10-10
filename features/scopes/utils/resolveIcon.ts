"use client";

import { createElement, type ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { Folder } from "lucide-react";
import { IconResolver, getIconComponent, isIconRegisteredSync } from "@ai-matrx/icons";

/**
 * Resolve a lowercase icon name (as stored in ctx_scope_types.icon) to an icon
 * component. Falls back to Folder on miss. Names are stored kebab/snake/space-cased
 * and mapped to the PascalCase Lucide export.
 *
 * BUNDLE LAW: this module is reachable from the app shell (ChatHostAdapter ->
 * chatContextSources -> ContextTree / ScopeGlyph), so it must NEVER
 * `import * as ... from "lucide-react"` — a namespace import with a dynamic key
 * forces the WHOLE ~1,900-icon set (~500 KB decoded) into every route's first
 * load. Icons in `@ai-matrx/icons`' static map render synchronously (same on
 * server and client); every other name renders the Folder fallback at the SAME
 * size and swaps in once the package's single lazy lucide chunk resolves.
 */
type ScopeIconProps = { className?: string; size?: number | string; style?: React.CSSProperties };

// One stable component per normalized name, so a React tree never remounts an icon.
const byName = new Map<string, LucideIcon>();

function normalize(name: string): string {
  return name
    .split(/[-_\s]/)
    .map((p) => (p.length ? p[0].toUpperCase() + p.slice(1) : ""))
    .join("");
}

function build(pascal: string): LucideIcon {
  const ScopeIcon: ComponentType<ScopeIconProps> = (props) => {
    if (isIconRegisteredSync(pascal)) {
      return createElement(getIconComponent(pascal, "Folder") as ComponentType<ScopeIconProps>, props);
    }
    return createElement(IconResolver, {
      iconName: pascal,
      fallbackIcon: "Folder",
      className: props.className,
      size: typeof props.size === "number" ? props.size : undefined,
      style: props.style,
    });
  };
  ScopeIcon.displayName = `ScopeIcon(${pascal})`;
  return ScopeIcon as unknown as LucideIcon;
}

export function resolveIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Folder;
  const pascal = normalize(name);
  if (!pascal) return Folder;
  let icon = byName.get(pascal);
  if (!icon) {
    icon = build(pascal);
    byName.set(pascal, icon);
  }
  return icon;
}
