import type { Metadata } from "next";
import { PicklistManagerV2 } from "@/features/udt-picklist/PicklistManagerV2";

export const metadata: Metadata = {
  title: "Picklists — v2 (flat table)",
  description:
    "Compact, spreadsheet-style editor for udt_picklists. Inline editing of label, description, help text, group, and icon.",
};

export default function PicklistsV2Page() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
      <PicklistManagerV2 />
    </div>
  );
}
