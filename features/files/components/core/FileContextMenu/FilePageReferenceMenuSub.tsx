"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { Bookmark } from "lucide-react";
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
    notify: copyNotify,
  });
  const copyPage = async (pageNumber: number) => {
    if (!(await copyText(
      buildFilePageReferenceFence({
        fileId,
        pageNumber,
        label: fileName,
      }), fileName ? `Page reference copied: ${fileName} · p.${pageNumber}` : `Page ${pageNumber} reference copied`, "Failed to copy page reference"))) return;
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
