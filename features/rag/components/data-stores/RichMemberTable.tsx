"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import {
  ExternalLinkTapButton,
  SearchTapButton,
  TrashTapButton,
} from "@ai-matrx/tap-target/buttons";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QuickSearchDialog } from "@/features/rag/components/library/QuickSearchDialog";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { StatusBadge } from "@/features/rag/components/library/StatusBadge";
import type { DocStatus } from "@/features/rag/types/library";
import type { RichMember } from "@/features/rag/hooks/useDataStores";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@ai-matrx/kit/format";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function statusToDocStatus(s: RichMember["status"]): DocStatus {
  if (s === "no_processing") return "pending";
  if (s === "ready") return "ready";
  if (s === "embedding") return "embedding";
  if (s === "extracted") return "extracted";
  if (s === "pending") return "pending";
  return "unknown";
}

function memberId(member: RichMember): string {
  return `${member.sourceKind}/${member.sourceId}`;
}

function TruncatedMemberText({
  value,
  className,
}: {
  value: string;
  className: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className}>{value}</span>
      </TooltipTrigger>
      <TooltipContent>{value}</TooltipContent>
    </Tooltip>
  );
}

function memberColumns(): MatrxColumnDef<RichMember>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: "File",
      label: "File",
      sortValue: (member) => member.name,
      filterValue: (member) => member.name,
      width: 300,
      frozen: true,
      cell: (member) => (
        <TruncatedMemberText
          value={member.name}
          className="block max-w-md truncate font-medium"
        />
      ),
    },
    {
      id: "sourceKind",
      accessorKey: "sourceKind",
      header: "Source",
      label: "Source",
      width: 120,
      cell: (member) => (
        <Badge variant="outline" className="px-1 py-0 text-[9px]">
          {member.sourceKind}
        </Badge>
      ),
    },
    {
      id: "mimeType",
      accessorKey: "mimeType",
      header: "Type",
      label: "File type",
      width: 170,
      cell: (member) =>
        member.mimeType ? (
          <TruncatedMemberText
            value={member.mimeType}
            className="block max-w-40 truncate text-xs text-muted-foreground"
          />
        ) : (
          "—"
        ),
    },
    {
      id: "sourceId",
      accessorKey: "sourceId",
      header: "Source ID",
      label: "Source ID",
      width: 150,
      cellKind: "fk",
      fk: {
        token: (member) =>
          member.sourceKind === "cld_file"
            ? "file"
            : member.sourceKind === "processed_document"
              ? "processed_document"
              : null,
      },
    },
    {
      id: "status",
      accessorFn: (member) => statusToDocStatus(member.status),
      header: "Status",
      label: "Status",
      width: 120,
      filter: "select",
      filterOptions: [
        { value: "ready", label: "Ready" },
        { value: "embedding", label: "Embedding" },
        { value: "extracted", label: "Extracted" },
        { value: "pending", label: "Pending" },
        { value: "unknown", label: "Unknown" },
      ],
      cell: (member) => (
        <StatusBadge status={statusToDocStatus(member.status)} />
      ),
    },
    {
      id: "pages",
      accessorKey: "pages",
      header: "Pages",
      label: "Pages",
      width: 90,
      align: "right",
      filter: "number",
      cell: (member) =>
        member.pages > 0 ? member.pages.toLocaleString() : "—",
    },
    {
      id: "chunks",
      accessorKey: "chunks",
      header: RAG_VOCAB.segmentsShort,
      label: RAG_VOCAB.segmentsShort,
      width: 110,
      align: "right",
      filter: "number",
      cell: (member) =>
        member.chunks > 0 ? (
          <span
            className={cn(
              "tabular-nums",
              member.embeddingsOai < member.chunks &&
                "text-yellow-600 dark:text-yellow-400",
            )}
          >
            {member.chunks.toLocaleString()}
            {member.embeddingsOai !== member.chunks && (
              <span className="text-muted-foreground">
                {" / "}
                {member.embeddingsOai.toLocaleString()}
              </span>
            )}
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "embeddingsOai",
      accessorKey: "embeddingsOai",
      header: "Embeddings",
      label: "Embeddings",
      width: 110,
      align: "right",
      filter: "number",
      hidden: true,
      cell: (member) => member.embeddingsOai.toLocaleString(),
    },
    {
      id: "fileSize",
      accessorKey: "fileSize",
      header: "Size",
      label: "Size",
      width: 100,
      align: "right",
      filter: "number",
      cell: (member) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatFileSize(member.fileSize)}
        </span>
      ),
    },
    {
      id: "addedAt",
      accessorKey: "addedAt",
      header: "Added",
      label: "Added",
      width: 175,
      filter: "date",
      cell: (member) => (
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {new Date(member.addedAt).toLocaleString()}
        </span>
      ),
    },
  ];
}

