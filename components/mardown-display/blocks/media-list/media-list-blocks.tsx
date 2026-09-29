"use client";

/**
 * Canonical renderers for the media list ranker's kinds (crm.media_list_ranker, Brief 3):
 * `media_list_ranking_result` (the ranked board) and `media_candidate_verdict` (one candidate).
 *
 * Shapes are Python-owned (`aidream/aidream/kinds/media_list.py`); payload types are generated from the
 * live registry. Streaming-first: the board takes the uniform `{ value, isComplete }` bridge, every
 * candidate row paints the moment it parses, and every field is read defensively — a half-arrived
 * candidate is a normal state, never an error.
 */

import React from "react";
import {
  AlertTriangle,
  ChevronDown,
  CircleSlash,
  ExternalLink,
  Mail,
  Megaphone,
  SearchCheck,
  Trophy,
} from "lucide-react";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { KindHeaderBar } from "@/components/kind-kit/KindHeaderBar";
import { mediaCandidateLine } from "@/features/content-ir/kinds/media-list";
import type { MediaCandidateVerdict } from "@/features/content-ir/kinds/generated/kinds.generated";
import { cn } from "@/lib/utils";

import { readSearchKindValue } from "../search-kinds/search-kind-data";

type Status = MediaCandidateVerdict["status"];
type Candidate = Partial<MediaCandidateVerdict> & Record<string, unknown>;

const STATUS_ORDER: Status[] = ["fit", "soft_fit", "research_needed", "cut"];

