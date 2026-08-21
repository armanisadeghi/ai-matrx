// app/(core)/masterwork/approaches/page.tsx
//
// The standing catalog of Distillation Approaches. Before this route the only
// way to meet an Approach was to be mid-task inside a funnel — so an Approach
// that existed could still be invisible (Arman, 2026-08-21). One URL, every
// Approach, honest status.

import type { Metadata } from "next";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ApproachCatalogPage } from "@/features/masterwork/browse/ApproachCatalogPage";

export const metadata: Metadata = {
  title: "Ways to build a Rulebook | Masterwork",
  description:
    "Every way to turn what you know into rules — talking, documents, examples, your AI chats, and more.",
};

export default function ApproachesRoute() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-0 p-0">
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Ways to build a Rulebook
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto">
        <ApproachCatalogPage />
      </div>
    </>
  );
}
