// /education/fastfire/capture-test — moved to the admin lane 2026-09-26.
//
// The surface (real-audio capture proof, owner-mandated to be kept
// permanently) gates on `selectIsAdmin`, which is ADMIN POWER: true only
// inside the `(admin)` route group (Arman's 2026-09-25 ruling — admin
// privileges never extend beyond `/administration/**`). Living under
// `(core)/education` it could never open that lane, so every visitor,
// including super admins, permanently saw "admin-only development surface."
// The real page now lives at /administration/education/fastfire-capture-test;
// this old path redirects there so existing links (the flashcards admin map)
// keep working.
import { redirect } from "next/navigation";

export default function FastFireCaptureTestRedirect() {
  redirect("/administration/education/fastfire-capture-test");
}
