"use client";

/**
 * ExportMenu — the "Download" dropdown for any data surface. Sits beside
 * CopyButtons in toolbars/headers; each item downloads a file built at click
 * time (JSON raw data, CSV of the current view, payload text…).
 */

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import {
  downloadFile,
  exportFilename,
  type ExportItem,
} from "@/components/agent-copy/export";

export interface ExportMenuProps {
  /** Filename base + toast label, e.g. "backlinks-aimatrx" / "Stored backlinks". */
  label: string;
  items: ExportItem[];
  /** "icon" = icon-only trigger (toolbars); "sm" = icon + "Export" text. */
  size?: "icon" | "sm";
  disabled?: boolean;
  className?: string;
}

export function ExportMenu({
  label,
  items,
  size = "icon",
  disabled = false,
  className,
}: ExportMenuProps) {
  if (!items.length) return null;
  const isIcon = size === "icon";

  const handle = (item: ExportItem) => {
    const { content, extension, mime } = item.build();
    downloadFile(exportFilename(label, extension), content, mime);
    toast.success(`${label} exported (${extension.toUpperCase()})`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={isIcon ? "icon" : "sm"}
          className={isIcon ? `h-7 w-7 ${className ?? ""}` : className}
          disabled={disabled}
          title={`Export ${label}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Download className={isIcon ? "h-3.5 w-3.5" : "h-4 w-4"} />
          {!isIcon && <span className="ml-1">Export</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem key={item.id} onSelect={() => handle(item)}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
