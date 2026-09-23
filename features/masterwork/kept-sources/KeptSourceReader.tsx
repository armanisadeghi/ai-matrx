"use client";

// features/masterwork/kept-sources/KeptSourceReader.tsx
//
// ONE kept source, opened to its full raw material — the Expert's actual words,
// with the quotes of whichever rule sent you here lit up.
//
// 🚨 THE THREE HONEST STATES. This screen's whole reason to exist is that a
// rule can now be checked against what was really said, so every way the
// stored copy falls short of "the whole thing" is stated on its face:
//
//   truncated — the stored copy is CAPPED. The line says so and names where
//     the rest is (the file, the URL, the transcript), because a clipped
//     record rendered as if it were complete is the worst thing this surface
//     could do: a person would read to the end, not find their sentence, and
//     conclude the rule was invented.
//   content === null — an upload whose text was never extracted at capture
//     time. There are no words to show. The panel says that plainly and opens
//     the file, instead of rendering an empty box that reads as "your source
//     was empty".
//   no row at all — handled by the caller (./KeptSourcesPanel), because that
//     is a fact about the RULE, not about a source.
//
// 🚨 ONE MATCHER, ONE TIMECODE. Highlighting is `components/text/HighlightedText`
// (its header says it is the ONE matcher in the codebase) fed the rule's
// machine-verified-verbatim quotes — see ./ruleQuotes.ts. Turn timestamps are
// `formatTimecode` from the transcript stack, so a rule's "at 4:12" and the
// turn it points at read the same clock.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, FileText, Quote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { HighlightedText } from "@/components/text/HighlightedText";
import { computeMatches, type FindMatch } from "@/features/notes/utils/findMatches";
import { formatTimecode } from "@/features/transcript-studio/utils/timecode";
import { cn } from "@/lib/utils";
import { mediumLabel } from "./columns";
import { keptSourceTitle, type KeptSource, type KeptSourceTurn } from "./types";

const MATCH_OPTIONS = {
  caseSensitive: false,
  useRegex: false,
  wholeWord: false,
} as const;

/**
 * Where the rest of a capped source lives, as a real door.
 *
 * Returns null when the row names no origin — and the caller then says the cap
 * happened without claiming to know where the remainder is, which is the
 * honest version of not knowing.
 */
function RestOfIt({ source }: { source: KeptSource }) {
  if (source.file_id) {
    return (
      <Link
        href={`/files/f/${source.file_id}`}
        target="_blank"
        className="text-primary underline-offset-2 hover:underline"
      >
        the uploaded file
      </Link>
    );
  }
  if (source.url) {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline-offset-2 hover:underline"
      >
        {source.url}
      </a>
    );
  }
  if (source.transcript_id) {
    return (
      <EntityRef
        token="transcript"
        id={source.transcript_id}
        name="the full transcript"
        showIcon={false}
        openInNewTab
        className="inline-flex text-primary"
      />
    );
  }
  return null;
}

function TurnRow({
  turn,
  matches,
  activeMarkRef,
  activeIndex,
}: {
  turn: KeptSourceTurn;
  matches: FindMatch[];
  activeMarkRef: (el: HTMLElement | null) => void;
  activeIndex: number;
}) {
  const hit = matches.length > 0;
  return (
    <div
      className={cn(
        "flex gap-3 rounded-md px-2 py-1.5",
        hit && "bg-amber-50/60 dark:bg-amber-400/5",
      )}
    >
      <div className="w-24 shrink-0 pt-0.5 text-xs">
        {turn.speaker ? (
          <div className="truncate font-medium text-foreground" title={turn.speaker}>
            {turn.speaker}
          </div>
        ) : (
          <div className="text-muted-foreground">Speaker unknown</div>
        )}
        {turn.started_at === null ? null : (
          <div className="tabular-nums text-muted-foreground">
            {formatTimecode(turn.started_at)}
          </div>
        )}
      </div>
      <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        <HighlightedText
          text={turn.text}
          matches={matches}
          activeIndex={activeIndex}
          activeMarkRef={activeMarkRef}
        />
      </p>
    </div>
  );
}

export interface KeptSourceReaderProps {
  source: KeptSource;
  /** Verbatim strings to light up — from `ruleQuotes(rule)`. May be empty. */
  quotes: string[];
  /**
   * The rule the reader was opened FOR, when it was opened from one. Drives
   * the "why you are here" line and the scroll — never the highlighting, which
   * is `quotes`.
   */
  ruleName?: string | null;
  /** True when a `?rule=` was asked for but no rule in the Rulebook has that id. */
  ruleMissing?: boolean;
}

