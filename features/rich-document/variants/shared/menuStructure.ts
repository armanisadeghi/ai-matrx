// features/rich-document/variants/shared/menuStructure.ts
//
// Presentation-only menu hierarchy. Maps action IDs into a two-level tree:
// a flat set of promoted top-level items + named submenus. This is a VIEW
// concern — the action registry doesn't know or care about it, so the menu
// can be reorganized here without touching a single handler.
//
// Both the desktop dropdown (OverflowMenu) and the mobile drawer
// (the Alchemy package layouts group by the same names — actions/provider.ts
// maps each submenu to a named section) and the context menu (R2.4) render from the same
// `buildMenuTree` output, so the hierarchy stays consistent everywhere.

import {
  Save,
  Copy,
  Share2,
  Edit,
  BarChart3,
  Settings,
  GitCompareArrows,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import type { RichDocumentAction } from "../../types";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { CONVERSATION_TRANSFER_ROWS } from "@/features/agents/conversation-export/conversation-transfer-rows";

export interface MenuSection {
  /** Submenu label, or null for the promoted top-level group. */
  submenu: string | null;
  /** Icon for the submenu trigger (ignored for the top-level group). */
  icon?: LucideIcon;
  /** Action IDs in this section, in intended display order. */
  actionIds: string[];
  /**
   * The category every row of this section takes in the Alchemy layout, which
   * places a section in a group by its rows' category. Set it on a section
   * whose rows mix categories, so the section sits in ONE predictable place.
   */
  layoutCategory?: RichDocumentAction["category"];
  /**
   * In the one menu engine (⋯, right-click, sheet, palette) this section's rows
   * show INLINE, under no heading — the group has no approved name (ALC-15 chair
   * ruling: a heading is a name the classic menus used; otherwise inline). The
   * tree hosts (ProTextarea's "…", the user bubble) still group them under
   * `submenu`.
   */
  inline?: boolean;
  /**
   * The heading names the THING these rows act on ("Conversation": the whole
   * conversation, not the clicked message) — declared to the engine as a target
   * label (`section.kind: "target"`), never a group heading.
   */
  target?: boolean;
}

/**
 * The canonical menu layout. Order here = render order. Action IDs not
 * listed in any section are treated as `extra` (consumer-supplied) and
 * rendered in a trailing group.
 */
/**
 * The AI section's label in the tree hosts — the classic context-menu name
 * "AI Actions" (agent-shortcuts placement label), restored 2026-09-26 over the
 * coined "Improve with AI" (ALC-15 round 3). Hosts that carry the agent-shortcut
 * libraries and ProTextarea's bound agents fold them INTO this group, so there
 * is one AI family in every menu, never a parallel one. In the one menu engine
 * the group is `inline` (no heading), so it never reads "AI Actions › AI Actions".
 */
export const AI_SUBMENU_LABEL = "AI Actions";

/** The whole-conversation section's label (answer menus of chat messages). */
export const CONVERSATION_SUBMENU_LABEL = "Conversation";

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
      // Send THIS message onward — one family, adjacent, no heading (no
      // approved name fits; "Ask in chat" was coined 2026-09-25).
      "send-to-agent",
      // An answer in a "Custom agent…" window goes back into the text it came from.
      "apply-to-source",
      "ask-followup",
      "quote-into-chat",
      "add-to-rulebook",
      "save-to-task",
      "pin-message",
      // The record's Notes & comments dock (present only when it holds something).
      "notes-and-comments",
      "save-to-notes",
      "summarize-and-listen",
      "summarize-for-listening",
    ],
  },
  {
    // Everything that acts on the WHOLE conversation this message belongs to
    // — the same verbs as the chat header's conversation menu, one row deep.
    // Present only when the source carries a conversationId.
    submenu: CONVERSATION_SUBMENU_LABEL,
    icon: MessagesSquare,
    target: true,
    // Its rows mix find/ask/share/edit/export; "save" seats the section in
    // the document group, right after the promoted rows and before "Save".
    layoutCategory: "save",
    actionIds: [
      "conversation-find",
      "conversation-pinned-only",
      "conversation-share",
      "conversation-copy-link",
      "conversation-rename",
      "conversation-duplicate",
      // THE full Alchemy transfer set over the whole conversation (Arman,
      // 2026-09-26) — the catalogue's order, shared with the header menu.
      ...CONVERSATION_TRANSFER_ROWS.map((row) => row.id),
    ],
  },
  {
    // Review-and-apply AI powers (a text field promotes these to the top —
    // RegistryActionList; a document keeps them one row deep).
    submenu: AI_SUBMENU_LABEL,
    icon: AGENT_ICON,
    inline: true,
    actionIds: ["text-cleanup", "text-help", "text-custom-agent"],
  },
  {
    // "Save" — the classic name (e5b8d01229, 2026-05-19); "Save as" was coined 2026-09-24.
    submenu: "Save",
    icon: Save,
    actionIds: [
      "save-as-message-template",
      "save-as-flashcard",
      // Flashcards / quiz from this message — the same family as the row
      // above (folded 2026-09-26 to keep the menu within the 17-row D6 bound).
      "convert-to-study",
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
      // The plain copy leads its own family (it sat as a loose top-level row
      // beside "Copy as › plain text"; folded 2026-09-26 for the D6 bound).
      "copy",
      "copy-markdown",
      "copy-plain-text",
      "copy-rich-text",
      "copy-formatted",
      "copy-with-thinking",
      "copy-table-tsv",
      "copy-table-csv",
      "copy-html-source",
      "copy-html-page",
    ],
  },
  {
    // "Export" — the classic name (e5b8d01229, 2026-05-19); "Share & export" was coined 2026-09-24.
    submenu: "Export",
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
      // This message only — the whole conversation's exports live in the
      // Conversation section.
      "convert-to-broker",
    ],
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
    // Creator/admin power tools, one row: the analysis doors and the
    // server-API test verbs (a separate "Server API (test)" row pushed the
    // admin menu past the 17-row D6 bound).
    submenu: "Creator tools",
    icon: BarChart3,
    actionIds: [
      "analyze-response",
      "debug-stream",
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
    // App doors that act on no content: feedback, and the read-aloud voice
    // setting (the Listen button's settings door; a loose top-level row it
    // was the 18th, below the fold — D6).
    submenu: "App",
    icon: Settings,
    actionIds: ["submit-feedback", "tts-voice-settings"],
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
  // Insert at MENU_STRUCTURE's position: after every present submenu that the
  // structure lists before the AI section (the Conversation section does).
  const order = (label: string) => MENU_STRUCTURE.findIndex((s) => s.submenu === label);
  const aiAt = order(AI_SUBMENU_LABEL);
  const index = submenus.findIndex((s) => {
    const at = order(s.label);
    return at === -1 || at > aiAt;
  });
  if (index === -1) return [...submenus, ai];
  return [...submenus.slice(0, index), ai, ...submenus.slice(index)];
}

/** The tree as an ordered id list — what the one-tree guard compares. */
export function flattenMenuTreeIds(tree: MenuTree): string[] {
  return [
    ...tree.topLevel.map((a) => a.id),
    ...tree.submenus.flatMap((s) => [`submenu:${s.label}`, ...s.actions.map((a) => a.id)]),
    ...tree.extras.map((a) => a.id),
  ];
}
