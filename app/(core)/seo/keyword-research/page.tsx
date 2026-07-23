import type { Metadata } from "next";

import PageHeader from "@/features/shell/components/header/PageHeader";
import KeywordResearchWorkbench from "@/features/seo/keyword-research/components/KeywordResearchWorkbench";

export const metadata: Metadata = {
  title: "Keyword Research",
  description:
    "Map keyword relationships with AI research and explore live market data.",
};

export default function KeywordResearchPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center">
          <h1 className="truncate text-sm font-medium text-foreground">
            Keyword Research
          </h1>
        </div>
      </PageHeader>
      <KeywordResearchWorkbench />
    </>
  );
}
