"use client";

// features/masterwork/record/ExpertRecordPage.tsx
//
// THE RECORD — "Your words". Everything the Expert has contributed to one
// Rulebook, in one place, in order, with a door on every item.
//
// Arman, 2026-08-17: "All of the things that I have said, all of the
// transcripts or messages I wrote, need to be readily available somewhere in
// the UI. I should be able to click something somewhere that's gonna show
// everything I've said for this whole thing."
//
// Reused, not rebuilt (THE INVENTORY LAW):
//   • `getExpertCorpus`      — the ONE corpus assembly (./service.ts)
//   • `MarkdownStream`       — the canonical renderer for message bodies. Never
//                              a hand-rolled markdown pass.
//   • `InlineMediaRef`       — the canonical file/media renderer (re-mints its
//                              own URLs; never a raw <audio src>).
//   • `CopyButtons`          — the copy-everywhere primitive (human + for-AI +
//                              JSON), payloads in ./copy.ts.
//   • `EntityRef`            — the canonical door to another record.
//   • `useFileAsset`         — resolves a file id to a playable/openable asset.
//
// Mobile-first per the ios-mobile-first rules: one scroll area, stacked
// sections (never tabs), 44px touch targets, no vh units.

import { formatDurationSeconds } from "@ai-matrx/kit/format";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ExternalLink,
  FileText,
  Globe,
  Info,
  MessagesSquare,
  Mic,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { InlineMediaRef } from "@ai-matrx/media/react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { cn } from "@/lib/utils";
import {
  serverRefusal,
  type ServerRefusal,
} from "@/lib/progress/failureSentence";
import { tallyContributions, wordCount } from "./format";
import { getRulebook } from "../service";
import type { Rulebook } from "../types";
import { getExpertCorpus, type ExpertContribution, type ExpertCorpus } from "./service";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import { DriveLinkButton } from "@/features/masterwork/drive/DriveLinkButton";
import {
  contributionAgentPayload,
  contributionHuman,
  corpusAgentPayload,
  corpusHuman,
} from "./copy";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

// The canonical message renderer is heavy and client-only — one front-door
// dynamic for the whole surface (THE FRAGMENTATION LAW), not one per item.
const MarkdownStream = dynamic(() => import("@/components/MarkdownStream"), {
  ssr: false,
  loading: () => <div className="h-4 w-24 animate-pulse rounded bg-muted" />,
});

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The corpus now spans nine Approaches, so the icon follows the SEGMENT KIND
 * the server classified and the words follow its LANE LABEL. Neither is
 * re-derived here: a second opinion about what a contribution is would drift
 * from the assembly the Final Checkup reads.
 */
function KindIcon({ kind }: { kind: ExpertContribution["kind"] }) {
  if (kind === "recording")
    return <Mic className="h-3.5 w-3.5 text-primary" aria-hidden />;
  if (kind === "web_page")
    return <Globe className="h-3.5 w-3.5 text-primary" aria-hidden />;
  if (kind === "message" || kind === "chat_turn")
    return <Quote className="h-3.5 w-3.5 text-primary" aria-hidden />;
  return <FileText className="h-3.5 w-3.5 text-primary" aria-hidden />;
}

/**
 * WHICH ELEMENT, IF ANY, PREVIEWS THIS CONTRIBUTION'S FILE — the one decision,
 * in one place (seventeenth cold walk, 2026-09-21, defect B).
 *
 * A piece is on this screen because a lane read TEXT out of it, and that text
 * is already rendered above. So the only file here with anything to preview is
 * a recording: you can play it, and you cannot play a permit note.
 *
 * `null` means NO SLOT AT ALL — not an empty box, not a placeholder, not a
 * broken tile. `InlineMediaRef` with no usable mime infers `<img>`, which is
 * how five markdown and CSV sources each rendered a red "Image failed to load"
 * panel with a raw 404 URL printed under it on the Expert's own screen.
 */
function previewAs(c: ExpertContribution): "audio" | null {
  return c.kind === "recording" ? "audio" : null;
}

