import type { Metadata } from "next";

import { LinkValuationWorkspace } from "@/features/marketing/link-valuation/components/LinkValuationWorkspace";
import PageHeader from "@/features/shell/components/header/PageHeader";

export const metadata: Metadata = {
  title: "Backlink Valuation",
  description:
    "Score a candidate backlink on quality, relevance and placement, and price what it is worth paying — every weight, band and dollar point tunable.",
};

export default function BacklinkValuationPage() {
  return (
    <>
      <PageHeader>
        <h1 className="truncate text-sm font-medium text-foreground">
          Backlink Valuation
        </h1>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <LinkValuationWorkspace />
      </div>
    </>
  );
}
