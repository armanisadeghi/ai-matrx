"use client";

/** The body of the Notifications canvas tab — the pane header is its chrome. */

import { BellPanel } from "../components/BellPanel";

export default function NotificationsCanvasView() {
  return <BellPanel variant="pane" className="h-full bg-textured" />;
}
