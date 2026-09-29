"use client";

// features/crm/media-research/MediaResearchResults.tsx
//
// The answer's shape (Brief 3): the outcome first, then the table (journalist,
// outlet, status, why them, anchor piece, pitch note, contact state), then the
// cuts with their reasons. Partial is labeled partial. An address is shown only
// when it is verified, or quarantined together with the reason it failed.

import Link from "next/link";
import { cn } from "@/lib/utils";
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
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[720px] text-xs" data-testid={cuts ? "media-research-cuts" : "media-research-table"}>
        <caption className="px-2 py-1.5 text-left text-xs font-semibold text-foreground">{caption}</caption>
        <thead className="bg-muted/40 text-left text-[11px] text-muted-foreground">
          <tr>
            <th className="px-2 py-1">Journalist</th>
            <th className="px-2 py-1">Outlet</th>
            <th className="px-2 py-1">Status</th>
            <th className="px-2 py-1">{cuts ? "Why cut" : "Why them"}</th>
            <th className="px-2 py-1">Anchor</th>
            {!cuts && <th className="px-2 py-1">Pitch note</th>}
            <th className="px-2 py-1">Contact</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.party_id} className="border-t border-border align-top">
              <td className="px-2 py-1.5">
                <Link href={`/crm/${row.party_id}`} className="font-medium text-foreground hover:underline">
                  {row.name}
                </Link>
                {row.first_wave ? (
                  <span className="ml-1 rounded bg-primary/10 px-1 text-[10px] text-primary">first wave</span>
                ) : null}
                {row.fit_check ? (
                  <div className="text-[10px] text-muted-foreground">fit check: {row.fit_check.replace("_", " ")}</div>
                ) : null}
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">{row.outlet ?? "—"}</td>
              <td className="px-2 py-1.5">
                <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", STATUS_TONE[row.status])}>
                  {STATUS_LABEL[row.status]}
                </span>
              </td>
              <td className="max-w-[260px] px-2 py-1.5 text-foreground">
                {cuts && row.cut_reason ? (
                  <span className="mr-1 font-mono text-[10px] text-muted-foreground">{row.cut_reason}</span>
                ) : null}
                {row.why_them || "—"}
              </td>
              <td className="max-w-[200px] px-2 py-1.5">
                {row.anchor ? (
                  <a href={row.anchor.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {row.anchor.title || row.anchor.url}
                    {row.anchor.published_at ? (
                      <span className="ml-1 text-muted-foreground">({row.anchor.published_at.slice(0, 10)})</span>
                    ) : null}
                  </a>
                ) : (
                  <span className="text-muted-foreground">No dated piece</span>
                )}
              </td>
              {!cuts && <td className="max-w-[200px] px-2 py-1.5 text-muted-foreground">{row.pitch_note || "—"}</td>}
              <td className="px-2 py-1.5">
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
