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
}

export const QUICK_ACCESS_ITEMS: OverlayMenuItemConfig[] = [
  { overlayId: "quickNotes", icon: "StickyNote", label: "Quick Note", requiresAuth: true },
  { overlayId: "quickTasks", icon: "CheckSquare", label: "Quick Task", requiresAuth: true },
  { overlayId: "quickChat", icon: "MessageSquare", label: "Quick Chat", requiresAuth: true },
  { overlayId: "quickData", icon: "Database", label: "Quick Data", requiresAuth: true },
  { overlayId: "cloudFilesWindow", icon: "FolderOpen", label: "Quick Files", requiresAuth: true },
  { overlayId: "quickChatHistory", icon: "Gem", label: "Chat History", requiresAuth: true },
  { overlayId: "quickUtilities", icon: "LayoutGrid", label: "Utilities Hub", requiresAuth: true },
];

export const COMMUNICATION_ITEMS: OverlayMenuItemConfig[] = [
  { overlayId: "announcements", icon: "Megaphone", label: "Announcements", requiresAuth: false },
  { overlayId: "feedbackDialog", icon: "Bug", label: "Submit Feedback", requiresAuth: false },
];

export const SETTINGS_ITEMS: OverlayMenuItemConfig[] = [
  { overlayId: "userPreferences", icon: "Settings", label: "Preferences", requiresAuth: false },
];
