import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/scraper", {
    title: "Webscraper",
    description: "Extract and process data from web sources",
});

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <div className="h-page flex flex-col bg-textured">
            {/* Uses h-page utility: auto-adjusts for header height (Mobile: 3rem, Desktop: 2.5rem) */}
            <div className="flex-1 flex flex-col min-h-0">
                {children}
            </div>
        </div>
    );
}
