"use client";

import { Check } from "lucide-react";
import { ArrowDownUpTapButton } from "@/components/icons/tap-buttons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DOCUMENT_SORT_OPTIONS,
  type DocumentSortKey,
} from "@/features/data-tables/utils/documentsHubDisplay";

interface DocumentsSortMenuProps {
  sortKey: DocumentSortKey;
  onSortChange: (key: DocumentSortKey) => void;
}

export function DocumentsSortMenu({
  sortKey,
  onSortChange,
}: DocumentsSortMenuProps) {
  const activeLabel =
    DOCUMENT_SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? "Sort";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ArrowDownUpTapButton
          variant="transparent"
          ariaLabel={`Sort: ${activeLabel}`}
          tooltip={`Sort: ${activeLabel}`}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {DOCUMENT_SORT_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onSortChange(opt.value)}
            className="flex items-center justify-between gap-2"
          >
            <span>{opt.label}</span>
            {sortKey === opt.value ? (
              <Check className="h-3.5 w-3.5 text-primary" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
