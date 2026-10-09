"use client";

import { AppletsAdminList } from "../AppletsAdminList";

// /administration/applets/all — the platform's own (system) Applets. Management only (admin-seat
// rule, Arman 2026-09-26); organizations' and people's Applets live at /administration/applets/support.
export default function SystemAppletsAdminPage() {
  return <AppletsAdminList lane="system" />;
}
