"use client";

// features/meet/components/record/MeetingContentSearch.tsx
//
// SEARCH INSIDE WHAT WAS SAID (Meet wave 3). The /meetings search box filters
// titles as you type; under the list, this answers the same words from every
// one of the reader's meetings — agendas, summaries, decisions, action items
// and transcript lines (`meet_search`, English stemming: "renewal" finds
// "renew"). Each hit opens the meeting's record at that exact line.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  FileText,
  Gavel,
  MessageSquareQuote,
  StickyNote,
} from "lucide-react";
import {
  createMeetRepository,
  snippetRuns,
  useMeetHost,
  type MeetingSearchHit,
  type MeetingSearchSource,
} from "@ai-matrx/meet/react";
import { Skeleton } from "@ai-matrx/design-system";
import { supabase } from "@/utils/supabase/client";
import { errorSentence } from "@/features/meet/hooks/useMeetingActions";

const SOURCE: Record<
  MeetingSearchSource,
  { label: string; icon: typeof FileText }
> = {
  title: { label: "Title or agenda", icon: FileText },
  summary: { label: "Summary", icon: StickyNote },
  decision: { label: "Decision", icon: Gavel },
  action_item: { label: "Action item", icon: CheckSquare },
  note: { label: "Note", icon: StickyNote },
  transcript: { label: "Said", icon: MessageSquareQuote },
};

export function hitHref(hit: MeetingSearchHit): string {
  const base = `/meetings/${hit.meetingId}`;
  if (hit.source === "title") return base;
  if (hit.source === "transcript") return `${base}?tab=record&t=${hit.refId}`;
  return `${base}?tab=record&note=${hit.refId}`;
}

function Snippet({ text }: { text: string }) {
  return (
    <>
      {snippetRuns(text).map((run, i) =>
        run.hit ? (
          <mark
            key={i}
            className="rounded-sm bg-amber-300/40 px-0.5 text-foreground"
          >
            {run.text}
          </mark>
        ) : (
          <span key={i}>{run.text}</span>
        ),
      )}
    </>
  );
}

function clock(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? ""
    : at.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export function MeetingContentSearch({ query }: { query: string }) {
  const host = useMeetHost();
  const [plain] = useState(() => createMeetRepository({ client: supabase }));
  const repository = host?.repository ?? plain;
  const [hits, setHits] = useState<readonly MeetingSearchHit[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const term = query.trim();

  useEffect(() => {
    if (term.length < 2) {
      setHits(null);
      return undefined;
    }
    let live = true;
    setHits(null);
    const timer = window.setTimeout(() => {
      repository
        .searchMeetings(term, 60)
        .then((next) => {
          if (!live) return;
          setHits(next);
          setFailure(null);
        })
        .catch((thrown: unknown) => {
          if (live) setFailure(errorSentence(thrown));
        });
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [repository, term]);

  if (term.length < 2) return null;

  // One group per meeting, best hit first (the RPC already ranks).
  const groups = new Map<string, MeetingSearchHit[]>();
  for (const hit of hits ?? []) {
    const list = groups.get(hit.meetingId) ?? [];
    list.push(hit);
    groups.set(hit.meetingId, list);
  }

  return (
    <section aria-label="Found inside meetings" className="mt-6 space-y-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Inside your meetings
      </h2>
      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      ) : hits === null ? (
        <div
          className="space-y-2"
          aria-busy="true"
          aria-label="Searching your meetings"
        >
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : hits.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing said, noted or decided in your meetings matches “{term}”.
        </p>
      ) : (
        <ul className="space-y-2">
          {[...groups.values()].map((list) => {
            const first = list[0]!;
            return (
              <li
                key={first.meetingId}
                className="overflow-hidden rounded-lg border border-border bg-card"
              >
                <Link
                  href={`/meetings/${first.meetingId}?tab=record`}
                  className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-1.5 hover:bg-accent/50"
                >
                  <span className="truncate text-sm font-medium">
                    {first.meetingTitle}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {clock(first.meetingAt)}
                  </span>
                </Link>
                <ul className="divide-y divide-border">
                  {list.slice(0, 5).map((hit) => {
                    const meta = SOURCE[hit.source];
                    return (
                      <li key={`${hit.source}-${hit.refId}`}>
                        <Link
                          href={hitHref(hit)}
                          className="flex gap-2.5 px-3 py-2 hover:bg-accent/50"
                        >
                          <meta.icon
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[11px] text-muted-foreground">
                              {meta.label}
                              {hit.speaker ? ` · ${hit.speaker}` : ""}
                              {hit.source === "transcript" && hit.at
                                ? ` · ${clock(hit.at)}`
                                : ""}
                            </span>
                            <span className="line-clamp-2 text-sm">
                              <Snippet text={hit.snippet} />
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                  {list.length > 5 ? (
                    <li className="px-3 py-1.5 text-xs text-muted-foreground">
                      {list.length - 5} more in this meeting
                    </li>
                  ) : null}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
