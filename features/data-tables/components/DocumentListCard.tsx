"use client";

import Link from "next/link";
import { FileText, Loader2, Trash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DocumentRow } from "@/features/data-tables/types";
import { documentSourceLabel } from "@/features/data-tables/utils/documentsHubDisplay";

export function DocumentListCard({
  doc,
  isNavigating,
  isAnyNavigating,
  onNavigate,
  onDelete,
}: {
  doc: DocumentRow;
  isNavigating: boolean;
  isAnyNavigating: boolean;
  onNavigate: (id: string, path: string, e?: React.MouseEvent) => void;
  onDelete: (doc: DocumentRow) => void;
}) {
  const href = `/documents/${doc.id}`;
  const isDisabled = isNavigating || isAnyNavigating;

  const handleOpen = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    if (!isDisabled) onNavigate(doc.id, href, e);
  };

  return (
    <Card className="group relative min-w-0 overflow-hidden">
      <CardContent className="p-4 space-y-2">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <Link
            href={href}
            className="flex min-w-0 flex-1 items-start gap-2 text-left"
            onClick={handleOpen}
            tabIndex={isDisabled ? -1 : 0}
            aria-disabled={isDisabled}
          >
            <FileText className="size-5 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{doc.document_name}</div>
              {doc.description ? (
                <div className="text-xs text-muted-foreground line-clamp-2 break-words">
                  {doc.description}
                </div>
              ) : null}
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7"
            onClick={() => onDelete(doc)}
            title="Delete document"
            disabled={isDisabled}
          >
            <Trash className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            Updated {new Date(doc.updated_at).toLocaleString()}
          </span>
          <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
            {documentSourceLabel(doc.source)}
          </span>
        </div>
        {isNavigating ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