export interface RichMemberTableProps {
  members: RichMember[];
  loading: boolean;
  error: string | null;
  onRemove: (
    sourceKind: string,
    sourceId: string,
  ) => Promise<unknown> | unknown;
  onRefresh?: () => void;
  readOnly?: boolean;
}

export function RichMemberTable({
  members,
  loading,
  error,
  onRemove,
  onRefresh,
  readOnly = false,
}: RichMemberTableProps) {
  const [searchTarget, setSearchTarget] = useState<RichMember | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<RichMember | null>(null);
  const [removing, setRemoving] = useState(false);

  const doRemove = async () => {
    if (!confirmRemove) return;
    setRemoving(true);
    try {
      await onRemove(confirmRemove.sourceKind, confirmRemove.sourceId);
      toast.success(`Removed ${confirmRemove.name}`);
      setConfirmRemove(null);
      onRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setRemoving(false);
    }
  };

  const actionsFor = (member: RichMember) => (
    <>
      <SearchTapButton
        variant="transparent"
        ariaLabel={`Search inside ${member.name}`}
        tooltip="Search inside this document"
        disabled={!member.processedDocumentId || member.chunks === 0}
        onClick={() => setSearchTarget(member)}
      />
      <ExternalLinkTapButton
        variant="transparent"
        ariaLabel={`Open preview for ${member.name}`}
        tooltip="Open preview"
        disabled={!member.processedDocumentId}
        onClick={() => {
          if (member.processedDocumentId)
            window.open(
              `/knowledge/library/${member.processedDocumentId}/preview`,
              "_blank",
              "noopener,noreferrer",
            );
        }}
      />
      {!readOnly && (
        <TrashTapButton
          variant="transparent"
          ariaLabel={`Remove ${member.name} from this store`}
          tooltip="Remove from this store"
          iconColor="text-destructive"
          onClick={() => setConfirmRemove(member)}
        />
      )}
    </>
  );

  const tableData = error ? [] : members;

  return (
    <>
      <MatrxDataTable<RichMember>
        tableId="rag-data-store-members"
        data={tableData}
        columns={memberColumns()}
        getRowId={memberId}
        density="condensed"
        isLoading={loading && members.length === 0}
        isFetching={loading && members.length > 0}
        // Search and Preview are the existing member-detail doors; opening the
        // package detail panel as well would create a second, empty detail path.
        detail={{ enabled: false }}
        toolbar={{
          title: "Members",
          search: true,
          searchPlaceholder: "Search store members…",
          refresh: onRefresh ? { onRefresh } : undefined,
        }}
        emptyState={
          error
            ? {
                title: "Could not load members",
                description: error,
                action: onRefresh ? (
                  <Button size="sm" variant="outline" onClick={onRefresh}>
                    Retry
                  </Button>
                ) : undefined,
              }
            : {
                title: "No members yet",
                description: "Drag a file onto this store, or use Add Member.",
              }
        }
        rowActions={(member) => actionsFor(member)}
      />
      <QuickSearchDialog
        open={searchTarget !== null}
        onOpenChange={(open) => {
          if (!open) setSearchTarget(null);
        }}
        processedDocumentId={searchTarget?.processedDocumentId ?? null}
        documentName={searchTarget?.name ?? null}
      />
      <Dialog
        open={confirmRemove !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from store?</DialogTitle>
            <DialogDescription>
              Removes <strong>{confirmRemove?.name}</strong> from this store
              only. The file itself, its pages,{" "}
              {RAG_VOCAB.segmentsShort.toLowerCase()}, and embeddings are{" "}
              <strong>not</strong> deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={doRemove}
              disabled={removing}
            >
              {removing ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Removing…
                </>
              ) : (
                "Remove"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
