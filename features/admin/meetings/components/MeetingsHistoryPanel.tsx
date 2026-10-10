"use client";

// Meetings admin › History — every meeting on the platform, searched on the
// server (communication.meet_admin_meetings, admin lane): title/slug text,
// organization, state, date range. Loaded pages of 200; the table then sorts
// and filters what is loaded. Each row opens the meeting's own home mounted
// inside the admin section (/administration/users/meetings/<id>), because the
// user-side /meetings/<id> runs without the admin lane and would refuse a
// meeting the admin is not invited to.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarSearch, X } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { formatAbsoluteDate, formatCount, formatDurationMinutes } from "@ai-matrx/kit/format";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { AdminUserRef } from "@/features/admin/users/components/AdminUserRef";
import { cn } from "@/lib/utils";
import {
  HISTORY_PAGE_SIZE,
  MEETING_STATES,
  isMeetingState,
  searchAdminMeetings,
  type AdminMeetingRow,
  type MeetingSearch,
  type MeetingState,
} from "../service";

import { readOf } from "@ai-matrx/design-system";
export const adminMeetingHref = (id: string) => `/administration/users/meetings/${id}`;

const STATE_TONE: Record<MeetingState, string> = {
  live: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  ended: "bg-muted text-muted-foreground",
  scheduled: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  cancelled: "bg-destructive/10 text-destructive-ink",
  archived: "bg-muted text-muted-foreground",
};

function when(row: AdminMeetingRow): string | null {
  return row.started_at ?? row.scheduled_for;
}

const columns: MatrxColumnDef<AdminMeetingRow>[] = [
  {
    id: "title",
    header: "Meeting",
    accessorFn: (row) => row.title,
    frozen: true,
    width: 260,
    href: (row) => adminMeetingHref(row.id),
    cell: (row) => (
      <div className="min-w-0">
        <div className="truncate font-medium" title={row.title}>{row.title}</div>
      </div>
    ),
  },
  {
    id: "state",
    header: "State",
    accessorFn: (row) => row.state,
    filter: "select",
    width: 90,
    cell: (row) => <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", STATE_TONE[row.state])}>{row.state}</span>,
  },
  {
    id: "organization",
    header: "Organization",
    accessorFn: (row) => row.organization_name ?? row.organization_id,
    filter: "select",
    width: 200,
    cell: (row) => <EntityRef token="organization" id={row.organization_id} name={row.organization_name} openInNewTab />,
  },
  {
    id: "host",
    header: "Host",
    accessorFn: (row) => row.host_name ?? row.host_email ?? "",
    width: 200,
    cell: (row) => (row.host_user_id ? <AdminUserRef userId={row.host_user_id} name={row.host_name} email={row.host_email} hideEmail /> : <span className="text-muted-foreground">—</span>),
  },
  { id: "host-email", header: "Host email", accessorFn: (row) => row.host_email ?? "", width: 200, hidden: true },
  {
    id: "when",
    header: "When",
    accessorFn: (row) => when(row) ?? "",
    filter: "date",
    width: 150,
    defaultSortDirection: "desc",
    cell: (row) => {
      const at = when(row);
      return at ? <span title={row.started_at ? "Started" : "Scheduled for"}>{formatAbsoluteDate(at, { dateStyle: "medium", timeStyle: "short" })}</span> : <span className="text-muted-foreground">—</span>;
    },
  },
  {
    id: "duration",
    header: "Duration",
    accessorFn: (row) => row.duration_minutes,
    filter: "number",
    align: "right",
    width: 90,
    cell: (row) => (row.duration_minutes === null ? <span className="text-muted-foreground">—</span> : formatDurationMinutes(row.duration_minutes, { style: "compact" })),
  },
  { id: "participants", header: "People", label: "Participants who joined (AI excluded)", accessorFn: (row) => row.participants, filter: "number", align: "right", width: 80 },
  { id: "recordings", header: "Recordings", accessorFn: (row) => row.recordings, filter: "number", align: "right", width: 95 },
  {
    id: "ai",
    header: "AI",
    label: "AI note-taker on",
    accessorFn: (row) => row.ai_enabled,
    filter: "boolean",
    width: 60,
    cell: (row) => (row.ai_enabled ? <span className="text-foreground">On</span> : <span className="text-muted-foreground">Off</span>),
  },
];

const ALL = "__all";

