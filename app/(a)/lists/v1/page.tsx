import type { Metadata } from "next";
import { PicklistManagerV1Client } from "@/features/udt-picklist/PicklistManagerV1Client";

export const metadata: Metadata = {
  title: "Picklists — v1 (sidebar + spreadsheet)",
  description:
    "Sidebar-based picklist editor for udt_picklists. Group-aware spreadsheet body with undo on destructive actions.",
};

export default function PicklistsV1Page() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-hidden p-4">
      <PicklistManagerV1Client />
    </div>
  );
}
