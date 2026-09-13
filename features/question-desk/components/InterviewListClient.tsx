"use client";

// features/question-desk/components/InterviewListClient.tsx
//
// Every interview, as data. No prose, no hero, no explanation paragraph — a
// dashboard is numbers, lists and tables (Arman, 2026-09-12).
//
// THE ARCHIVED-ITEMS LAW is a real query parameter here, never a hardcoded
// predicate: `<ArchiveFilter>` from `@ai-matrx/design-system` (one of the two
// allowed controls platform-wide) sets `archived`, the read passes it to
// Postgres, the default hides archived interviews, and revealing them is one
// click. Archiving and unarchiving are row actions on the same screen.
//
// A NOTE ON THE SHELL. The canonical list shell is `<EntityListPage>`, and it
// requires a `*_list_scoped` / `*_list_scope_counts` RPC pair that only a
// migration can create — outside this lane. So this surface is the same
// `MatrxDataTable` the shell renders, driven directly, with the shell's two
// load-bearing behaviours kept by hand: the archive axis above, and an empty
// state that never says "none" while the archive filter is hiding rows.
// Ruling QD-L2-1; cost if wrong is one RPC plus a listConfig — the columns and
// row actions move across unchanged.

import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, MessagesSquare } from "lucide-react";
import {
  ArchiveFilter,
  DEFAULT_ARCHIVE_FILTER,
  type ArchiveFilterValue,
} from "@ai-matrx/design-system";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { listInterviews, setInterviewArchived } from "../data/interviews";
import type { InterviewListRow } from "../types";

export function InterviewListClient() {
  const [archived, setArchived] = useState<ArchiveFilterValue>(
    DEFAULT_ARCHIVE_FILTER,
  );
  const [rows, setRows] = useState<InterviewListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countsTruncated, setCountsTruncated] = useState(false);
  /** How many archived interviews the current filter is hiding, when live is empty. */
  const [hiddenArchived, setHiddenArchived] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void (async () => {
      try {
        const result = await listInterviews(archived);
        if (!live) return;
        setRows(result.rows);
        setCountsTruncated(result.countsTruncated);
        setError(null);
        // A LIST MAY NOT SAY "NONE" WHILE ITS OWN DEFAULT IS HIDING ROWS.
        // Only paid for when the live half really did come back empty.
        if (result.rows.length === 0 && archived === "active") {
          const probe = await listInterviews("archived");
          if (!live) return;
          setHiddenArchived(probe.rows.length);
        } else {
          setHiddenArchived(null);
        }
      } catch (readError) {
        if (!live) return;
        setError(
          readError instanceof Error ? readError.message : String(readError),
        );
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [archived, reloadToken]);

  const toggleArchive = useCallback(
    async (row: InterviewListRow) => {
      const next = row.archived_at === null;
      try {
        await setInterviewArchived(row.id, next);
        toast.success(next ? "Interview archived." : "Interview restored.");
        setReloadToken((token) => token + 1);
      } catch (writeError) {
        toast.error(
          writeError instanceof Error ? writeError.message : String(writeError),
        );
      }
    },
    [],
  );

  const columns: MatrxColumnDef<InterviewListRow>[] = [
    {
      accessorKey: "title",
      header: "Interview",
      sortable: true,
      // THE DOOR LAW: the title cell is a real anchor, so the interview is
      // reachable by keyboard, announced as a link, and cmd/middle-clickable
      // into a new tab — not a row-click convenience that only a mouse finds.
      href: (row) => `/administration/question-desk/${row.id}`,
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate font-medium text-foreground">
            {row.title}
          </span>
          {row.subtitle ? (
            <span className="block truncate font-mono text-[11px] text-muted-foreground">
              {row.subtitle}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "purpose",
      header: "Purpose",
      sortable: true,
      cell: (row) => (
        <span className="line-clamp-2 text-muted-foreground">
          {row.purpose ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "openCount",
      header: "Open",
      sortable: true,
      cell: (row) => <Count value={row.openCount} tone="open" />,
    },
    {
      accessorKey: "answeredCount",
      header: "Answered",
      sortable: true,
      cell: (row) => <Count value={row.answeredCount} tone="answered" />,
    },
    {
      accessorKey: "deliveredCount",
      header: "Delivered",
      sortable: true,
      cell: (row) => <Count value={row.deliveredCount} tone="plain" />,
    },
    {
      accessorKey: "opened_at",
      header: "Opened",
      sortable: true,
      cell: (row) => (
        <span className="font-mono text-[11px] text-muted-foreground">
          {row.opened_at ? row.opened_at.slice(0, 10) : "not yet"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      sortable: true,
      cell: (row) => (
        <span className="font-mono text-[11px] text-muted-foreground">
          {row.status}
          {row.archived_at ? " · archived" : ""}
        </span>
      ),
    },
  ];

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">
            The interviews did not load
          </h2>
          <p className="mt-1.5 text-[13.5px] text-foreground/80">{error}</p>
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            className="mt-3 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] font-medium hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      {countsTruncated ? (
        <p className="mb-2 font-mono text-[11px] text-warning">
          More questions exist than one page can count — the numbers below are a
          floor, not a total.
        </p>
      ) : null}
      <MatrxDataTable<InterviewListRow>
        data={rows}
        isLoading={loading}
        columns={columns}
        getRowId={(row) => row.id}
        pageSize={25}
        pageSizeOptions={[10, 25, 50, 100]}
        defaultSort={{ id: "opened_at", direction: "desc" }}
        detail={{ enabled: false }}
        emptyState={{
          title:
            hiddenArchived && hiddenArchived > 0
              ? `All ${hiddenArchived} interviews are archived`
              : "No interviews",
          description:
            hiddenArchived && hiddenArchived > 0
              ? "Switch the archive filter to Archived to see them."
              : "The desk creates an interview when it has questions to put to someone.",
          icon: <MessagesSquare className="size-8" />,
        }}
        toolbar={{
          leading: (
            <h2 className="text-sm font-semibold text-foreground">
              Question Desk
            </h2>
          ),
          actions: (
            <ArchiveFilter
              value={archived}
              onValueChange={setArchived}
              size="sm"
              aria-label="Show archived interviews"
            />
          ),
        }}
        rowActions={(row) => (
          <button
            type="button"
            title={row.archived_at ? "Restore this interview" : "Archive this interview"}
            onClick={(event) => {
              event.stopPropagation();
              void toggleArchive(row);
            }}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {row.archived_at ? (
              <ArchiveRestore className="size-3.5" aria-hidden />
            ) : (
              <Archive className="size-3.5" aria-hidden />
            )}
          </button>
        )}
      />
    </div>
  );
}

function Count({
  value,
  tone,
}: {
  value: number;
  tone: "open" | "answered" | "plain";
}) {
  return (
    <span
      className={cn(
        "font-mono text-[12px] tabular-nums",
        value === 0 && "text-muted-foreground",
        value > 0 && tone === "open" && "text-warning",
        value > 0 && tone === "answered" && "text-success",
        value > 0 && tone === "plain" && "text-foreground",
      )}
    >
      {value}
    </span>
  );
}
