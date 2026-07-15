"use client";

import type { ReactNode } from "react";

interface LocalToolsWorkshopLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  logPanel?: ReactNode;
  sidebarWidth?: string;
  logWidth?: string;
}

/** Three-column tool workshop: scrollable sidebar · main result · message log. */
export function LocalToolsWorkshopLayout({
  sidebar,
  main,
  logPanel,
  sidebarWidth = "w-64",
  logWidth = "w-80",
}: LocalToolsWorkshopLayoutProps) {
  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      <aside
        className={`${sidebarWidth} shrink-0 min-h-0 overflow-y-auto flex flex-col divide-y bg-card border-r`}
      >
        {sidebar}
      </aside>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden border-r">
        {main}
      </div>
      {logPanel ? (
        <div
          className={`${logWidth} shrink-0 min-h-0 flex flex-col overflow-hidden`}
        >
          {logPanel}
        </div>
      ) : null}
    </div>
  );
}