const STATUS_META: Record<Status, { label: string; tone: string; dot: string }> = {
  fit: { label: "Fit", tone: "border-success/40 bg-success/10 text-success", dot: "bg-success" },
  soft_fit: { label: "Soft fit", tone: "border-warning/40 bg-warning/10 text-warning", dot: "bg-warning" },
  research_needed: {
    label: "Research needed",
    tone: "border-primary/40 bg-primary/10 text-primary",
    dot: "bg-primary",
  },
  cut: { label: "Cut", tone: "border-border bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

const CONTACT_LABEL: Record<string, string> = {
  verified: "Contact verified",
  quarantined: "Contact quarantined",
  unresolved: "Contact unresolved",
};

const REACH_LABEL: Record<string, string> = {
  confirmed: "Reachable",
  candidate_only: "Candidate address only",
  none: "No way to reach",
  unknown: "Reach unknown",
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function statusOf(item: Candidate): Status | null {
  const s = item.status;
  return typeof s === "string" && (STATUS_ORDER as string[]).includes(s) ? (s as Status) : null;
}

function StatusPill({ status }: { status: Status | null }) {
  if (!status) {
    return (
      <span className="inline-flex h-5 w-16 animate-pulse rounded-full bg-muted" aria-label="Status arriving" />
    );
  }
  const meta = STATUS_META[status];
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", meta.tone)}>
      {meta.label}
    </span>
  );
}

function Chip({ children, warn = false }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px]",
        warn ? "text-warning" : "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** One candidate — shared by the board rows and the standalone item kind. */
function CandidateBody({ item }: { item: Candidate }) {
  const status = statusOf(item);
  const anchor = isRecord(item.anchor) ? item.anchor : null;
  const concerns = Array.isArray(item.concerns) ? item.concerns.filter((c) => typeof c === "string") : [];
  const contact = str(item.contact_state);
  const reach = str(item.reachability);
  const whyThem = str(item.why_them);
  const pitch = str(item.pitch_note);
  const cutReason = str(item.cut_reason);
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-xs font-semibold text-foreground">{str(item.id) || "…"}</span>
        <StatusPill status={status} />
        {contact && (
          <Chip warn={contact !== "verified"}>
            <Mail className="h-3 w-3" />
            {CONTACT_LABEL[contact] ?? contact}
          </Chip>
        )}
        {reach && <Chip warn={reach !== "confirmed"}>{REACH_LABEL[reach] ?? reach}</Chip>}
        {cutReason && (
          <Chip>
            <CircleSlash className="h-3 w-3" />
            {cutReason.replaceAll("_", " ")}
          </Chip>
        )}
      </div>
      {anchor && str(anchor.title) && (
        <a
          href={str(anchor.url) || undefined}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{str(anchor.title)}</span>
          {str(anchor.published_at) && (
            <span className="shrink-0 text-muted-foreground">· {str(anchor.published_at)}</span>
          )}
        </a>
      )}
      {whyThem ? (
        <p className="text-sm leading-snug text-foreground">{whyThem}</p>
      ) : (
        <div className="h-3 w-3/4 animate-pulse rounded bg-muted" aria-label="Reason arriving" />
      )}
      {pitch && (
        <p className="flex items-start gap-1 text-xs leading-snug text-muted-foreground">
          <Megaphone className="mt-0.5 h-3 w-3 shrink-0" />
          {pitch}
        </p>
      )}
      {concerns.length > 0 && (
        <ul className="space-y-0.5">
          {concerns.map((concern, i) => (
            <li key={i} className="flex items-start gap-1 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {concern}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CandidateRow({ item }: { item: Candidate }) {
  const rank = typeof item.rank === "number" && item.rank > 0 ? item.rank : null;
  return (
    <li className="flex items-start gap-3 border-b border-border px-1 py-2 last:border-0 animate-in fade-in duration-300">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular-nums text-foreground">
        {rank ?? "–"}
      </span>
      <CandidateBody item={item} />
      <CopyButtons
        size="sm"
        label="Copy candidate"
        hide={["export"]}
        human={() => mediaCandidateLine(item)}
        agent={() => ({
          kind: "media_candidate_verdict",
          location: "Media list ranking",
          description: "One researched media candidate judged for one angle.",
          data: item,
        })}
      />
    </li>
  );
}

function SummaryStrip({ summary }: { summary: Record<string, unknown> }) {
  const stat = (label: string, value: unknown) => (
    <span className="whitespace-nowrap">
      <span className="font-semibold tabular-nums text-foreground">
        {typeof value === "number" ? value : "—"}
      </span>{" "}
      {label}
    </span>
  );
  const gaps = Array.isArray(summary.gaps) ? summary.gaps.filter((g) => typeof g === "string") : [];
  return (
    <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {stat("asked for", summary.requested)}
        {stat("researched", summary.research_target)}
        {stat("resolved", summary.resolved)}
        {stat("in the first wave", summary.first_wave)}
      </div>
      {str(summary.multiplier_reason) && <p>{str(summary.multiplier_reason)}</p>}
      {gaps.map((gap, i) => (
        <p key={i} className="flex items-start gap-1 text-warning">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          Gap: {gap}
        </p>
      ))}
    </div>
  );
}

interface MediaListBlockProps {
  serverData?: unknown;
  className?: string;
}

export function MediaListRankingBlock({ serverData, className }: MediaListBlockProps) {
  const { value, isComplete } = readSearchKindValue<"media_list_ranking_result">(serverData);
  const results: Candidate[] = Array.isArray(value.results)
    ? (value.results as unknown[]).filter(isRecord).map((r) => r as Candidate)
    : [];
  const summary = isRecord(value.summary) ? value.summary : null;
  const [filter, setFilter] = React.useState<Status | "all">("all");
  const [showCut, setShowCut] = React.useState(false);

  const counts = STATUS_ORDER.reduce(
    (acc, s) => ({ ...acc, [s]: results.filter((r) => statusOf(r) === s).length }),
    {} as Record<Status, number>,
  );
  const ranked = [...results].sort((a, b) => {
    const sa = statusOf(a);
    const sb = statusOf(b);
    const oa = sa ? STATUS_ORDER.indexOf(sa) : 99;
    const ob = sb ? STATUS_ORDER.indexOf(sb) : 99;
    if (oa !== ob) return oa - ob;
    const ra = typeof a.rank === "number" && a.rank > 0 ? a.rank : 999;
    const rb = typeof b.rank === "number" && b.rank > 0 ? b.rank : 999;
    return ra - rb;
  });
  const visible = ranked.filter((r) => (filter === "all" ? statusOf(r) !== "cut" : statusOf(r) === filter));
  const cut = ranked.filter((r) => statusOf(r) === "cut");

  return (
    <section
      data-kind-renderer="media_list_ranking_result"
      className={cn("@container my-3 space-y-2 rounded-xl border border-border bg-card p-3", className)}
    >
      <KindHeaderBar
        icon={Trophy}
        title="Media list"
        subtitle="Every researched candidate for this angle, judged and ranked."
        streaming={!isComplete}
        stats={[
          { label: "fit", value: counts.fit },
          { label: "soft fit", value: counts.soft_fit },
          { label: "research", value: counts.research_needed },
          { label: "cut", value: counts.cut },
        ]}
        copy={{
          label: "Media list",
          human: () => results.map(mediaCandidateLine).join("\n"),
          json: () => value,
          agent: () => ({
            kind: "media_list_ranking_result",
            location: "Media list ranking",
            description: "A ranked media list for one angle: every candidate's status, anchor and reason.",
            data: value,
            summary: `${counts.fit} fit, ${counts.soft_fit} soft fit, ${counts.research_needed} need research, ${counts.cut} cut`,
          }),
        }}
      />

      {summary && <SummaryStrip summary={summary} />}

      {results.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...STATUS_ORDER] as const).map((s) => {
            const n = s === "all" ? results.length - counts.cut : counts[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  filter === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {s === "all" ? "Kept" : STATUS_META[s].label} {n}
              </button>
            );
          })}
        </div>
      )}

      {results.length === 0 && !isComplete ? (
        <ul aria-label="Candidates arriving" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-start gap-3 px-1 py-2">
              <span className="h-6 w-6 animate-pulse rounded-md bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              </div>
            </li>
          ))}
        </ul>
      ) : results.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">No candidates were judged.</p>
      ) : (
        <ul>
          {visible.map((item, i) => (
            <CandidateRow key={`${str(item.id)}-${i}`} item={item} />
          ))}
          {visible.length === 0 && (
            <li className="px-1 py-2 text-sm text-muted-foreground">None with this status.</li>
          )}
        </ul>
      )}

      {filter === "all" && cut.length > 0 && (
        <div className="border-t border-border pt-1">
          <button
            type="button"
            onClick={() => setShowCut((v) => !v)}
            className="flex items-center gap-1 px-1 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", showCut && "rotate-180")} />
            {cut.length} cut
          </button>
          {showCut && (
            <ul>
              {cut.map((item, i) => (
                <CandidateRow key={`cut-${str(item.id)}-${i}`} item={item} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function MediaCandidateVerdictBlock({ serverData, className }: MediaListBlockProps) {
  const { value } = readSearchKindValue<"media_candidate_verdict">(serverData);
  const item = value as Candidate;
  return (
    <section
      data-kind-renderer="media_candidate_verdict"
      className={cn("my-2 flex items-start gap-3 rounded-xl border border-border bg-card p-3", className)}
    >
      <SearchCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <CandidateBody item={item} />
      <CopyButtons
        size="sm"
        label="Copy candidate"
        hide={["export"]}
        human={() => mediaCandidateLine(item)}
        json={() => item}
        agent={() => ({
          kind: "media_candidate_verdict",
          location: "Media candidate verdict",
          description: "One researched media candidate judged for one angle.",
          data: item,
        })}
      />
    </section>
  );
}
