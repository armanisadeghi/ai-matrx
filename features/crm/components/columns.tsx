// features/crm/components/columns.tsx
//
// The party list's column registry. APP POLICY (features/agents/browse):
// a column either sorts AND filters SERVER-SIDE, or its controls do not
// render at all. Sorting is on the DB column, never the rendered cell —
// which is why Employer (an embed) deliberately declares neither.

import {
  BadgeCheck,
  Building2,
  ChevronRight,
  Globe,
  PhoneOff,
  ShieldCheck,
  User,
} from "lucide-react";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { formatRelativeTime } from "@/utils/datetime";
import { cn } from "@/lib/utils";
import type { ExpertStatus, PartyListRow } from "../types";
import {
  DATE_BUCKETS,
  EXPERT_STATUSES,
  EXPERT_STATUS_LABEL,
  RECORD_CLASS_FILTERS,
  RECORD_CLASS_FILTER_LABEL,
} from "../types";

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

function isExpertStatus(value: string | null): value is ExpertStatus {
  return (EXPERT_STATUSES as readonly string[]).includes(value ?? "");
}

/** One renderer for a tier, everywhere — never a second hand-rolled pill. */
export function expertBadge(status: ExpertStatus) {
  const Icon = status === "registered" ? BadgeCheck : ShieldCheck;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        status === "vetted"
          ? "border-emerald-500/20 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : status === "approved"
            ? "border-primary/20 bg-primary/15 text-primary"
            : "border-border bg-muted text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      {EXPERT_STATUS_LABEL[status]}
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
        <span
          aria-hidden="true"
          className="ml-1 inline-flex shrink-0 items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-1 text-[11px] font-semibold text-primary sm:hidden"
        >
          Open
          <ChevronRight className="h-3 w-3" />
        </span>
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
    // Nullable by design: most parties are not experts. The filter's "any" /
    // "none" options are the two questions a user actually asks of a nullable
    // tier, and both are real server predicates (`not is null` / `is null`).
    id: "expert_status",
    accessorKey: "expert_status",
    header: "Expert",
    sortable: true,
    filter: "select",
    filterOptions: [
      { value: "any", label: "Any expert" },
      ...EXPERT_STATUSES.map((s) => ({
        value: s,
        label: EXPERT_STATUS_LABEL[s],
      })),
      { value: "none", label: "Not an expert" },
    ],
    width: 110,
    cell: (row) =>
      isExpertStatus(row.expert_status) ? (
        expertBadge(row.expert_status)
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    // THE VISIBLE HALF of the record-class rule. The list hides
    // platform-discovered records by default; this is where a user says "show
    // me the SEO prospects" or "show me everything". Hidden by default must
    // never mean unreachable.
    id: "record_class",
    accessorKey: "record_class",
    header: "Record",
    sortable: false,
    filter: "select",
    filterOptions: RECORD_CLASS_FILTERS.map((v) => ({
      value: v,
      label: RECORD_CLASS_FILTER_LABEL[v],
    })),
    width: 120,
    cell: (row) =>
      row.record_class === "discovered" ? (
        <span
          className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
          title="Found by the platform (SEO prospect, media outlet, expert or channel) — not one of your contacts until you say so."
        >
          Found
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
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
