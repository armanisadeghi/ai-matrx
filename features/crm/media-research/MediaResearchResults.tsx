"use client";

// features/crm/media-research/MediaResearchResults.tsx
//
// The answer's shape (Brief 3): the outcome first, then the table (journalist,
// outlet, status, why them, anchor piece, pitch note, contact state), then the
// cuts with their reasons. Partial is labeled partial. An address is shown only
// when it is verified, or quarantined together with the reason it failed.

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { cn } from "@/lib/utils";
import { MatrxDataTable, type MatrxColumnDef, type MatrxDataTableCopyConfig } from "@ai-matrx/design-system/data-table";
import {
  CONTACT_LABEL,
  STATUS_LABEL,
  type MediaResearchResultData,
  type MediaResearchRow,
} from "./service";

const STATUS_TONE: Record<MediaResearchRow["status"], string> = {
  fit: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  soft_fit: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  research_needed: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  cut: "bg-muted text-muted-foreground",
};

export function MediaResearchResults({ result }: { result: MediaResearchResultData }) {
  const s = result.summary;
  const rows = result.rows ?? [];
  const cuts = result.cuts ?? [];
  return (
    <section aria-label="Research results" data-testid="media-research-results" className="space-y-3 text-sm">
      <div
        className={cn(
          "rounded-md border p-2.5",
          result.status === "partial" ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-muted/20",
        )}
      >
        <p className="font-medium text-foreground" data-testid="media-research-says">
          {result.reused ? "Already ran — " : ""}
          {result.says}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Asked for {s.requested} good fits · {s.multiplier}x → research target {s.research_target} ·{" "}
          {s.resolved} resolved · {s.first_wave} in the first wave · {s.added_to_list ?? 0} added to this list
          {(s.already_on_list ?? 0) > 0 ? ` (${s.already_on_list} were already on it)` : ""}
        </p>
        {(s.gaps ?? []).length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
            {(s.gaps ?? []).map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        )}
        {(result.problems ?? []).length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-xs text-amber-700 dark:text-amber-400" data-testid="media-research-problems">
            {(result.problems ?? []).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>

      <ResearchTable rows={rows} caption="Journalists" />
      {cuts.length > 0 && <ResearchTable rows={cuts} caption={`Cut (${cuts.length})`} cuts />}

      {result.next_action ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Next:</span> {result.next_action}
        </p>
      ) : null}
      <p className="font-mono text-[10px] text-muted-foreground">run {result.run_key}</p>
    </section>
  );
}

export function ResearchTable({
  rows,
  caption,
  cuts = false,
}: {
  rows: MediaResearchRow[];
  caption: string;
  cuts?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No journalists in this group.</p>;
  }
  return (
    <MatrxDataTable<MediaResearchRow>
      tableId={cuts ? "crm/media-research/cuts" : "crm/media-research/journalists"}
      data={rows}
      columns={cuts ? CUT_COLUMNS : JOURNALIST_COLUMNS}
      getRowId={(row) => row.party_id}
      pageSize={0}
      density="condensed"
      viewTabs={false}
      toolbar={{ title: caption, searchPlaceholder: "Search journalists" }}
      detail={{ enabled: false }}
      copy={cuts ? CUT_COPY : JOURNALIST_COPY}
      emptyState={{ title: "No journalists in this group" }}
    />
  );
}

function contactText(row: MediaResearchRow): string {
  return [CONTACT_LABEL[row.contact_state ?? "unresolved"], row.contact_address, row.contact_note]
    .filter(Boolean)
    .join(" · ");
}

function journalistColumns(cuts: boolean): MatrxColumnDef<MediaResearchRow>[] {
  const cols: MatrxColumnDef<MediaResearchRow>[] = [
    {
      id: "journalist",
      header: "Journalist",
      accessorFn: (row) => row.name,
      filter: "text",
      width: 200,
      frozen: true,
      cell: (row) => (
        <div>
          <EntityRef token="party" id={row.party_id} name={row.name} />
          {row.first_wave ? (
            <span className="ml-1 rounded bg-primary/10 px-1 text-[10px] text-primary-ink">first wave</span>
          ) : null}
          {row.fit_check ? (
            <div className="text-[10px] text-muted-foreground">fit check: {row.fit_check.replace("_", " ")}</div>
          ) : null}
        </div>
      ),
    },
    {
      id: "outlet",
      header: "Outlet",
      accessorFn: (row) => row.outlet ?? "",
      filter: "text",
      width: 150,
      cell: (row) => <span className="text-muted-foreground">{row.outlet ?? "—"}</span>,
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row) => row.status,
      filter: "select",
      filterOptions: (Object.keys(STATUS_LABEL) as MediaResearchRow["status"][]).map((value) => ({
        value,
        label: STATUS_LABEL[value],
      })),
      width: 140,
      cell: (row) => (
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", STATUS_TONE[row.status])}>
          {STATUS_LABEL[row.status]}
        </span>
      ),
    },
    {
      id: "why",
      header: cuts ? "Why cut" : "Why them",
      accessorFn: (row) => [cuts ? row.cut_reason : null, row.why_them].filter(Boolean).join(" "),
      filter: "text",
      width: 280,
      cell: (row) => (
        <span className="text-foreground">
          {cuts && row.cut_reason ? (
            <span className="mr-1 font-mono text-[10px] text-muted-foreground">{row.cut_reason}</span>
          ) : null}
          {row.why_them || "—"}
        </span>
      ),
    },
    {
      id: "anchor",
      header: "Anchor",
      accessorFn: (row) => row.anchor?.title || row.anchor?.url || "",
      filter: "text",
      width: 220,
      cell: (row) =>
        row.anchor ? (
          <a href={row.anchor.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            {row.anchor.title || row.anchor.url}
            {row.anchor.published_at ? (
              <span className="ml-1 text-muted-foreground">({row.anchor.published_at.slice(0, 10)})</span>
            ) : null}
          </a>
        ) : (
          <span className="text-muted-foreground">No dated piece</span>
        ),
    },
  ];
  if (!cuts) {
    cols.push({
      id: "pitch",
      header: "Pitch note",
      accessorFn: (row) => row.pitch_note ?? "",
      filter: "text",
      width: 220,
      cell: (row) => <span className="text-muted-foreground">{row.pitch_note || "—"}</span>,
    });
  }
  cols.push({
    id: "contact",
    header: "Contact",
    accessorFn: (row) => row.contact_state ?? "unresolved",
    filter: "select",
    filterOptions: (Object.keys(CONTACT_LABEL) as (keyof typeof CONTACT_LABEL)[]).map((value) => ({
      value,
      label: CONTACT_LABEL[value],
    })),
    width: 200,
    cell: (row) => (
      <div>
        <span
          className={cn(
            "font-medium",
            row.contact_state === "verified" && "text-emerald-700 dark:text-emerald-400",
            row.contact_state === "quarantined" && "text-amber-700 dark:text-amber-400",
            row.contact_state === "unresolved" && "text-muted-foreground",
          )}
        >
          {CONTACT_LABEL[row.contact_state ?? "unresolved"]}
        </span>
        {row.contact_address ? <div className="font-mono text-[10px]">{row.contact_address}</div> : null}
        {row.contact_state !== "verified" && row.contact_note ? (
          <div className="text-[10px] text-muted-foreground">{row.contact_note}</div>
        ) : null}
      </div>
    ),
  });
  return cols;
}

const JOURNALIST_COLUMNS = journalistColumns(false);
const CUT_COLUMNS = journalistColumns(true);

function copyConfig(cuts: boolean): MatrxDataTableCopyConfig<MediaResearchRow> {
  return {
    label: cuts ? "Cut journalist" : "Journalist",
    listLabel: cuts ? "Cut journalists (this view)" : "Researched journalists (this view)",
    location: "Media research — results",
    rowKind: cuts ? "media-research-cut" : "media-research-journalist",
    listKind: cuts ? "media-research-cuts" : "media-research-journalists",
    rowDescription: "One journalist the media research judged, with the reason and contact state.",
    listDescription: "The journalists from a media research run, as currently shown.",
    humanRow: (row) =>
      [
        `Journalist: ${row.name}`,
        `Outlet: ${row.outlet ?? "—"}`,
        `Status: ${STATUS_LABEL[row.status]}`,
        `${cuts ? "Why cut" : "Why them"}: ${[cuts ? row.cut_reason : null, row.why_them].filter(Boolean).join(" ") || "—"}`,
        `Anchor: ${row.anchor ? `${row.anchor.title || row.anchor.url} (${row.anchor.url})` : "No dated piece"}`,
        ...(cuts ? [] : [`Pitch note: ${row.pitch_note || "—"}`]),
        `Contact: ${contactText(row)}`,
      ].join("\n"),
  };
}

const JOURNALIST_COPY = copyConfig(false);
const CUT_COPY = copyConfig(true);