export function MeetingsHistoryPanel({
  organizationId,
  onOrganizationChange,
}: {
  organizationId: string | null;
  onOrganizationChange: (organizationId: string | null) => void;
}) {
  const [draftQuery, setDraftQuery] = useState("");
  const [search, setSearch] = useState<Omit<MeetingSearch, "organizationId">>({ query: "", state: null, from: null, to: null });
  const [rows, setRows] = useState<AdminMeetingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const router = useRouter();

  const full: MeetingSearch = { ...search, organizationId };
  const key = JSON.stringify(full);

  useEffect(() => {
    let live = true;
    setLoading(true);
    searchAdminMeetings(JSON.parse(key) as MeetingSearch, 0).then(
      (page) => {
        if (!live) return;
        setRows(page.rows);
        setTotal(page.total);
        setError(null);
        setLoading(false);
      },
      (thrown: unknown) => {
        if (!live) return;
        setError(thrown instanceof Error ? thrown.message : String(thrown));
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [key, nonce]);

  const loadMore = async () => {
    setLoading(true);
    try {
      const page = await searchAdminMeetings(full, rows.length);
      setRows((current) => [...current, ...page.rows]);
      setTotal(page.total);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setLoading(false);
    }
  };

  const orgName = organizationId ? (rows.find((row) => row.organization_id === organizationId)?.organization_name ?? null) : null;
  const filtersActive = Boolean(search.query || search.state || search.from || search.to || organizationId);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch((current) => ({ ...current, query: draftQuery }));
        }}
      >
        <Input
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
          onBlur={() => setSearch((current) => (current.query === draftQuery ? current : { ...current, query: draftQuery }))}
          placeholder="Search title or link name, press Enter"
          className="w-64"
          aria-label="Search meetings by title or link name"
        />
        <Select value={search.state ?? ALL} onValueChange={(value) => setSearch((current) => ({ ...current, state: isMeetingState(value) ? value : null }))}>
          <SelectTrigger className="w-36" aria-label="State">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Every state</SelectItem>
            {MEETING_STATES.map((state) => (
              <SelectItem key={state} value={state}>{state.charAt(0).toUpperCase() + state.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          From
          <Input type="date" value={search.from ?? ""} onChange={(event) => setSearch((current) => ({ ...current, from: event.target.value || null }))} className="w-36" />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          To
          <Input type="date" value={search.to ?? ""} onChange={(event) => setSearch((current) => ({ ...current, to: event.target.value || null }))} className="w-36" />
        </label>
        {organizationId ? (
          <span className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-muted/50 pl-2 text-xs">
            Organization: <span className="font-medium">{orgName ?? organizationId.slice(0, 8)}</span>
            <button type="button" className="rounded p-1 hover:bg-muted" aria-label="Show every organization" onClick={() => onOrganizationChange(null)}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">All organizations</span>
        )}
        {filtersActive ? (
          <Button
            type="button"
            variant="quiet"
            onClick={() => {
              setDraftQuery("");
              setSearch({ query: "", state: null, from: null, to: null });
              if (organizationId) onOrganizationChange(null);
            }}
          >
            Clear
          </Button>
        ) : null}
        <Button type="button" variant="quiet" className="ml-auto" onClick={() => setNonce((n) => n + 1)}>Refresh</Button>
      </form>

      {error ? (
        <div className="relative rounded-md border border-destructive/40 bg-destructive/5 p-3 pr-10 text-sm text-destructive-ink">
          Meetings could not be read: {error}
          <ErrorAlchemyMenu error={error} operation="Search platform meeting history" />
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <MatrxDataTable
          tableId="admin-meetings-history"
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          isLoading={loading && rows.length === 0}
          isFetching={loading && rows.length > 0}
          stickyHeader
          density="condensed"
          defaultSort={{ id: "when", direction: "desc" }}
          getRowHref={(row) => adminMeetingHref(row.id)}
          onRowOpen={(row) => router.push(adminMeetingHref(row.id))}
          coverage={{ noun: "meeting", answeredBy: "client", loaded: rows.length, matched: total, cap: HISTORY_PAGE_SIZE }}
          toolbar={{ title: "Meetings", search: true }}
          read={readOf({ loading, error }, { what: "platform meeting history" })}
          emptyState={{
            icon: <CalendarSearch className="h-5 w-5" />,
            title: filtersActive ? "No meeting matches these filters" : "No meetings on the platform yet",
            description: filtersActive ? "Clear a filter above to widen the search." : "Meetings appear here as soon as anyone schedules or starts one.",
          }}
        />
      </div>
      {rows.length < total ? (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          Showing {formatCount(rows.length)} of {formatCount(total)} matching meetings.
          <Button type="button" variant="outline" disabled={loading} onClick={() => void loadMore()}>
            Load {formatCount(Math.min(HISTORY_PAGE_SIZE, total - rows.length))} more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
