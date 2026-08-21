"use client";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { FileText } from "lucide-react";

export function MessageTemplatesPageHeader() {
  return (
    <RouteHeader
      left={
        <div className="ml-2 flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <h1 className="truncate text-sm font-medium text-foreground">
            Message templates
          </h1>
        </div>
      }
    />
  );
}
