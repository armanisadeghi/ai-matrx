"use client";
import React, { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ContentTabsProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const CONTENT_TABS = [
  ["pretty", "Pretty"],
  ["reader", "Reader"],
  ["organized", "Content"],
  ["structured", "Structured"],
  ["images", "Images"],
  ["text", "Text"],
  ["metadata", "Metadata"],
  ["removals", "Removals"],
  ["header-analysis", "Header"],
  ["seo-analysis", "SEO"],
  ["fact-checker", "Fact-Check"],
  ["keyword-analysis", "Keywords"],
  ["hashes", "Hashes"],
  ["raw", "Raw"],
  ["raw-explorer", "Explorer"],
  ["bookmark-viewer", "Bookmarks"],
  ["fancy-json-explorer", "Fancy Explorer"],
] as const;

/**
 * Component for content type tabs with horizontal scrolling for mobile
 */
const ContentTabs = ({ activeTab, setActiveTab }: ContentTabsProps) => {
  const [scrollPosition, setScrollPosition] = useState(0);
  const tabsRef = React.useRef<React.ComponentRef<typeof TabsList>>(null);

  const scrollTabs = (direction: "left" | "right") => {
    if (tabsRef.current) {
      const container = tabsRef.current;
      const scrollAmount = direction === "left" ? -200 : 200;
      container.scrollBy({ left: scrollAmount, behavior: "smooth" });
      setScrollPosition(container.scrollLeft + scrollAmount);
    }
  };

  return (
    <div className="relative w-full rounded-t-none">
      {/* Scroll buttons visible on smaller screens */}
      <button
        onClick={() => scrollTabs("left")}
        className="absolute left-0 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-textured shadow-md md:hidden"
        aria-label="Scroll left"
      >
        <ChevronLeft size={18} />
      </button>

      <TabsList
        ref={tabsRef}
        className="flex h-auto justify-start gap-1 overflow-x-auto scrollbar-hide py-1 px-11 md:px-0 rounded-t-none rounded-b-lg shadow-md border-b border-border bg-muted"
      >
        {CONTENT_TABS.map(([value, label]) => (
          <TabsTrigger
            key={value}
            value={value}
            className="min-h-11 shrink-0 md:min-h-0"
          >
            {label}
          </TabsTrigger>
        ))}
      </TabsList>

      <button
        onClick={() => scrollTabs("right")}
        className="absolute right-0 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-textured shadow-md md:hidden"
        aria-label="Scroll right"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
};

export default ContentTabs;
