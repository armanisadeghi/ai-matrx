"use client";
import React, { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Component for content type tabs with horizontal scrolling for mobile
 */
const ContentTabs = ({ activeTab, setActiveTab }) => {
  const [scrollPosition, setScrollPosition] = useState(0);
  const tabsRef = React.useRef<React.ComponentRef<typeof TabsList>>(null);

  const scrollTabs = (direction) => {
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
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-textured rounded-full p-1 shadow-md md:hidden"
        aria-label="Scroll left"
      >
        <ChevronLeft size={18} />
      </button>

      <TabsList
        ref={tabsRef}
        className="flex h-auto gap-1 overflow-x-auto scrollbar-hide py-1 px-6 md:px-0 rounded-t-none rounded-b-lg shadow-md border-b border-border bg-muted"
      >
        <TabsTrigger value="pretty">Pretty</TabsTrigger>
        <TabsTrigger value="reader">Reader</TabsTrigger>
        <TabsTrigger value="organized">Content</TabsTrigger>
        <TabsTrigger value="structured">Structured</TabsTrigger>
        <TabsTrigger value="images">Images</TabsTrigger>
        <TabsTrigger value="text">Text</TabsTrigger>
        <TabsTrigger value="metadata">Metadata</TabsTrigger>
        <TabsTrigger value="removals">Removals</TabsTrigger>
        <TabsTrigger value="header-analysis">Header</TabsTrigger>
        <TabsTrigger value="seo-analysis">SEO</TabsTrigger>
        <TabsTrigger value="fact-checker">Fact-Check</TabsTrigger>
        <TabsTrigger value="keyword-analysis">Keywords</TabsTrigger>
        <TabsTrigger value="hashes">Hashes</TabsTrigger>
        <TabsTrigger value="raw">Raw</TabsTrigger>
        <TabsTrigger value="raw-explorer">Explorer</TabsTrigger>
        <TabsTrigger value="bookmark-viewer">Bookmarks</TabsTrigger>
        <TabsTrigger value="fancy-json-explorer">Fancy Explorer</TabsTrigger>
      </TabsList>

      <button
        onClick={() => scrollTabs("right")}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-textured rounded-full p-1 shadow-md md:hidden"
        aria-label="Scroll right"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
};

export default ContentTabs;
