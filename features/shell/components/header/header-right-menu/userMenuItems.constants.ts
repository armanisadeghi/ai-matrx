import type { OverlayId } from "@/features/overlays/catalogue";
import type { QuickToolKind } from "@/features/canvas/host/quickToolLaunchers";
import type { MenuIconKey } from "./menuIconRegistry";

interface MenuItemConfigBase {
  icon: MenuIconKey;
  label: string;
  className?: string;
  /**
   * `true` means the item requires a signed-in user. The guest menu renders
   * the same item but routes the click through `AuthGateDialog` instead of
   * dispatching the overlay. `false` means the item is fully functional for
   * unauthenticated visitors (e.g. theme toggle, local preferences, public
   * announcements, feedback).
   */
  requiresAuth: boolean;
  /**
   * Rendered inside `AuthGateDialog` underneath the headline when a guest
   * clicks the item. One sentence — concretely what unlocks once they sign
   * up. Required when `requiresAuth` is true; ignored otherwise.
   */
  guestDescription?: string;
}

/** A menu row that opens a window or dialog. */
export interface OverlayMenuItemConfig extends MenuItemConfigBase {
  overlayId: OverlayId;
}

/** A menu row that opens a tool as a canvas tab. */
export interface CanvasToolMenuItemConfig extends MenuItemConfigBase {
  canvasTool: QuickToolKind;
}

export type QuickAccessItemConfig = OverlayMenuItemConfig | CanvasToolMenuItemConfig;

export const QUICK_ACCESS_ITEMS: QuickAccessItemConfig[] = [
  {
    canvasTool: "global-scratchpad",
    icon: "NotebookPen",
    label: "Scratchpad",
    requiresAuth: true,
    guestDescription:
      "Your always-there notepad. Scribble anywhere; agents can read it for context but never touch it.",
  },
  {
    canvasTool: "quick-notes",
    icon: "StickyNote",
    label: "Quick Note",
    requiresAuth: true,
    guestDescription:
      "Capture a thought from anywhere, search every note instantly, pull into chat or agents on demand.",
  },
  {
    canvasTool: "quick-tasks",
    icon: "CheckSquare",
    label: "Quick Task",
    requiresAuth: true,
    guestDescription:
      "Capture work, assign it to yourself or an agent, watch it run. Tasks become workflows your team owns.",
  },
  {
    canvasTool: "quick-chat",
    icon: "MessageSquare",
    label: "Quick Chat",
    requiresAuth: true,
    guestDescription:
      "Chat beside any page. Inherits the context you're working in, saves to your history.",
  },
  {
    canvasTool: "quick-scribe",
    icon: "Mic",
    label: "Quick Scribe",
    requiresAuth: true,
    guestDescription:
      "Capture voice from anywhere — it transcribes and cleans on the fly and auto-attaches to the project you're in.",
  },
  {
    canvasTool: "quick-data",
    icon: "Database",
    label: "Quick Data",
    requiresAuth: true,
    guestDescription:
      "Spin up tables on the fly, build datasets from chat, push results into reports and agents.",
  },
  {
    overlayId: "cloudFilesWindow",
    icon: "FolderOpen",
    label: "Quick Files",
    requiresAuth: true,
    guestDescription:
      "Upload, organize, share, and drop into chat — all from a draggable window over whatever you're doing.",
  },
  {
    overlayId: "quickChatHistory",
    icon: "Gem",
    label: "Chat History",
    requiresAuth: true,
    guestDescription:
      "Every conversation searchable, branchable, replayable. Pick up where you left off across devices.",
  },
  {
    overlayId: "quickUtilities",
    icon: "LayoutGrid",
    label: "Utilities Hub",
    requiresAuth: true,
    guestDescription:
      "A grid of every tool — converters, generators, scrapers, PDF tools — at your fingertips.",
  },
];

export const COMMUNICATION_ITEMS: OverlayMenuItemConfig[] = [
  {
    overlayId: "announcements",
    icon: "Megaphone",
    label: "Announcements",
    requiresAuth: false,
  },
  {
    overlayId: "feedbackDialog",
    icon: "Bug",
    label: "Submit Feedback",
    requiresAuth: false,
  },
];