function ContributionCard({
  contribution,
  rulebookName,
}: {
  contribution: ExpertContribution;
  rulebookName: string;
}) {
  const c = contribution;
  const preview = previewAs(c);
  return (
    <li className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <KindIcon kind={c.kind} />
          <span className="text-xs text-muted-foreground">
            {/* The server's own phrasing for where this came from — "from your
                published work", "said in an imported AI chat". */}
            {c.laneLabel}
          </span>
          {c.title ? (
            <span className="min-w-0 truncate text-xs font-medium text-foreground">
              · {c.title}
            </span>
          ) : null}
          {c.when ? (
            <span className="text-xs text-muted-foreground">
              · {when(c.when)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {c.rulesProduced ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {c.rulesProduced} rule{c.rulesProduced === 1 ? "" : "s"}
            </Badge>
          ) : null}
          <CopyButtons
            size="xs"
            label="This"
            human={() => contributionHuman(c)}
            agent={() => contributionAgentPayload(c, rulebookName)}
            json={() => c}
          />
        </div>
      </div>

      {/* 🚨 A CONVERSATION IS RENDERED AS TURNS, NEVER AS A BLOB (sixteenth
          cold walk, 2026-09-21, defect B). This printed the server's flattened
          text, which for a kept interview carried the raw role token in front
          of every turn: `user:` five times and `assistant:` eight times on the
          one screen whose whole purpose is showing an Expert her own words.
          Her turns are her words, full size. Ours are folded down to what they
          actually were — the question we asked to get them. */}
      {c.turns?.length ? (
        <ul className="mt-2 space-y-2">
          {c.turns.map((turn, index) => (
            <li key={`${c.id}-turn-${index}`}>
              {turn.voice === "machine" ? (
                <p className="border-l-2 border-border pl-2.5 text-xs italic text-muted-foreground">
                  We asked: {turn.text}
                </p>
              ) : (
                <div className="text-sm text-foreground">
                  {turn.speaker ? (
                    <p className="text-xs font-medium text-muted-foreground">
                      {turn.speaker}
                    </p>
                  ) : null}
                  <MarkdownStream imagePolicy="self" content={turn.text} hideCopyButton />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : c.text ? (
        <div className="mt-2 text-sm text-foreground">
          <MarkdownStream imagePolicy="self" content={c.text} hideCopyButton />
        </div>
      ) : null}

      {/* YOUR ACTUAL VOICE. Arman: "If any of it was audio… we should even have
          the audio." One player per dictation — a single turn is often several
          recordings — each openable in the Transcripts surface it lives in. */}
      {c.dictations?.length ? (
        <div className="mt-3 space-y-2 rounded-md border border-border/70 bg-muted/30 p-2.5">
          <p className="text-xs font-medium text-foreground">
            {c.dictations.length === 1
              ? "You said this out loud — here it is"
              : `You said this out loud in ${c.dictations.length} recordings`}
          </p>
          {c.dictations.map((d) => (
            <div key={d.transcriptId} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <Mic className="h-3 w-3 shrink-0 text-primary" aria-hidden />
                {/* The canonical door to the recording's own record — the
                    registry owns the route; this surface never invents one.
                    New tab: the Record is a place the Expert is reading. */}
                <EntityRef
                  token="transcript"
                  id={d.transcriptId}
                  name={d.title}
                  showIcon={false}
                  openInNewTab
                />
                <span>· {when(d.when)}</span>
                {/* The local m/s helper was collapsed onto the kit formatter
                    and inlined (2026-09-12) — one call site, no guard of its
                    own. Compact voice: how long the Expert spoke is elapsed
                    work, not a clock anyone watched tick. */}
                {d.durationSec ? (
                  <span>
                    ·{" "}
                    {formatDurationSeconds(d.durationSec, { style: "compact" })}
                  </span>
                ) : null}
              </div>
              {/* Two things this renderer needs and a bare file id can't give
                  it. (1) `as="audio"`: with no mime type to infer from it
                  falls back to an <img> and shows a broken-image tile instead
                  of a player. (2) A HEIGHT: `size="fill"` means `h-full`, and
                  a parent with auto height renders the player at 0px — audible
                  to no one. */}
              <div className="h-[54px] w-full">
                <InlineMediaRef
                  ref={d.fileId}
                  as="audio"
                  size="fill"
                  errorFallback="icon"
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* The file itself — canonical renderer, never a raw tag.

          🚨 A SOURCE WITHOUT A PREVIEW GETS NO PREVIEW SLOT (seventeenth cold
          walk, 2026-09-21, defect B). This rendered a preview for EVERY piece
          carrying a file id. Every piece here carries one by construction —
          a segment exists only because a lane read TEXT out of that file — so
          a markdown note and a CSV each got an <img> (`InlineMediaRef` infers
          the element and falls back to an image with no usable mime), which
          404'd, and the media kit's error panel then printed the raw URL of
          the miss at the Expert: five red "Image failed to load" boxes with
          five bare UUID addresses under her own documents.

          `previewAs` is the whole decision, in one place: an audio file is
          the one thing on this screen that has a preview. Everything else is
          text we already rendered above, and its door is the button. */}
      {c.fileId ? (
        <div className="mt-3 space-y-2">
          {preview ? (
            /* Same height rule as the dictation player: `size="fill"` is
               `h-full`, so the parent must state a height or the media
               renders at 0px. `errorFallback="icon"` because a failure is
               told with an icon — never with the address it failed on. */
            <div className="h-[54px] w-full">
              <InlineMediaRef
                ref={c.fileId}
                as={preview}
                size="fill"
                errorFallback="icon"
              />
            </div>
          ) : null}
          <Button asChild size="sm" variant="outline" className="h-9">
            <Link
              href={`/files/f/${c.fileId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Open the source
            </Link>
          </Button>
        </div>
      ) : null}

      {/* THE DOOR LAW — every message reaches the conversation it came from. */}
      {c.conversationId ? (
        <div className="mt-3">
          <Button asChild size="sm" variant="ghost" className="h-9 px-2 text-xs">
            <Link
              href={`/chat/${c.conversationId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessagesSquare className="mr-1 h-3.5 w-3.5" />
              Open the conversation this came from
            </Link>
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export interface ExpertRecordPageProps {
  rulebookId: string;
  /** Page chrome is omitted when the same record renders inside WindowPanel. */
  variant?: "page" | "window";
}

export function ExpertRecordPage({
  rulebookId,
  variant = "page",
}: ExpertRecordPageProps) {
  const [rulebook, setRulebook] = useState<Rulebook | null>(null);
  const [corpus, setCorpus] = useState<ExpertCorpus | null>(null);
  // 🚨 THE REFUSAL, NOT A REMEMBERED SENTENCE (fifteenth cold walk, blocking
  // C). This was a hardcoded string — "We couldn't load your words right now.
  // Nothing is lost — try again." — printed over the top of a server that had
  // just answered `build_defect`: "this part of the server was built wrong and
  // cannot run… trying again will fail the same way until it is fixed." The
  // screen told the Expert to retry what the server had already refused, and
  // put a Try again button under it. Every server refusal on every Masterwork
  // surface now goes through the one reading in
  // `lib/progress/failureSentence.ts`.
  const [refusal, setRefusal] = useState<ServerRefusal | null>(null);

  const load = useCallback(async () => {
    try {
      const rb = await getRulebook(rulebookId);
      setRulebook(rb);
      // The corpus reads the Rulebook's own rules server-side (it IS the
      // Checkup's assembly) — passing them from here would be a second,
      // drifting copy of the provenance.
      setCorpus(await getExpertCorpus(rulebookId));
    } catch (err) {
      console.error("[masterwork/record] failed to load the Record", err);
      setRefusal(
        serverRefusal(err, {
          remedy:
            "We couldn't load your words right now. Nothing is lost — try again.",
        }),
      );
    }
  }, [rulebookId]);

  useEffect(() => {
    void load();
  }, [load]);

  const name = rulebook?.name ?? "this Rulebook";

  // 🚨 HER WORDS, THROUGH THE ONE COUNTER (sixteenth cold walk, 2026-09-21,
  // defect B). This was `Math.round(corpus.totalChars / 5.5)` — a second,
  // drifting copy of `wordCount`, fed the SIZE OF THE CORPUS. On a Rulebook
  // with one interview it read "1,550 words" while the Expert had typed 595
  // and the interview summary three lines away said "570 words", because the
  // interviewer's own eight turns were in the number. `expertChars` excludes
  // them and `wordCount` is the same helper `N things you said · M words`
  // uses, so the two lines can no longer disagree.
  // 🚨 AND WHAT THOSE THINGS WERE (seventeenth cold walk, defect A). The line
  // read "11 things you contributed · 1 interview · 3.4k words" for four
  // interview turns and three documents. The duplication is dead upstream —
  // one source is read once now — and the count says what it counted, from the
  // ONE tally, so an Expert can check it against the screen under it.
  const tally = useMemo(
    () =>
      corpus
        ? tallyContributions(corpus.contributions)
        : { total: 0, byKind: "", expertChars: 0 },
    [corpus],
  );
  const words = useMemo(() => wordCount(tally.expertChars), [tally]);

  if (refusal) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          {refusal.retryIsPointless
            ? refusal.text
            : `We couldn't load your words right now. Nothing is lost. ${refusal.text}`}
          <ErrorAlchemyMenu error={refusal.text} />
        </p>
        {/* A retry the server has already refused is not offered. */}
        {refusal.retryIsPointless ? null : (
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        )}
        {refusal.traceId ? (
          <p className="text-[11px] text-muted-foreground/70">
            Recorded as {refusal.traceId}
            <ErrorAlchemyMenu error={refusal.traceId} />
          </p>
        ) : null}
      </div>
    );
  }

  if (!corpus) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mx-auto max-w-3xl space-y-4 px-4 pb-8 sm:px-6",
        variant === "window" && "pt-4",
      )}
    >
      <div
        className={cn(
          variant === "page" && "rounded-lg border border-border bg-card p-4",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {variant === "page" ? (
              <h2 className="text-base font-semibold text-foreground">
                Your words
              </h2>
            ) : null}
            <p
              className={cn(
                "text-sm text-muted-foreground",
                variant === "page" && "mt-1",
              )}
            >
              Everything you&apos;ve told us while building{" "}
              <span className="font-medium text-foreground">{name}</span> —
              oldest first, nothing left out.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {tally.total} thing{tally.total === 1 ? "" : "s"} you contributed
              {tally.byKind ? ` · ${tally.byKind}` : ""} · {words} in your own
              words
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
            <CopyButtons
              size="sm"
              label="Everything you've said"
              human={() => corpusHuman(corpus, name)}
              agent={() => corpusAgentPayload(corpus, name)}
              json={() => corpus}
            />
            {/* The Expert's own words are the thing they most want OUT of here
                — into a Google Doc they can edit and share, printed, emailed.
                The canonical action bar carries every destination, so this
                surface owns none of them. */}
            <ContentActionBar
              content={corpusHuman(corpus, name)}
              title={`${name} — your words`}
              instanceKey={`masterwork-record-${rulebookId}`}
            />
            {/* THE DRIVING DOOR. Everything else on this screen is the record
                of what has already been said; this is the cheapest way to say
                more — a hands-free interview on the way somewhere, at no cost
                in time at all. The second control copies the same link so it
                can be texted to the phone that will actually be in the car. */}
            <Button asChild size="sm" variant="outline" className="h-9">
              <Link href={`/masterwork/${rulebookId}/drive`}>
                <Mic className="mr-1 h-3.5 w-3.5" />
                Interview me while I drive
              </Link>
            </Button>
            <DriveLinkButton rulebookId={rulebookId} />
            {variant === "page" ? (
              <Button asChild size="sm" variant="outline" className="h-9">
                <Link href={`/masterwork/${rulebookId}`}>
                  Back to the Rulebook
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* The interviews themselves — each one a door. */}
      {corpus.interviews.length > 0 ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-foreground">
            The conversations
          </h3>
          <ul className="mt-2 space-y-1.5">
            {corpus.interviews.map((i) => (
              <li
                key={i.conversationId}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="min-w-0 truncate text-muted-foreground">
                  {i.title ?? "Interview"} · {i.expertTurnCount} turn
                  {i.expertTurnCount === 1 ? "" : "s"}
                  {i.rulesProduced > 0 ? ` · ${i.rulesProduced} rules` : ""}
                </span>
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="h-9 px-2 text-xs"
                >
                  <Link
                    href={`/chat/${i.conversationId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-1 h-3.5 w-3.5" />
                    Open
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Never let an access boundary read as an empty Record. */}
      {corpus.hiddenInterviewCount > 0 ? (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          {corpus.hiddenInterviewCount} more interview
          {corpus.hiddenInterviewCount === 1 ? "" : "s"} belong
          {corpus.hiddenInterviewCount === 1 ? "s" : ""} to this Rulebook but
          {corpus.hiddenInterviewCount === 1 ? " was" : " were"} recorded by
          someone else and {corpus.hiddenInterviewCount === 1 ? "is" : "are"} not
          shared with you.
        </p>
      ) : null}

      {/* WHAT WE COULD NOT READ. The Record used to show three of the nine ways
          of contributing and said nothing about the rest, which made a partial
          record look complete — the 2026-08-19 audit's finding. The assembly
          now reports its own holes and every one of them is rendered. */}
      {corpus.limits.length > 0 ? (
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <h3 className="text-xs font-medium text-foreground">
              What isn&apos;t in here
            </h3>
          </div>
          <ul className="mt-1.5 space-y-1">
            {corpus.limits.map((limit) => (
              <li
                key={`${limit.lane}:${limit.reason}`}
                className="text-xs text-muted-foreground"
              >
                {limit.reason}
                {limit.count > 1 ? ` (${limit.count})` : ""}
                {limit.recoverable
                  ? " — we can try again."
                  : " — this one is gone for good."}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!corpus.canReadMaterial ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            The rules here are shared with you, but the raw material behind them
            — the interviews, recordings and sources — belongs to the Expert who
            recorded it.
          </p>
        </div>
      ) : corpus.contributions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            You haven&apos;t said anything for this Rulebook yet. The fastest
            way to start is to let us interview you.
          </p>
          <Button asChild size="sm" className="mt-3 h-9">
            <Link href={`/masterwork/${rulebookId}?interview=1`}>
              Interview me
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {corpus.contributions.map((c) => (
            <ContributionCard
              key={c.id}
              contribution={c}
              rulebookName={name}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
