"use client";

// features/crm/components/outreach-lists/OutreachListDetailPage.tsx
//
// /crm/outreach-lists/[listId] — one outreach list's workspace: lifecycle controls,
// the live status rollup (each chip filters the member table), the member
// roster (server-paged), enrollment from filters, and the door into the call
// queue. Dense by design — this is the sales floor's home base.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  ListPlus,
  Megaphone,
  MoreVertical,
  Pause,
  PhoneCall,
  Play,
  CheckCircle2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { formatRelativeTime } from "@/utils/datetime";
import { cn } from "@/lib/utils";
import { useCrmContext } from "../../hooks/useCrmContext";
import {
  fetchOutreachList,
  fetchOutreachListMembers,
  fetchMemberStatusCounts,
  readEnrollmentSource,
  removeMember,
  requeueMember,
  setOutreachListStatus,
} from "../../outreach-lists/service";
import type {
  OutreachListMemberWithParty,
  OutreachListRow,
  MemberStatus,
  MemberStatusCounts,
} from "../../outreach-lists/types";
import { MEMBER_STATUSES } from "../../outreach-lists/types";
import {
  ListKindBadge,
  ListStatusBadge,
  MemberStatusBadge,
} from "./badges";
import { AddMembersDialog } from "./AddMembersDialog";

const PAGE_SIZE = 50;

