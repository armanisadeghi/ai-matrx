"use client";

import { useRef } from "react";

import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";
import {
  LayoutGridTapButton,
  ListTapButton,
  LoadingTapButton,
  PlusTapButton,
  XTapButton,
} from "@/components/icons/tap-buttons";
import { DocumentsSortMenu } from "@/features/data-tables/components/DocumentsSortMenu";
import type { DocumentSortKey } from "@/features/data-tables/utils/documentsHubDisplay";

type HubViewMode = "cards" | "table";

interface DocumentsHubToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  view: HubViewMode;
  onViewChange: (view: HubViewMode) => void;
  sortKey: DocumentSortKey;
  onSortChange: (key: DocumentSortKey) => void;
  creating: boolean;
  onCreate: () => void;
}

export function DocumentsHubToolbar({
  query,
  onQueryChange,
  view,
  onViewChange,
  sortKey,
  onSortChange,
  creating,
  onCreate,
}: DocumentsHubToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center w-full">
      <div className="relative inline-flex h-9 min-w-0 flex-1 items-center">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-7 -translate-y-1/2 rounded-full matrx-glass-thin-border" />
        <div className="relative flex min-w-0 flex-1 items-center">
          <div className="flex min-w-0 flex-1 items-center pl-3">
            <svg
              className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground opacity-70"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.34-4.34" />
            </svg>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search documents…"
              aria-label="Search documents"
              className="min-w-0 flex-1 border-0 bg-transparent px-2 py-0 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              style={{ fontSize: "16px", lineHeight: 1 }}
            />
            {query ? (
              <XTapButton
                variant="transparent"
                ariaLabel="Clear search"
                tooltip={false}
                onClick={() => {
                  onQueryChange("");
                  inputRef.current?.focus();
                }}
              />
            ) : null}
          </div>
          <TapTargetButtonGroup>
            <LayoutGridTapButton
              variant="group"
              className={
                view === "cards" ? "text-primary" : "text-muted-foreground"
              }
              ariaLabel="Card view"
              tooltip="Card view"
              onClick={() => onViewChange("cards")}
            />
            <ListTapButton
              variant="group"
              className={
                view === "table" ? "text-primary" : "text-muted-foreground"
              }
              ariaLabel="Table view"
              tooltip="Table view"
              onClick={() => onViewChange("table")}
            />
            {view === "cards" ? (
              <DocumentsSortMenu
                variant="group"
                sortKey={sortKey}
                onSortChange={onSortChange}
              />
            ) : null}
          </TapTargetButtonGroup>
        </div>
      </div>
      {creating ? (
        <LoadingTapButton ariaLabel="Creating document" disabled />
      ) : (
        <PlusTapButton
          ariaLabel="New document"
          tooltip="New document"
          onClick={onCreate}
        />
      )}
    </div>
  );
}
