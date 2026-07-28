// features/crm/components/columns.tsx
//
// The party list's column registry. APP POLICY (features/agents/browse):
// a column either sorts AND filters SERVER-SIDE, or its controls do not
// render at all. Sorting is on the DB column, never the rendered cell —
// which is why Employer (an embed) deliberately declares neither.

import { Building2, Globe, PhoneOff, User } from "lucide-react";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { formatRelativeTime } from "@/utils/datetime";
import { cn } from "@/lib/utils";
import type { PartyListRow } from "../types";
import { DATE_BUCKETS } from "../types";

const DATE_BUCKET_OPTIONS = DATE_BUCKETS.map((b) => ({
  value: b.value,
  label: b.label,
}));

function kindBadge(row: PartyListRow) {
  const isPerson = row.party_kind === "person";
  const Icon = isPerson ? User : Building2;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        isPerson
          ? "border-sky-500/20 bg-sky-500/15 text-sky-600 dark:text-sky-400"
          : "border-violet-500/20 bg-violet-500/15 text-violet-600 dark:text-violet-400",
      )}
    >
      <Icon className="h-3 w-3" />
      {isPerson ? "Person" : "Company"}
    </span>
  );
}

/**
 * Every column the party table can show. `sortable`/`filter` reflect exactly
 * what `fetchPartyPage` can serve — a control the server can't honor must not
 * render (the /transcripts defect this policy exists to kill).
 */
export const PARTY_COLUMNS: MatrxColumnDef<PartyListRow>[] = [
  {
    id: "display_name",
    accessorKey: "display_name",
    header: "Name",
    sortable: true,
    filter: "text",
    // D112: real link on the title cell — keyboard/SR/middle-click reach the
    // record; the whole-row click stays as a mouse convenience.
    href: (row) => `/crm/${row.id}`,
    cell: (row) => (
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground">
          {row.display_name}
        </span>
        {row.do_not_contact && (
          <span
            title={row.do_not_contact_reason ?? "Do not contact"}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/20 bg-destructive/15 px-1.5 py-0.5 text-[11px] font-medium leading-none text-destructive"
          >
            <PhoneOff className="h-3 w-3" />
            DNC
          </span>
        )}
      </div>
    ),
  },
  {
    id: "party_kind",
    accessorKey: "party_kind",
    header: "Kind",
    sortable: true,
    filter: "select",
    filterOptions: [
      { value: "person", label: "Person" },
      { value: "organization", label: "Company" },
    ],
    cell: (row) => kindBadge(row),
    width: 110,
  },
  {
    id: "job_title",
    accessorKey: "job_title",
    header: "Title",
    sortable: true,
    filter: "text",
    cell: (row) => (
      <span className="truncate text-xs text-muted-foreground">
        {row.job_title ?? "—"}
      </span>
    ),
  },
  {
    // Maintained by crm._affiliation_edge from the primary affiliation — an
    // embed, so it can neither sort nor filter server-side here. No controls.
    id: "employer",
    accessorFn: (row) => row.employer?.display_name ?? "",
    header: "Employer",
    sortable: false,
    filter: false,
    cell: (row) =>
      row.employer ? (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-foreground">
          <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{row.employer.display_name}</span>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    id: "primary_domain",
    accessorKey: "primary_domain",
    header: "Domain",
    sortable: true,
    filter: "text",
    cell: (row) =>
      row.primary_domain ? (
        <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <Globe className="h-3 w-3 shrink-0" />
          <span className="truncate">{row.primary_domain}</span>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    id: "do_not_contact",
    accessorKey: "do_not_contact",
    header: "DNC",
    sortable: true,
    filter: "boolean",
    align: "center",
    width: 70,
    cell: (row) => (
      <span
        className={cn(
          "inline-block h-2.5 w-2.5 rounded-full",
          row.do_not_contact ? "bg-destructive" : "bg-muted-foreground/20",
        )}
      />
    ),
  },
  {
    id: "updated_at",
    accessorKey: "updated_at",
    header: "Updated",
    sortable: true,
    // A date column's finite value set is "how recently", not a timestamp —
    // relative buckets served as `updated_at >= now() - bucket`.
    filter: "select",
    filterOptions: DATE_BUCKET_OPTIONS,
    width: 110,
    cell: (row) => (
      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {formatRelativeTime(row.updated_at)}
      </span>
    ),
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    header: "Created",
    sortable: true,
    filter: "select",
    filterOptions: DATE_BUCKET_OPTIONS,
    width: 110,
    cell: (row) => (
      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {formatRelativeTime(row.created_at)}
      </span>
    ),
  },
];
