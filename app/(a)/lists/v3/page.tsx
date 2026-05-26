import type { Metadata } from "next";
import { PicklistManagerV3Client } from "@/features/udt-picklist/PicklistManagerV3Client";

export const metadata: Metadata = {
  title: "Picklists — v3 (document)",
  description:
    "Notion-style document editor for udt_picklists. Inline title/description, items as lines with hover controls, collapsible group sections.",
};

export default function PicklistsV3Page() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
      <PicklistManagerV3Client />
    </div>
  );
}
