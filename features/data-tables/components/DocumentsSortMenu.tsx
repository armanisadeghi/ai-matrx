"use client";

import { Check } from "lucide-react";
import {
  ArrowDownUpTapButton,
  type TapButtonProps,
} from "@/components/icons/tap-buttons";
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
  variant?: TapButtonProps["variant"];
}

export function DocumentsSortMenu({
  sortKey,
  onSortChange,
  variant = "group",
}: DocumentsSortMenuProps) {
  const activeLabel =
    DOCUMENT_SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? "Sort";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ArrowDownUpTapButton
          variant={variant}
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
