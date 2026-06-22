"use client";

/**
 * DocumentLinkPicker — pick an existing document (working / scratch) of the
 * current user to LINK this conversation to. Powers cross-conversation sharing:
 * both conversations then point at the same `cx_working_documents` row, so
 * edits round-trip to all of them.
 *
 * Desktop: Popover. Mobile: BottomSheet (nested pickers must not use Popover).
 */

import React, { useCallback, useMemo, useState } from "react";
import { FileText, Loader2, NotebookPen, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetBody,
} from "@/components/official/bottom-sheet/BottomSheet";
import {
  listUserDocuments,
  type CxWorkingDocument,
  type WorkingDocumentKind,
} from "@/features/agents/redux/execution-system/instance-working-document/cx-working-document.service";

interface DocumentLinkPickerProps {
  kind: WorkingDocumentKind;
  trigger: React.ReactNode;
  onSelect: (documentId: string) => void;
  excludeDocumentId?: string | null;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}

function previewOf(content: string): string {
  const trimmed = content.replace(/\s+/g, " ").trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
}

function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const day = 86_400_000;
  if (diff < day) return "today";
  if (diff < 2 * day) return "yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface DocumentLinkPickerBodyProps {
  kind: WorkingDocumentKind;
  search: string;
  onSearchChange: (value: string) => void;
  isLoading: boolean;
  error: string | null;
  filtered: CxWorkingDocument[];
  onPick: (documentId: string) => void;
  listMaxHeight?: string;
}

function DocumentLinkPickerBody({
  kind,
  search,
  onSearchChange,
  isLoading,
  error,
  filtered,
  onPick,
  listMaxHeight = "max-h-[300px]",
}: DocumentLinkPickerBodyProps) {
  const isScratch = kind === "scratch";
  const Icon = isScratch ? NotebookPen : FileText;
  const noun = isScratch ? "scratchpad" : "document";

  return (
    <div className="flex flex-col text-xs">
      <div className="border-b border-border px-2 py-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder={`Search ${noun}s…`}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 border-0 bg-muted/40 pl-7 text-xs shadow-none focus-visible:ring-1"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      <div
        className={`overflow-y-auto overscroll-contain py-0.5 ${listMaxHeight}`}
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading {noun}s…
          </div>
        ) : error ? (
          <div className="px-3 py-6 text-center text-destructive">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-muted-foreground">
            {search.trim() ? "No matches" : `No other ${noun}s to link yet`}
          </div>
        ) : (
          filtered.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => onPick(doc.id)}
              className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-accent/50"
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {doc.title?.trim() ||
                      (isScratch ? "Untitled scratchpad" : "Untitled document")}
                  </span>
                  <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground/50">
                    {formatWhen(doc.updatedAt)}
                  </span>
                </span>
                {doc.content.trim() && (
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground/70">
                    {previewOf(doc.content)}
                  </span>
                )}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function DocumentLinkPicker({
  kind,
  trigger,
  onSelect,
  excludeDocumentId,
  align = "end",
  side = "bottom",
}: DocumentLinkPickerProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CxWorkingDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const isScratch = kind === "scratch";
  const noun = isScratch ? "scratchpad" : "document";
  const sheetTitle = `Link ${noun}`;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) {
        setIsLoading(true);
        setError(null);
        void listUserDocuments(kind)
          .then((loaded) => setItems(loaded))
          .catch(() => {
            setError(`Could not load ${noun}s`);
            setItems([]);
          })
          .finally(() => setIsLoading(false));
      } else {
        setSearch("");
      }
    },
    [kind, noun],
  );

  const filtered = useMemo(() => {
    const list = items.filter((d) => d.id !== excludeDocumentId);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) =>
        (d.title || "").toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q),
    );
  }, [items, excludeDocumentId, search]);

  const handlePick = useCallback(
    (documentId: string) => {
      onSelect(documentId);
      setOpen(false);
      setSearch("");
    },
    [onSelect],
  );

  const body = (
    <DocumentLinkPickerBody
      kind={kind}
      search={search}
      onSearchChange={setSearch}
      isLoading={isLoading}
      error={error}
      filtered={filtered}
      onPick={handlePick}
      listMaxHeight={isMobile ? "max-h-[50dvh]" : "max-h-[300px]"}
    />
  );

  const mergedTrigger = React.isValidElement(trigger)
    ? React.cloneElement(
        trigger as React.ReactElement<{
          onClick?: (event: React.MouseEvent) => void;
        }>,
        {
          onClick: (event: React.MouseEvent) => {
            (
              trigger as React.ReactElement<{
                onClick?: (event: React.MouseEvent) => void;
              }>
            ).props.onClick?.(event);
            if (!event.defaultPrevented) {
              handleOpenChange(true);
            }
          },
        },
      )
    : trigger;

  if (isMobile) {
    return (
      <>
        {mergedTrigger}
        <BottomSheet
          open={open}
          onOpenChange={handleOpenChange}
          title={sheetTitle}
        >
          <BottomSheetHeader title={sheetTitle} />
          <BottomSheetBody className="px-2">{body}</BottomSheetBody>
        </BottomSheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align={align} side={side}>
        {body}
      </PopoverContent>
    </Popover>
  );
}
