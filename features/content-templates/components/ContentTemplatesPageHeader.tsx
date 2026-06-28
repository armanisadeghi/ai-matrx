"use client";

import { PageSpecificHeader } from "@/components/layout/new-layout/PageSpecificHeaderPortal";
import { FileText } from "lucide-react";

export function ContentTemplatesPageHeader() {
  return (
    <PageSpecificHeader>
      <div className="flex items-center justify-center w-full">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary flex-shrink-0" />
          <h1 className="text-base font-bold text-foreground">Templates</h1>
        </div>
      </div>
    </PageSpecificHeader>
  );
}
