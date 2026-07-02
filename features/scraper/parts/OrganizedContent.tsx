"use client";
import React from "react";
import { processOrganizedData } from "../utils/scraper-utils";

interface OrganizedContentSection {
  heading: {
    level: number;
    text: string;
  };
  content: Array<
    | { type: "paragraph"; content: string }
    | { type: "list"; items: string[] }
    | { type: "unknown"; keys: string[] }
  >;
}

interface OrganizedContentProps {
  organizedData: Record<string, unknown>;
}

/**
 * Component for displaying organized content
 */
const OrganizedContent = ({ organizedData }: OrganizedContentProps) => {
  const processedData: OrganizedContentSection[] = processOrganizedData(organizedData);

  if (processedData.length === 0) {
    return (
      <div className="p-4 text-gray-500 dark:text-gray-400">
        No organized content available
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {processedData.map((section, index) => {
        // Calculate class based on heading level
        const headingClass =
          section.heading.level === 1
            ? "text-2xl font-bold"
            : section.heading.level === 2
              ? "text-xl font-semibold"
              : section.heading.level === 3
                ? "text-lg font-medium"
                : section.heading.level === 4
                  ? "text-base font-medium"
                  : "text-sm font-medium";

        return (
          <div key={index} className="mb-4">
            <h3 className={`${headingClass} mb-2 text-foreground`}>
              {section.heading.text}
            </h3>
            <div className="pl-4 border-l-2 border-border space-y-2">
              {section.content.map((item, contentIndex) => {
                if (item.type === "paragraph") {
                  return (
                    <p key={contentIndex} className="text-foreground/90">
                      {item.content}
                    </p>
                  );
                } else if (item.type === "list") {
                  return (
                    <ul
                      key={contentIndex}
                      className="list-disc pl-5 text-foreground/90"
                    >
                      {item.items.map((listItem, itemIndex) => (
                        <li key={itemIndex}>{listItem}</li>
                      ))}
                    </ul>
                  );
                } else {
                  return (
                    <div key={contentIndex} className="text-muted-foreground">
                      {item.keys.join(", ")}
                    </div>
                  );
                }
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default OrganizedContent;
