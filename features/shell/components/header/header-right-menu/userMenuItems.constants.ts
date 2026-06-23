import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";
import type { MenuIconKey } from "./menuIconRegistry";

export interface OverlayMenuItemConfig {
  overlayId: OverlayId;
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

export const QUICK_ACCESS_ITEMS: OverlayMenuItemConfig[] = [
  {
    overlayId: "quickNotes",
    icon: "StickyNote",
    label: "Quick Note",
    requiresAuth: true,
    guestDescription:
      "Capture a thought from anywhere, search every note instantly, pull into chat or agents on demand.",
  },
  {
    overlayId: "quickTasks",
    icon: "CheckSquare",
    label: "Quick Task",
    requiresAuth: true,
    guestDescription:
      "Capture work, assign it to yourself or an agent, watch it run. Tasks become workflows your team owns.",
  },
  {
    overlayId: "quickChat",
    icon: "MessageSquare",
    label: "Quick Chat",
    requiresAuth: true,
    guestDescription:
      "Pop-over chat from any page. Inherits the context you're working in, saves to your history.",
  },
  {
    overlayId: "quickScribe",
    icon: "Mic",
    label: "Quick Scribe",
    requiresAuth: true,
    guestDescription:
      "Capture voice from anywhere — it transcribes and cleans on the fly and auto-attaches to the project you're in.",
  },
  {
    overlayId: "quickData",
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
  { overlayId: "announcements", icon: "Megaphone", label: "Announcements", requiresAuth: false },
  { overlayId: "feedbackDialog", icon: "Bug", label: "Submit Feedback", requiresAuth: false },
];

export const SETTINGS_ITEMS: OverlayMenuItemConfig[] = [
  { overlayId: "userPreferences", icon: "Settings", label: "Preferences", requiresAuth: false },
  { overlayId: "audioDevices", icon: "Mic", label: "Audio devices", requiresAuth: false },
];
