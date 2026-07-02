"use client";
import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { truncateText } from "../../utils/scraper-utils";

/**
 * Component for displaying page tabs when multiple pages are available
 * Now works with processed ScraperDataUtils data
 */
const PageTabs = ({ responses, activePageIndex, setActivePageIndex }) => {
  if (!responses || responses.length <= 1) {
    return null;
  }

  /**
   * Extracts page title from processed data structure
   */
  const getPageTitle = (processedData, index) => {
    const defaultTitle = `Page ${index + 1}`;

    try {
      // Try to get title from the first result's overview
      const firstResult = processedData?.results?.[0];
      if (firstResult?.overview?.page_title) {
        return firstResult.overview.page_title;
      }

      // Fallback to URL
      if (firstResult?.overview?.url) {
        return firstResult.overview.url;
      }

      // Log any missing title data for debugging
      console.log(
        `[PAGE TABS] No title found for page ${index}, data:`,
        processedData,
      );
    } catch (error) {
      console.error(
        `[PAGE TABS] Error extracting title for page ${index}:`,
        error,
      );
    }

    return defaultTitle;
  };

  return (
    <div className="bg-muted/50 border-b border-border p-0">
      <Tabs
        value={String(activePageIndex)}
        onValueChange={(value) => setActivePageIndex(parseInt(value))}
      >
        <TabsList className="flex flex-wrap gap-1">
          {responses.map((processedData, idx) => {
            const pageTitle = getPageTitle(processedData, idx);
            return (
              <TabsTrigger key={idx} value={String(idx)}>
                {truncateText(pageTitle, 25)}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </div>
  );
};

export default PageTabs;
