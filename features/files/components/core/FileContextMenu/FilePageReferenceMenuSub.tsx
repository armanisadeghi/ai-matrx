"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { Bookmark } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { buildFilePageReferenceFence } from "@/features/matrx-envelope/compoundReference";

const QUICK_PAGES = [1, 2, 3, 4, 5] as const;

/** PDF context-menu submenu — copy a `file_page` reference for a 1-based page. */
export function FilePageReferenceMenuSub({
  fileId,
  fileName,
}: {
  fileId: string;
  fileName?: string;
}) {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  const copyPage = async (pageNumber: number) => {
    try {
      if (!(await copyText(
        buildFilePageReferenceFence({
          fileId,
          pageNumber,
          label: fileName,
        }),
      ))) return;
      toast.success("Page reference copied", {
        description: fileName
          ? `${fileName} · p.${pageNumber}`
          : `Page ${pageNumber}`,
      });
    } catch {
      toast.error("Failed to copy page reference");
    }
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Bookmark className="mr-2 h-4 w-4" />
        Copy page reference
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {QUICK_PAGES.map((page) => (
          <DropdownMenuItem
            key={page}
            onSelect={(e) => {
              e.preventDefault();
              void copyPage(page);
            }}
          >
            Page {page}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
