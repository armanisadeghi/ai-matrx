// /administration/education/fastfire-capture-test — admin-only proof surface
// for the Fast Fire audio capture core.
//
// Moved here from `/education/fastfire/capture-test` on 2026-09-26: the page
// gated itself with `selectIsAdmin`, but that gate is ADMIN POWER — true only
// while the current page is inside the `(admin)` route group
// (`state.userAuth.adminLaneOpen`, Arman's 2026-09-25 ruling that admin
// privileges never extend beyond `/administration/**`). A normal `(core)`
// education page can never open that lane, so the surface showed
// "admin-only development surface" to every visitor, including super admins —
// a permanently dead control. The surface itself is owner-mandated to be kept
// permanently (see CaptureTestSurface.tsx); the old path now redirects here.
import type { Metadata } from "next";
import { CaptureTestClient } from "@/features/flashcards/fast-fire/capture-test/CaptureTestClient";

export const metadata: Metadata = {
  title: "Fast Fire — Audio Capture Test | Administration",
  robots: { index: false, follow: false },
};

export default function FastFireCaptureTestAdminPage() {
  return (
    <div className="scroll-page-end-space h-full overflow-y-auto">
      <CaptureTestClient />
    </div>
  );
}
