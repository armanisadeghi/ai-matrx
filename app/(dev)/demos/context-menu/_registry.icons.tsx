"use client";

import type { LucideIcon } from "lucide-react";
import {
  FlaskConical,
  GitCompareArrows,
  LayoutGrid,
  Microscope,
} from "lucide-react";
import type { ContextMenuIconKey } from "./_registry";

export const CONTEXT_MENU_ICONS: Record<ContextMenuIconKey, LucideIcon> = {
  "git-compare-arrows": GitCompareArrows,
  microscope: Microscope,
  "layout-grid": LayoutGrid,
  "flask-conical": FlaskConical,
};

export function getContextMenuIcon(key: ContextMenuIconKey): LucideIcon {
  return CONTEXT_MENU_ICONS[key];
}
