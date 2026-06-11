// features/context-menu-v2/extraSections.ts
//
// The declarative contract a surface wrapper uses to inject its few
// surface-specific items into the canonical Universal Context Menu without
// reimplementing the menu. The core renders these; the wrapper only describes
// them. This is the seam that lets bespoke menus collapse into thin wrappers.

import type { LucideIcon } from "lucide-react";

/** A single injectable menu entry. */
export type ContextMenuExtraItem =
  | {
      kind: "item";
      id: string;
      label: string;
      icon?: LucideIcon;
      /** Optional second line of muted helper text. */
      description?: string;
      onSelect: () => void;
      disabled?: boolean;
      /** Render in destructive (red) styling. */
      destructive?: boolean;
      /** Right-aligned hint (e.g. a keyboard shortcut). */
      hint?: string;
    }
  | {
      kind: "submenu";
      id: string;
      label: string;
      icon?: LucideIcon;
      disabled?: boolean;
      children: ContextMenuExtraItem[];
    }
  | { kind: "separator"; id: string };

/**
 * Where the section is inserted relative to the core sections. The core menu
 * renders, in order: selection header → undo/redo → clipboard/find → compare →
 * [agent placements] → [quick actions] → [admin]. Extra sections slot in at the
 * named anchor (default "compare", i.e. right after the built-in editing block).
 */
export type ExtraSectionAnchor =
  | "after-clipboard"
  | "after-compare"
  | "after-placements";

export interface ContextMenuExtraSection {
  id: string;
  /** Optional label rendered as a muted group heading. */
  label?: string;
  anchor?: ExtraSectionAnchor;
  items: ContextMenuExtraItem[];
}
