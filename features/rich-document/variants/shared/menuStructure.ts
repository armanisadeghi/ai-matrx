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
  GitCompareArrows,
  MessagesSquare,
  BrainCircuit,
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
/**
 * The AI section's label. Hosts that carry the agent-shortcut libraries (AI
 * Actions, Agents, Content Blocks, My Items, Org Items — the context-menu v3
 * placements) and ProTextarea's bound agents fold them INTO this submenu, so
 * there is one AI family in every menu, never a parallel one.
 */
export const AI_SUBMENU_LABEL = "Improve with AI";

export const MENU_STRUCTURE: MenuSection[] = [
  {
    // The doors a reader must see without scrolling or guessing (defect D6:
    // "Add to Rulebook" once sat twenty rows below the fold and read as
    // missing). Every family of near-identical variants is ONE submenu row.
    submenu: null,
    actionIds: [
      // A bar's primary buttons, for the menu-only hosts that have no bar
      // (icon-only, menu variant). A menu under a bar never lists them.
      "thumbs-up",
      "thumbs-down",
      "tts-play",
      "continue-in-chat",
      "add-to-rulebook",
      "save-to-task",
      "copy",
      "pin-message",
      "save-to-notes",
      "summarize-and-listen",
      "summarize-for-listening",
      "convert-to-study",
    ],
  },
  {
    // Review-and-apply AI powers (a text field promotes these to the top —
    // RegistryActionList; a document keeps them one row deep).
    submenu: AI_SUBMENU_LABEL,
    icon: BrainCircuit,
    actionIds: ["text-cleanup", "text-help", "text-custom-agent"],
  },
  {
    submenu: "Save as",
    icon: Save,
    actionIds: [
      "save-as-message-template",
      "save-as-flashcard",
      "save-table-as-data",
      "save-to-scratch",
      "add-to-docs",
      "save-as-file",
      "save-to-code",
      "save-to-files",
      "save-code-to-scratch",
      "save-as-pdf",
      "save-shape-instance",
      "save-to-contact",
      "set-context-value",
    ],
  },
  {
    submenu: "Copy as",
    icon: Copy,
    actionIds: [
      "copy-markdown",
      "copy-plain-text",
      "copy-rich-text",
      "copy-google-docs",
      "copy-word",
      "copy-with-thinking",
      "copy-table-tsv",
      "copy-table-csv",
      "copy-html-source",
      "copy-html-page",
    ],
  },
  {
    submenu: "Share & export",
    icon: Share2,
    actionIds: [
      "html-preview",
      "share-webpage",
      "send-google-doc",
      "email-to-me",
      "download-pdf",
      "download-docx",
      "download-html",
      "print",
      "full-print",
      // RC-B9 — the WHOLE conversation, not just this message.
      "export-conversation-md",
      "export-conversation-pdf",
      "export-conversation-docx",
      "export-conversation-html",
      "convert-to-broker",
    ],
  },
  {
    submenu: "Ask in chat",
    icon: MessagesSquare,
    actionIds: ["ask-followup", "quote-into-chat"],
  },
  {
    submenu: "Compare",
    icon: GitCompareArrows,
    actionIds: [
      "compare-with-clipboard",
      "set-compare-base",
      "compare-with-base",
    ],
  },
  {
    submenu: "Edit",
    icon: Edit,
    actionIds: [
      "regenerate-response",
      "regenerate-latest",
      "edit",
      "edit-and-resubmit",
      "open-fullscreen-editor",
      "edit-history",
      "fork-at-message",
      "fork-and-regenerate",
      "delete-message",
    ],
  },
  {
    submenu: "Creator tools",
    icon: BarChart3,
    actionIds: ["analyze-response", "debug-stream"],
  },
  {
    submenu: "Server API (test)",
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
/**
 * Actions that are the SAME act under two ids (a bar's shortcut and the menu
 * row). When both are present in one menu, only the canonical row renders —
 * "Regenerate answer" appeared twice in the right-click (RC-B6 round 2).
 */
const MENU_ALIASES: Record<string, string> = {
  "regenerate-latest": "regenerate-response",
};

export function buildMenuTree(input: RichDocumentAction[]): MenuTree {
  const present = new Set(input.map((a) => a.id));
  const actions = input.filter((a) => {
    const canonical = MENU_ALIASES[a.id];
    return !(canonical && present.has(canonical));
  });
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

/**
 * THE ONE selector of which registry actions a MENU shows (every host: ⋯,
 * right-click, ProTextarea "…", the mobile sheet). A bar's primary buttons
 * stay on the bar; a menu carries the overflow set. One selector is what
 * keeps every host's tree identical (guard: __tests__/oneMenuTree.test.ts).
 */
export function registryMenuActions(actions: RichDocumentAction[]): RichDocumentAction[] {
  return actions.filter((a) => (a.renderSlot ?? "overflow") !== "primary");
}

/**
 * The AI submenu, guaranteed present when a host has its own AI rows to fold
 * in (a ProTextarea's bound agents, the v3 agent-shortcut libraries), at the
 * position MENU_STRUCTURE gives it — so no host ever grows a second AI family.
 */
export function withAiSlot(
  submenus: MenuSubmenuNode[],
  hasSlot: boolean,
): MenuSubmenuNode[] {
  if (!hasSlot || submenus.some((s) => s.label === AI_SUBMENU_LABEL)) return submenus;
  const ai: MenuSubmenuNode = {
    label: AI_SUBMENU_LABEL,
    icon: MENU_STRUCTURE.find((s) => s.submenu === AI_SUBMENU_LABEL)?.icon,
    actions: [],
  };
  // MENU_STRUCTURE lists the AI section first among the submenus.
  return [ai, ...submenus];
}

/** The tree as an ordered id list — what the one-tree guard compares. */
export function flattenMenuTreeIds(tree: MenuTree): string[] {
  return [
    ...tree.topLevel.map((a) => a.id),
    ...tree.submenus.flatMap((s) => [`submenu:${s.label}`, ...s.actions.map((a) => a.id)]),
    ...tree.extras.map((a) => a.id),
  ];
}
