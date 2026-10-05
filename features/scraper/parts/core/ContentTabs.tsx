"use client";
import React, { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";

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
      <Button variant="quiet" icon={<ChevronLeft size={18} />} onClick={() => scrollTabs("left")} aria-label="Scroll left" className="absolute left-0 top-1/2 z-10 md:hidden" />

      <TabsList
        ref={tabsRef}
        overflow="scroll" className="px-11 md:px-0"
      >
        {CONTENT_TABS.map(([value, label]) => (
          <TabsTrigger
            key={value}
            value={value}
          >
            {label}
          </TabsTrigger>
        ))}
      </TabsList>

      <Button variant="quiet" icon={<ChevronRight size={18} />} onClick={() => scrollTabs("right")} aria-label="Scroll right" className="absolute right-0 top-1/2 z-10 md:hidden" />
    </div>
  );
};

export default ContentTabs;
