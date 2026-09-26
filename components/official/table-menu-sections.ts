// The canonical table's NEUTRAL menu sections, drawn in the app's one
// right-click menu (context-menu-v3).
//
// `@ai-matrx/design-system` answers plain `MatrxTableMenuSection`s for the
// level a person right-clicked (cell / row / column header / selection /
// table) and names icons by lucide id so the package ships no icon library.
// This module is the whole translation: section -> `ContextMenuExtraSection`,
// icon name -> lucide glyph. Pure, no React state.

import {
  ArrowDownAZ,
  ArrowDownToLine,
  ArrowUpAZ,
  ArrowUpDown,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eraser,
  EyeOff,
  Filter,
  History,
  Link,
  Paintbrush,
  Palette,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  Scissors,
  Settings2,
  Sigma,
  Tag,
  Trash2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type {
  MatrxTableMenuIconName,
  MatrxTableMenuItem,
  MatrxTableMenuSection,
} from "@ai-matrx/design-system/data-table/menu-targets";
import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";

/**
 * Every name the package may send. Typed as a full Record so a name the
 * package adds without a glyph here fails the type-check instead of drawing a
 * blank.
 */
export const TABLE_MENU_ICONS: Record<MatrxTableMenuIconName, LucideIcon> = {
  copy: Copy,
  "copy-plus": CopyPlus,
  scissors: Scissors,
  "clipboard-paste": ClipboardPaste,
  eraser: Eraser,
  pencil: Pencil,
  plus: Plus,
  trash: Trash2,
  "eye-off": EyeOff,
  "arrow-up-a-z": ArrowUpAZ,
  "arrow-down-a-z": ArrowDownAZ,
  "arrow-up-down": ArrowUpDown,
  "arrow-down-to-line": ArrowDownToLine,
  palette: Palette,
  paintbrush: Paintbrush,
  "panel-left": PanelLeft,
  "panel-right": PanelRight,
  settings: Settings2,
  sigma: Sigma,
  zap: Zap,
  history: History,
  link: Link,
  tag: Tag,
  filter: Filter,
};

function iconFor(name: MatrxTableMenuIconName | undefined): LucideIcon | undefined {
  return name ? TABLE_MENU_ICONS[name] : undefined;
}

const NOTHING = () => undefined;

function toExtraItem(item: MatrxTableMenuItem): ContextMenuExtraItem {
  const icon = iconFor(item.icon);
  const disabled = Boolean(item.disabledReason);
  if (item.submenu && item.submenu.length > 0) {
    return {
      kind: "submenu",
      id: item.id,
      label: item.label,
      ...(icon ? { icon } : {}),
      ...(disabled ? { disabled } : {}),
      children: item.submenu.map(toExtraItem),
    };
  }
  return {
    kind: "item",
    id: item.id,
    label: item.label,
    ...(icon ? { icon } : {}),
    ...(item.shortcut ? { hint: item.shortcut } : {}),
    ...(item.destructive ? { destructive: true } : {}),
    // A disabled row keeps its place and says why; it can never fire, even
    // if a layout forgets to honour `disabled` (the availability rule).
    ...(disabled ? { disabled: true, description: item.disabledReason } : {}),
    onSelect: disabled ? NOTHING : (item.onSelect ?? NOTHING),
  };
}

/** The package's sections as the app menu's extra sections, beside the clipboard. */
export function toContextMenuExtraSections(
  sections: readonly MatrxTableMenuSection[],
): ContextMenuExtraSection[] {
  return sections
    .filter((section) => section.items.length > 0)
    .map((section) => ({
      id: `table-${section.id}`,
      label: section.title,
      anchor: "after-clipboard" as const,
      ...(section.primary ? { primary: true } : {}),
      // The table's own sections first and flat; the site-wide rows under ONE "More…" (lane C).
      foldSiteMenu: true,
      items: section.items.map(toExtraItem),
    }));
}
