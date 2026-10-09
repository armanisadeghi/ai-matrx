"use client";

import { AppletsAdminList } from "../AppletsAdminList";

// /administration/applets/support — organizations' and people's Applets, for tech support and
// moderation (feature, verify, pause). Never the management page (admin-seat rule, Arman 2026-09-26).
export default function AppletSupportAdminPage() {
  return <AppletsAdminList lane="support" />;
}
