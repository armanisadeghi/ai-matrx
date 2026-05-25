import type { Metadata } from "next";
import { QuickListsManager } from "@/features/lists-quick/QuickListsManager";

export const metadata: Metadata = {
  title: "Lists",
  description:
    "Create and manage picklists — fast, inline editing for dropdowns, grouped options, and reusable option sets.",
};

export default function ListsPage() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
      <QuickListsManager />
    </div>
  );
}
