"use client";

import React from "react";
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from "@/components/ui/resizable";
import { pct } from "@/components/matrx/resizable/pct";

interface BaseSection {
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  collapsible?: boolean;
  /** When false, shows `placeholder` or a loading shell instead of `content`. */
  renderCondition?: boolean;
  placeholder?: React.ReactNode;
}

interface ContentSection extends BaseSection {
  type: "content";
  content: React.ReactNode;
}

interface NestedSection extends BaseSection {
  type: "nested";
  direction: "horizontal" | "vertical";
  sections: (ContentSection | NestedSection)[];
}

export type Section = ContentSection | NestedSection;

interface NestedResizableLayoutProps {
  layout: Section;
  className?: string;
}

const DefaultPanel: React.FC<{
  children: React.ReactNode;
  placeholder?: React.ReactNode;
  shouldRender?: boolean;
}> = ({ children, placeholder, shouldRender = true }) => (
  <div className="h-full w-full p-4 overflow-auto">
    {shouldRender
      ? children
      : placeholder || (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            Loading...
          </div>
        )}
  </div>
);

const RenderSection: React.FC<{
  section: Section;
  defaultSize: number;
}> = ({ section, defaultSize }) => {
  if (section.type === "content") {
    return (
      <ResizablePanel
        defaultSize={pct(defaultSize)}
        minSize={pct(section.minSize ?? 10)}
        maxSize={pct(section.maxSize ?? 90)}
        collapsible={section.collapsible}
      >
        <DefaultPanel
          shouldRender={section.renderCondition !== false}
          placeholder={section.placeholder}
        >
          {section.content}
        </DefaultPanel>
      </ResizablePanel>
    );
  }

  const nestedDefaultSizes = section.sections.map(
    (s) => s.defaultSize ?? 100 / section.sections.length,
  );

  return (
    <ResizablePanel
      defaultSize={pct(defaultSize)}
      minSize={pct(section.minSize ?? 10)}
      maxSize={pct(section.maxSize ?? 90)}
      collapsible={section.collapsible}
    >
      <ResizablePanelGroup
        orientation={section.direction}
        className="h-full w-full min-h-0"
      >
        {section.sections.map((nestedSection, idx) => (
          <React.Fragment key={idx}>
            <RenderSection
              section={nestedSection}
              defaultSize={nestedDefaultSizes[idx]}
            />
            {idx < section.sections.length - 1 && <ResizableHandle />}
          </React.Fragment>
        ))}
      </ResizablePanelGroup>
    </ResizablePanel>
  );
};

export function NestedResizableWithHeaderFooter({
  layout,
  className = "",
}: NestedResizableLayoutProps) {
  return (
    <div
      className={`h-[calc(100dvh-4rem)] min-h-0 bg-background ${className} border border-red-500`}
    >
      <ResizablePanelGroup
        orientation={layout.type === "nested" ? layout.direction : "horizontal"}
        className="h-full min-h-0"
      >
        <RenderSection section={layout} defaultSize={100} />
      </ResizablePanelGroup>
    </div>
  );
}
