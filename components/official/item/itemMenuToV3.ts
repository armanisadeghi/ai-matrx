/**
 * components/official/item/itemMenuToV3.ts
 *
 * ItemMenuConfig → v3 `extraSections` converter — the bridge that lets
 * `ItemContextMenu` render the ONE universal context menu instead of its own
 * Radix tree. Command/toggle execution reuses `run-entry.ts` (toast.promise
 * parity with the kebab dropdown), checkbox/link map to the dedicated v3 item
 * kinds, and section boundaries/labels carry over. Deliberate deltas from the
 * old bespoke render (documented in FEATURE.md): no in-menu single-key
 * shortcut execution (hints still display) and the header renders as a
 * leading section label instead of a Radix label block.
 */

import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import { runCommand, runToggle } from "./run-entry";
import {
  isCheckbox,
  isLink,
  isSubmenu,
  type ItemMenuConfig,
  type ItemMenuEntry,
  type ItemMenuSection,
} from "./types";

function entryToExtraItem(entry: ItemMenuEntry): ContextMenuExtraItem {
  const description =
    entry.disabled && entry.disabledReason
      ? entry.disabledReason
      : entry.description;

  if (isSubmenu(entry)) {
    return {
      kind: "submenu",
      id: entry.id,
      label: entry.label,
      icon: entry.icon,
      disabled: entry.disabled,
      children: submenuChildren(entry.sections),
    };
  }
  if (isCheckbox(entry)) {
    return {
      kind: "checkbox",
      id: entry.id,
      label: entry.label,
      icon: entry.icon,
      description,
      checked: entry.checked,
      onCheckedChange: (next) => runToggle(entry, next),
      disabled: entry.disabled,
      hint: entry.shortcut ?? entry.shortcutKey?.toUpperCase(),
    };
  }
  if (isLink(entry)) {
    return {
      kind: "link",
      id: entry.id,
      label: entry.label,
      icon: entry.icon,
      description,
      href: entry.href,
      target: entry.target,
      disabled: entry.disabled,
    };
  }
  // command
  return {
    kind: "item",
    id: entry.id,
    label: entry.label,
    icon: entry.icon,
    description,
    destructive: entry.tone === "destructive",
    disabled: entry.disabled,
    hint: entry.shortcut ?? entry.shortcutKey?.toUpperCase(),
    onSelect: () => runCommand(entry),
  };
}

/** Flatten submenu sections into children with separators at boundaries. */
function submenuChildren(sections: ItemMenuSection[]): ContextMenuExtraItem[] {
  const visible = sections
    .map((s) => ({ ...s, items: s.items.filter((e) => !e.hidden) }))
    .filter((s) => s.items.length > 0);
  const out: ContextMenuExtraItem[] = [];
  visible.forEach((section, i) => {
    if (i > 0)
      out.push({
        kind: "separator",
        id: `sep-${section.id ?? section.label ?? i}`,
      });
    out.push(...section.items.map(entryToExtraItem));
  });
  return out;
}

export function itemMenuConfigToExtraSections(
  config: ItemMenuConfig,
): ContextMenuExtraSection[] {
  const sections: ContextMenuExtraSection[] = config.sections
    .map((s, i) => ({
      id: String(s.id ?? s.label ?? `im-${i}`),
      label: s.label,
      anchor: "after-clipboard" as const,
      items: s.items.filter((e) => !e.hidden).map(entryToExtraItem),
    }))
    .filter((s) => s.items.length > 0);

  // Header → leading label on the first section (or its own labeled block).
  const title = config.header?.title;
  if (title && sections.length > 0 && !sections[0].label) {
    sections[0] = { ...sections[0], label: title };
  }
  return sections;
}
