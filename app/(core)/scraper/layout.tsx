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
      <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden bg-textured">
        {children}
      </div>
    </>
  );
}