export function OutreachListDetailPage({ listId }: { listId: string }) {
  const router = useRouter();
  const ctx = useCrmContext();
  const [list, setOutreachList] = useState<OutreachListRow | null>(null);
  const [counts, setCounts] = useState<MemberStatusCounts | null>(null);
  const [members, setMembers] = useState<OutreachListMemberWithParty[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MemberStatus | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // What last filled this queue (a smart view, or an ad-hoc filter).
  const enrollmentSource = list ? readEnrollmentSource(list) : null;

  const loadHeader = useCallback(async () => {
    try {
      const [c, sc] = await Promise.all([
        fetchOutreachList(listId),
        fetchMemberStatusCounts(listId),
      ]);
      setOutreachList(c);
      setCounts(sc);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [listId]);

  const loadMembers = useCallback(async () => {
    setIsFetching(true);
    try {
      const { rows, total: t } = await fetchOutreachListMembers({
        listId,
        page,
        pageSize: PAGE_SIZE,
        status: statusFilter,
        search,
      });
      setMembers(rows);
      setTotal(t);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsFetching(false);
      setIsLoading(false);
    }
  }, [listId, page, statusFilter, search]);

  useEffect(() => {
    void loadHeader();
  }, [loadHeader]);
  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const refreshAll = useCallback(() => {
    void loadHeader();
    void loadMembers();
  }, [loadHeader, loadMembers]);

  const lifecycleButton = useMemo(() => {
    if (!list) return null;
    if (list.status === "draft" || list.status === "paused") {
      return (
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-xs"
          onClick={async () => {
            try {
              await setOutreachListStatus(list, "active");
              refreshAll();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Update failed");
            }
          }}
        >
          <Play className="h-3.5 w-3.5" />
          {list.status === "draft" ? "Start outreach list" : "Resume"}
        </Button>
      );
    }
    if (list.status === "active") {
      return (
        <>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={async () => {
              try {
                await setOutreachListStatus(list, "paused");
                refreshAll();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Update failed");
              }
            }}
          >
            <Pause className="h-3.5 w-3.5" />
            Pause
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={async () => {
              const ok = await confirm({
                title: `Complete ${list.name}?`,
                description:
                  "Marks the outreach list finished. Members keep their state.",
                confirmLabel: "Complete",
              });
              if (!ok) return;
              try {
                await setOutreachListStatus(list, "completed");
                refreshAll();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Update failed");
              }
            }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Complete
          </Button>
        </>
      );
    }
    return null;
  }, [list, refreshAll]);

  const memberColumns: MatrxColumnDef<OutreachListMemberWithParty>[] = [
    {
      id: "party",
      accessorFn: (row) => row.party?.display_name ?? "",
      header: "Member",
      sortable: false,
      filter: false,
      href: (row) => (row.party ? `/crm/${row.party.id}` : undefined),
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {row.party?.display_name ?? "(record unavailable)"}
          </span>
          {row.party?.do_not_contact && (
            <span className="inline-flex shrink-0 items-center rounded-full border border-destructive/20 bg-destructive/15 px-1.5 py-0.5 text-[11px] font-medium leading-none text-destructive">
              DNC
            </span>
          )}
        </div>
      ),
    },
    {
      id: "job_title",
      accessorFn: (row) => row.party?.job_title ?? "",
      header: "Title",
      sortable: false,
      filter: false,
      cell: (row) => (
        <span className="truncate text-xs text-muted-foreground">
          {row.party?.job_title ?? "—"}
        </span>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      sortable: false,
      filter: false,
      width: 130,
      cell: (row) => <MemberStatusBadge status={row.status} />,
    },
    {
      id: "attempt_count",
      accessorKey: "attempt_count",
      header: "Attempts",
      sortable: false,
      filter: false,
      align: "right",
      width: 80,
      cell: (row) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {row.attempt_count}
        </span>
      ),
    },
    {
      id: "last_attempt_at",
      accessorKey: "last_attempt_at",
      header: "Last attempt",
      sortable: false,
      filter: false,
      width: 110,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {row.last_attempt_at ? formatRelativeTime(row.last_attempt_at) : "—"}
        </span>
      ),
    },
    {
      id: "next_attempt_at",
      accessorKey: "next_attempt_at",
      header: "Next try",
      sortable: false,
      filter: false,
      width: 110,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {row.next_attempt_at ? formatRelativeTime(row.next_attempt_at) : "—"}
        </span>
      ),
    },
    {
      id: "claimed",
      accessorFn: (row) => row.claimed_until ?? "",
      header: "Claim",
      sortable: false,
      filter: false,
      align: "center",
      width: 70,
      cell: (row) => {
        const held =
          row.claimed_until && new Date(row.claimed_until) > new Date();
        return (
          <span
            title={held ? "Claimed by a rep right now" : "Unclaimed"}
            className={cn(
              "inline-block h-2.5 w-2.5 rounded-full",
              held ? "bg-amber-500" : "bg-muted-foreground/20",
            )}
          />
        );
      },
    },
    {
      id: "notes",
      accessorKey: "notes",
      header: "Notes",
      sortable: false,
      filter: false,
      cell: (row) => (
        <span className="truncate text-xs text-muted-foreground">
          {row.notes ?? "—"}
        </span>
      ),
    },
  ];

  const memberMenu =
    (row: OutreachListMemberWithParty): (() => ItemMenuConfig) =>
    () => ({
      sections: [
        {
          id: "open",
          items: row.party
            ? [
                {
                  id: "open-record",
                  kind: "link" as const,
                  label: "Open CRM record",
                  href: `/crm/${row.party.id}`,
                },
              ]
            : [],
        },
        {
          id: "queue",
          items: [
            {
              id: "requeue",
              label: "Back to queue",
              onSelect: async () => {
                try {
                  await requeueMember(row.id);
                  refreshAll();
                  toast.success("Member requeued");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Requeue failed");
                }
              },
            },
          ],
        },
        {
          id: "danger",
          items: [
            {
              id: "remove",
              label: "Remove from outreach list",
              tone: "destructive" as const,
              onSelect: async () => {
                try {
                  await removeMember(row.id);
                  refreshAll();
                  toast.success("Member removed");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Remove failed");
                }
              },
            },
          ],
        },
      ],
    });

  const onTableState = (next: MatrxDataTableQueryState) => {
    if (next.search !== search) {
      setSearch(next.search);
      setPage(1);
      return;
    }
    setPage(next.page);
  };

  const rollupChips = counts ? (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => {
          setStatusFilter("all");
          setPage(1);
        }}
        className={cn(
          "rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none transition-colors",
          statusFilter === "all"
            ? "border-primary/40 bg-accent text-foreground"
            : "border-border text-muted-foreground hover:bg-accent/50",
        )}
      >
        All {counts.total.toLocaleString()}
      </button>
      {MEMBER_STATUSES.filter((s) => (counts[s] ?? 0) > 0).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => {
            setStatusFilter(statusFilter === s ? "all" : s);
            setPage(1);
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-full transition-opacity",
            statusFilter !== "all" && statusFilter !== s && "opacity-45",
          )}
          title={`Show only ${s.replace(/_/g, " ")}`}
        >
          <MemberStatusBadge status={s} />
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {(counts[s] ?? 0).toLocaleString()}
          </span>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-3 pt-[calc(var(--shell-header-h)+0.375rem)]">
        {list ? (
          <div className="flex flex-wrap items-center gap-2">
            <Megaphone className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-semibold text-foreground">
              {list.name}
            </span>
            <ListStatusBadge status={list.status} />
            <ListKindBadge kind={list.list_kind} />
            {list.description && (
              <span className="hidden truncate text-xs text-muted-foreground lg:inline">
                {list.description}
              </span>
            )}
            {/* Where these members came from — and a door back to it. */}
            {enrollmentSource && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                <Bookmark className="h-3 w-3" />
                {enrollmentSource.source === "saved_view" &&
                enrollmentSource.savedViewName ? (
                  <>
                    Filled from{" "}
                    <Link
                      href={`/crm?view=${enrollmentSource.savedViewId}`}
                      className="font-medium text-foreground underline underline-offset-2"
                      title={`Open the smart view "${enrollmentSource.savedViewName}" on /crm`}
                    >
                      {enrollmentSource.savedViewName}
                    </Link>
                  </>
                ) : (
                  <>Filled from a filter</>
                )}
                <span className="tabular-nums">
                  · {enrollmentSource.enrolled.toLocaleString()} enrolled{" "}
                  {formatRelativeTime(enrollmentSource.at)}
                </span>
              </span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {lifecycleButton}
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => setAddOpen(true)}
              >
                <ListPlus className="h-3.5 w-3.5" />
                Add members
              </Button>
              <Button size="sm" className="h-7 gap-1 px-2 text-xs" asChild>
                <Link href={`/crm/outreach-lists/${listId}/dial`}>
                  <PhoneCall className="h-3.5 w-3.5" />
                  Call queue
                  {counts && (
                    <span className="rounded-full bg-primary-foreground/20 px-1.5 text-[11px] tabular-nums">
                      {counts.dialable.toLocaleString()}
                    </span>
                  )}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="h-7" />
        )}
        {rollupChips && <div className="mt-1.5">{rollupChips}</div>}
        {error && (
          <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 px-3 pb-2 pt-2">
        <MatrxDataTable<OutreachListMemberWithParty>
          data={members}
          columns={memberColumns}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          isFetching={isFetching}
          zebra
          detail={{ enabled: false }}
          window={{ enabled: false }}
          onRowOpen={(row) => {
            if (row.party) router.push(`/crm/${row.party.id}`);
          }}
          query={{
            mode: "controlled",
            totalItems: total,
            state: {
              page,
              pageSize: PAGE_SIZE,
              search,
              anyOf: "",
              columnFilters: {},
              sort: { id: "created_at", direction: "asc" },
            },
            onStateChange: onTableState,
          }}
          toolbar={{ search: true, searchPlaceholder: "Search members…" }}
          rowActions={(row) => (
            <ItemMenu config={memberMenu(row)} align="end">
              <button
                type="button"
                aria-label={`Actions for ${row.party?.display_name ?? "member"}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </ItemMenu>
          )}
          copy={{
            label: "Outreach list member",
            listLabel: "Outreach list members",
            location: `/crm/outreach-lists/${listId}`,
            rowKind: "crm-outreach-list-member",
            listKind: "crm-outreach-list-member-list",
            humanRow: (row) =>
              `${row.party?.display_name ?? row.party_id} — ${row.status}, ${row.attempt_count} attempts`,
            showRow: false,
            showToolbar: false,
          }}
          emptyState={{
            icon: <ListPlus className="h-5 w-5" />,
            title:
              statusFilter === "all"
                ? "No members yet"
                : `No ${statusFilter.replace(/_/g, " ")} members`,
            description:
              statusFilter === "all"
                ? "Add members from the CRM list (select rows → Add to list) or enroll everyone matching a filter."
                : "Pick another status chip above, or clear the filter.",
            action:
              statusFilter === "all" ? (
                <Button
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => setAddOpen(true)}
                >
                  <ListPlus className="h-3.5 w-3.5" />
                  Add members
                </Button>
              ) : undefined,
          }}
        />
      </div>

      {list && ctx && (
        <AddMembersDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          list={list}
          ctx={ctx}
          onAdded={refreshAll}
        />
      )}
    </div>
  );
}
