"use client";

import React from "react";
import { FileText, List } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SidebarView } from "../state/types";

interface PdfStudioSidebarToggleProps {
  view: SidebarView;
  onChange: (view: SidebarView) => void;
  disablePages?: boolean;
}

export function PdfStudioSidebarToggle({
  view,
  onChange,
  disablePages,
}: PdfStudioSidebarToggleProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5 h-7 text-[10px]">
      <button
        type="button"
        onClick={() => onChange("files")}
        className={cn(
          "flex-1 h-6 rounded-md px-2 flex items-center justify-center gap-1 transition-colors",
          view === "files"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        title="Show files"
      >
        <FileText className="w-3 h-3" />
        Files
      </button>
      <button
        type="button"
        disabled={disablePages}
        onClick={() => onChange("pages")}
        className={cn(
          "flex-1 h-6 rounded-md px-2 flex items-center justify-center gap-1 transition-colors",
          view === "pages"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
          disablePages && "opacity-40 cursor-not-allowed",
        )}
        title={disablePages ? "Pick a file to see pages" : "Show pages"}
      >
        <List className="w-3 h-3" />
        Pages
      </button>
    </div>
  );
}
