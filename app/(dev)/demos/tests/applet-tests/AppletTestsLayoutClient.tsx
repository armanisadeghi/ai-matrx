"use client";

import React from "react";
import EnhancedEntityAnalyzer from "@/components/admin/redux/EnhancedEntityAnalyzer";
import MatrxDynamicPanel from "@/components/matrx/resizable/MatrxDynamicPanel";
import { useIsMobile } from "@/hooks/use-mobile";

export default function AppletTestsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();

  return (
    <div className="flex flex-col h-full bg-textured transition-colors">
      <main className="flex-1">{children}</main>

      {!isMobile && (
        <MatrxDynamicPanel
          initialPosition="left"
          defaultExpanded={false}
          expandButtonProps={{
            label: "Entity State",
          }}
        >
          <EnhancedEntityAnalyzer
            defaultExpanded={false}
            selectedEntityKey="brokerValue"
          />
        </MatrxDynamicPanel>
      )}
    </div>
  );
}
