import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { ScraperHubHeader } from "@/features/scraper/components/ScraperHubHeader";

export const metadata = createRouteMetadata("/scraper", {
  title: "Webscraper",
  description: "Extract and process data from web sources",
  letter: "H",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ScraperHubHeader />
      <div className="h-full overflow-hidden flex flex-col bg-textured">
        {children}
      </div>
    </>
  );
}
