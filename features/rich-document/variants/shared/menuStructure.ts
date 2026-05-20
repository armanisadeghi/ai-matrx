// features/rich-document/variants/shared/menuStructure.ts
//
// Presentation-only menu hierarchy. Maps action IDs into a two-level tree:
// a flat set of promoted top-level items + named submenus. This is a VIEW
// concern — the action registry doesn't know or care about it, so the menu
// can be reorganized here without touching a single handler.
//
// Both the desktop dropdown (OverflowMenu) and the mobile drawer
// (MobileActionDrawer) and the context menu (R2.4) render from the same
// `buildMenuTree` output, so the hierarchy stays consistent everywhere.

import {
  Save,
  Copy,
  Share2,
  Edit,
  BarChart3,
  Shield,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { RichDocumentAction } from "../../types";

export interface MenuSection {
  /** Submenu label, or null for the promoted top-level group. */
  submenu: string | null;
  /** Icon for the submenu trigger (ignored for the top-level group). */
  icon?: LucideIcon;
  /** Action IDs in this section, in intended display order. */
  actionIds: string[];
}

/**
 * The canonical menu layout. Order here = render order. Action IDs not
 * listed in any section are treated as `extra` (consumer-supplied) and
 * rendered in a trailing group.
 */
export const MENU_STRUCTURE: MenuSection[] = [
  {
    submenu: null,
    actionIds: [
      "copy",
      "save-to-notes",
      "save-to-task",
      "open-fullscreen-editor",
    ],
  },
  {
    submenu: "Save",
    icon: Save,
    actionIds: [
      "save-to-scratch",
      "save-to-code",
      "save-code-to-scratch",
      "save-as-file",
    ],
  },
  {
    submenu: "Copy as",
    icon: Copy,
    actionIds: [
      "copy-google-docs",
      "copy-word",
      "copy-with-thinking",
      "copy-html-page",
    ],
  },
  {
    submenu: "Export",
    icon: Share2,
    actionIds: [
      "html-preview",
      "email-to-me",
      "print",
      "full-print",
      "convert-to-broker",
      "add-to-docs",
    ],
  },
  {
    submenu: "Edit",
    icon: Edit,
    actionIds: ["edit", "edit-history", "fork-at-message", "delete-message"],
  },
  {
    submenu: "Creator tools",
    icon: BarChart3,
    actionIds: ["analyze-response", "debug-stream"],
  },
  {
    submenu: "Admin",
    icon: Shield,
    actionIds: [
      "server-api-admin-fork-at",
      "server-api-admin-fork-before",
      "server-api-admin-hide-from-model",
      "server-api-admin-delete-this",
      "server-api-admin-delete-from-here",
      "server-api-admin-delete-dryrun",
      "server-api-admin-replace-with-summary",
      "server-api-admin-restore-compaction",
    ],
  },
  {
    submenu: "App",
    icon: Settings,
    actionIds: ["submit-feedback", "announcements", "preferences"],
  },
];

// Pre-compute the set of all IDs that have an explicit home, so extras are
// cheap to detect.
const PLACED_IDS = new Set<string>(
  MENU_STRUCTURE.flatMap((section) => section.actionIds),
);

export interface MenuSubmenuNode {
  label: string;
  icon?: LucideIcon;
  actions: RichDocumentAction[];
}

export interface MenuTree {
  /** Promoted, always-visible top-level items. */
  topLevel: RichDocumentAction[];
  /** Named submenus, each with ≥1 visible action. */
  submenus: MenuSubmenuNode[];
  /** Consumer-supplied actions not present in MENU_STRUCTURE. */
  extras: RichDocumentAction[];
}

/**
 * Turn a flat list of (already source-filtered, visibility-gated,
 * slot-filtered) actions into the two-level tree the menus render. Empty
 * sections are dropped, so submenus never render with zero items.
 */
export function buildMenuTree(actions: RichDocumentAction[]): MenuTree {
  const byId = new Map<string, RichDocumentAction>();
  for (const action of actions) byId.set(action.id, action);

  let topLevel: RichDocumentAction[] = [];
  const submenus: MenuSubmenuNode[] = [];

  for (const section of MENU_STRUCTURE) {
    const sectionActions = section.actionIds
      .map((id) => byId.get(id))
      .filter((a): a is RichDocumentAction => Boolean(a));
    if (sectionActions.length === 0) continue;
    if (section.submenu === null) {
      topLevel = sectionActions;
    } else {
      submenus.push({
        label: section.submenu,
        icon: section.icon,
        actions: sectionActions,
      });
    }
  }

  const extras = actions.filter((a) => !PLACED_IDS.has(a.id));

  return { topLevel, submenus, extras };
}
