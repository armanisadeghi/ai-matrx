// app/(authenticated)/tests/forms/entity-management-smart-fields/page.tsx
"use client";
import NewEntitySplitLayout from "@/app/entities/layout/MergedEntityLayout";
import React from "react";
import { getUnifiedLayoutProps } from "@/app/entities/layout/configs";

export default function EntityManagementPage() {
  const entityKey = "registeredFunction";
  const layoutProps = getUnifiedLayoutProps({
    entityKey: entityKey,
    formComponent: "STANDARD", // "STANDARD" | "MINIMAL" | "MULTI_SELECT" | ARMANI
    quickReferenceType: "LIST",
    density: "normal",
    isExpanded: true,
    handlers: {},
  });


  return (
    <div className="flex-1 p-0 gap-0 bg-background h-full max-h-full overflow-hidden">
      <div className="h-full max-h-[calc(100dvh-120px)] overflow-hidden">
        <NewEntitySplitLayout {...layoutProps} className="h-full max-h-full" />
      </div>
    </div>
  );
}
