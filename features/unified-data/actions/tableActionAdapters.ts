// features/unified-data/actions/tableActionAdapters.ts
//
// THE TWO matrx-frontend RENDERERS of a record-store table's ONE action list.
//
// The list itself is `tableActions({ table, rights, host })` in
// `@ai-matrx/records-ui` (lane TABLE-ACTIONS, v6 lane 1): one fixed order, and
// rights or a missing host handler change only `disabledReason`. These adapters
// are pure functions of that array and may not add, drop or reorder an entry —
// G1 (`__tests__/one-table-action-list-every-renderer-draws-the-same.test.ts`)
// holds them, and the package's own header ⋯ renderer, to the same ids.
//
//   toItemMenuConfig — the list shell's row ⋯ / cards / `ItemContextMenu`
//                      (`EntityRowActions.menuFor` returns this shape).
//   toExtraSections  — context-menu v3 `extraSections`, through the one
//                      existing converter (`itemMenuConfigToExtraSections`), so
//                      toast/promise handling and the disabled-reason line are
//                      the same as every other ItemMenu-backed right-click.
//
// Shape copied from `features/agents/browse/agentActionRegistry.tsx` (sections
// per group, disabled entries stay visible with their reason).

import {
  Archive,
  ArchiveRestore,
  Bell,
  Blocks,
  CalendarClock,
  Columns3,
  Copy,
  DoorOpen,
  Download,
  ExternalLink,
  FileText,
  FolderInput,
  FolderOpen,
  GitMerge,
  History,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Link,
  Link2,
  ListChecks,
  Pencil,
  Settings,
  Share2,
  Star,
  StarOff,
  Upload,
  type LucideIcon,
} from "lucide-react";
import {
  groupObjectActions,
  type ObjectAction,
  type ObjectActionIcon,
} from "@ai-matrx/records-ui/object-actions";
import type {
  ItemMenuCommand,
  ItemMenuConfig,
  ItemMenuSection,
} from "@ai-matrx/chat/ui/item-types";
import { itemMenuConfigToExtraSections } from "@/features/context-menu-v3/item/itemMenuToV3";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";

/** Every icon name the registry can hand out. Exhaustive: a new name fails typecheck here. */
export const OBJECT_ACTION_ICONS: Record<ObjectActionIcon, LucideIcon> = {
  "folder-open": FolderOpen,
  "external-link": ExternalLink,
  link: Link,
  pencil: Pencil,
  copy: Copy,
  "folder-input": FolderInput,
  star: Star,
  "star-off": StarOff,
  "share-2": Share2,
  download: Download,
  upload: Upload,
  "columns-3": Columns3,
  settings: Settings,
  history: History,
  blocks: Blocks,
  "file-text": FileText,
  "calendar-clock": CalendarClock,
  "list-checks": ListChecks,
  bell: Bell,
  "door-open": DoorOpen,
  inbox: Inbox,
  "layout-dashboard": LayoutDashboard,
  "archive-restore": ArchiveRestore,
  archive: Archive,
  "link-2": Link2,
  "layout-grid": LayoutGrid,
  "git-merge": GitMerge,
};

function toCommand(action: ObjectAction): ItemMenuCommand {
  const disabled = action.disabledReason !== undefined;
  return {
    id: action.id,
    label: action.label,
    icon: OBJECT_ACTION_ICONS[action.icon],
    onSelect: () => action.run(),
    ...(disabled ? { disabled: true, disabledReason: action.disabledReason } : {}),
    ...(action.destructive ? { tone: "destructive" as const } : {}),
    ...(action.shortcut ? { shortcut: action.shortcut } : {}),
  };
}

/** The list shell's row menu (kebab, card, `ItemContextMenu`). */
export function toItemMenuConfig(actions: readonly ObjectAction[]): ItemMenuConfig {
  const sections: ItemMenuSection[] = groupObjectActions(actions).map(({ group, actions: inGroup }) =>
    group.submenu
      ? {
          id: group.id,
          items: [
            {
              kind: "submenu",
              id: group.id,
              label: group.label ?? group.id,
              icon: group.icon ? OBJECT_ACTION_ICONS[group.icon] : undefined,
              sections: [{ id: `${group.id}:items`, items: inGroup.map(toCommand) }],
            },
          ],
        }
      : { id: group.id, items: inGroup.map(toCommand) },
  );
  return { sections };
}

/** Context-menu v3 `extraSections` for a right-click on a table. */
export function toExtraSections(actions: readonly ObjectAction[]): ContextMenuExtraSection[] {
  return itemMenuConfigToExtraSections(toItemMenuConfig(actions));
}

/** The action ids an `ItemMenuConfig` draws, in order (submenus flattened) — what G1 compares. */
export function itemMenuActionIds(config: ItemMenuConfig): string[] {
  return config.sections.flatMap((section) =>
    section.items.flatMap((entry) =>
      entry.kind === "submenu"
        ? entry.sections.flatMap((s) => s.items.map((i) => i.id))
        : [entry.id],
    ),
  );
}

/** The action ids v3 extra sections draw, in order (submenus flattened, separators skipped). */
export function extraSectionActionIds(sections: readonly ContextMenuExtraSection[]): string[] {
  const walk = (items: ContextMenuExtraSection["items"]): string[] =>
    items.flatMap((item) =>
      item.kind === "separator" ? [] : item.kind === "submenu" ? walk(item.children) : [item.id],
    );
  return sections.flatMap((s) => walk(s.items));
}
