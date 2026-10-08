"use client";

/**
 * Notifications as a canvas tab — the bell's canonical `BellPanel` in the
 * right-hand column. The header bell toggles it and opens it in a pane BELOW
 * whatever the canvas is showing (a vertical split), so the inbox sits under
 * the work instead of over it. One tab: a second press closes it.
 */

import { Bell } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import { useToolToggle } from "@/features/canvas/host/toolCanvas";

export const NOTIFICATIONS_KIND = "notifications";
const TITLE = "Notifications";

export const notificationsKind = defineCanvasKind<null>({
  id: NOTIFICATIONS_KIND,
  surface: "dom",
  label: TITLE,
  icon: Bell,
  load: () => import("./NotificationsCanvasView"),
  restore: true,
  // While the canvas shows something, the inbox opens in a pane BELOW it (the 70/30 split).
  preferredTarget: "split-down",
  launcher: { key: "default", data: null, title: TITLE },
});

/** The bell's press and pressed state: toggle-or-focus; a new tab opens below (the kind's `preferredTarget`). */
export function useNotificationsToggle() {
  return useToolToggle({ kind: NOTIFICATIONS_KIND, title: TITLE, data: null });
}