export function KeptSourceReader({
  source,
  quotes,
  ruleName,
  ruleMissing,
}: KeptSourceReaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // THE JUMP. The first highlighted occurrence is brought into view once, on
  // the first render that has one — never again, so a person who scrolled away
  // to read around it is not yanked back.
  const activeMarkRef = (el: HTMLElement | null) => {
    if (!el || scrolled) return;
    setScrolled(true);
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  // Matches are computed per block (a turn, or the whole body) against the
  // SAME engine `HighlightedText` uses, so the count below and the marks on
  // screen can never disagree. The first match overall is the active one.
  const blocks: { key: string; text: string; turn?: KeptSourceTurn }[] =
    source.medium === "turns" && source.turns.length > 0
      ? source.turns.map((turn) => ({
          key: `turn-${turn.index}`,
          text: turn.text,
          turn,
        }))
      : source.content
        ? [{ key: "body", text: source.content }]
        : [];

  const matchesByBlock = blocks.map((block) =>
    quotes.flatMap((q) => computeMatches(block.text, q, MATCH_OPTIONS)),
  );
  // Overlapping ranges from two quotes that share text are dropped by the
  // renderer, so ordering them is what makes the skip deterministic.
  for (const list of matchesByBlock) list.sort((a, b) => a.start - b.start);
  const totalMatches = matchesByBlock.reduce((n, m) => n + m.length, 0);
  const firstMatchBlock = matchesByBlock.findIndex((m) => m.length > 0);

  useEffect(() => {
    // A new rule (new quote set) is a new jump.
    setScrolled(false);
  }, [quotes.join("\u0000"), source.id]);

  const title = keptSourceTitle(source);

  return (
    <div className="space-y-3" ref={containerRef}>
      <header className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="text-base font-medium text-foreground">{title}</h2>
          <Badge variant="outline" className="px-1.5 py-0 text-[11px]">
            {mediumLabel(source.medium_raw)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Captured {new Date(source.captured_at).toLocaleString()} ·{" "}
          {source.word_count.toLocaleString()}{" "}
          {source.word_count === 1 ? "word" : "words"}
          {source.speaker_count > 0
            ? ` · ${source.speaker_count} speaker${source.speaker_count === 1 ? "" : "s"}`
            : null}
        </p>
      </header>

      {/* WHY YOU ARE HERE, and whether the jump actually found anything. A
          reader opened from a rule that lights nothing up must say so — an
          unlit page after a "see the original words" click reads as a broken
          link. */}
      {ruleName ? (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
          <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <span className="text-muted-foreground">
              Showing where{" "}
              <span className="font-medium text-foreground">{ruleName}</span>{" "}
              came from.
            </span>{" "}
            {quotes.length === 0 ? (
              <span className="text-muted-foreground">
                That rule kept no word-for-word quote, so nothing is highlighted
                — read the source below to judge it.
              </span>
            ) : totalMatches === 0 ? (
              <span className="text-amber-600 dark:text-amber-500">
                Its quote isn&apos;t in the copy we kept. If the stored copy is
                capped, the passage is in the part we didn&apos;t store.
              </span>
            ) : (
              <span className="text-muted-foreground">
                {totalMatches} highlighted{" "}
                {totalMatches === 1 ? "passage" : "passages"}.
              </span>
            )}
          </div>
        </div>
      ) : null}

      {ruleMissing ? (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            The rule this link pointed at is no longer in this Rulebook, so
            nothing is highlighted. The source itself is below, unchanged.
          </span>
        </div>
      ) : null}

      {/* 🚨 THE CAP, NAMED. Never render a clipped record as if it were whole. */}
      {source.truncated ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This is a capped copy — we stored the opening of this source, not
            all of it, so a passage can be missing from what you read here.{" "}
            {(() => {
              const rest = RestOfIt({ source });
              return rest ? (
                <>The whole thing is in {rest}.</>
              ) : (
                <>
                  This row doesn&apos;t record where the rest is, so the
                  remainder isn&apos;t reachable from here.
                </>
              );
            })()}
          </span>
        </div>
      ) : null}

      {blocks.length === 0 ? (
        /* 🚨 NEVER AN EMPTY PANEL. An upload whose text was not extracted has
           no words to show, and saying nothing would read as "your source was
           blank". */
        <div className="space-y-2 rounded-md border border-border bg-card px-3 py-3 text-sm">
          <p className="text-foreground">
            We kept this source but never extracted its text, so there are no
            words to read here.
          </p>
          <p className="text-xs text-muted-foreground">
            The rules distilled from it were written from what the reader saw at
            the time; the original is the only copy of the words.
          </p>
          {source.file_id ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/files/f/${source.file_id}`} target="_blank">
                <FileText className="h-3.5 w-3.5" />
                Open the file
              </Link>
            </Button>
          ) : source.url ? (
            <Button asChild size="sm" variant="outline">
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Open the original
              </a>
            </Button>
          ) : source.transcript_id ? (
            <EntityRef
              token="transcript"
              id={source.transcript_id}
              name="Open the transcript"
              openInNewTab
              className="inline-flex text-sm text-primary"
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              This row doesn&apos;t record where the original lives, so there is
              nothing to open.
            </p>
          )}
        </div>
      ) : source.medium === "turns" ? (
        <div className="divide-y divide-border rounded-md border border-border bg-card">
          {blocks.map((block, i) => (
            <TurnRow
              key={block.key}
              turn={block.turn!}
              matches={matchesByBlock[i]}
              activeIndex={i === firstMatchBlock ? 0 : -1}
              activeMarkRef={activeMarkRef}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            <HighlightedText
              text={blocks[0].text}
              matches={matchesByBlock[0]}
              activeIndex={firstMatchBlock === 0 ? 0 : -1}
              activeMarkRef={activeMarkRef}
            />
          </p>
        </div>
      )}
    </div>
  );
}
