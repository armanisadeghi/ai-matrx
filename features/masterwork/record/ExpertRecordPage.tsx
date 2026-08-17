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

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ExternalLink,
  FileText,
  MessagesSquare,
  Mic,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { getRulebook } from "../service";
import type { Rulebook } from "../types";
import { getExpertCorpus, type ExpertContribution, type ExpertCorpus } from "./service";
import {
  contributionAgentPayload,
  contributionHuman,
  corpusAgentPayload,
  corpusHuman,
} from "./copy";

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

/** "12m 30s" — how long the Expert actually spoke. */
function spokenFor(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function KindIcon({ kind }: { kind: ExpertContribution["kind"] }) {
  if (kind === "transcript")
    return <Mic className="h-3.5 w-3.5 text-primary" aria-hidden />;
  if (kind === "upload")
    return <FileText className="h-3.5 w-3.5 text-primary" aria-hidden />;
  return <Quote className="h-3.5 w-3.5 text-primary" aria-hidden />;
}

function KindLabel({ kind }: { kind: ExpertContribution["kind"] }) {
  return (
    <span className="text-xs text-muted-foreground">
      {kind === "transcript"
        ? "You recorded this"
        : kind === "upload"
          ? "You uploaded this"
          : "You said this"}
    </span>
  );
}

function ContributionCard({
  contribution,
  rulebookName,
}: {
  contribution: ExpertContribution;
  rulebookName: string;
}) {
  const c = contribution;
  return (
    <li className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <KindIcon kind={c.kind} />
          <KindLabel kind={c.kind} />
          <span className="text-xs text-muted-foreground">· {when(c.when)}</span>
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

      {c.text ? (
        <div className="mt-2 text-sm text-foreground">
          <MarkdownStream content={c.text} hideCopyButton />
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
                {d.durationSec ? (
                  <span>· {spokenFor(d.durationSec)}</span>
                ) : null}
              </div>
              {/* Two things this renderer needs and a bare file id can't give
                  it. (1) `as="audio"`: with no mime type to infer from it
                  falls back to an <img> and shows a broken-image tile instead
                  of a player. (2) A HEIGHT: `size="fill"` means `h-full`, and
                  a parent with auto height renders the player at 0px — audible
                  to no one. */}
              <div className="h-[54px] w-full">
                <InlineMediaRef ref={d.fileId} as="audio" size="fill" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* The audio / the file itself — canonical renderer, never a raw tag. */}
      {c.fileId ? (
        <div className="mt-3 space-y-2">
          {/* Same height rule as the dictation player below: `size="fill"` is
              `h-full`, so the parent must state a height or the media renders
              at 0px. */}
          <div className="h-64 w-full">
            <InlineMediaRef ref={c.fileId} size="fill" fit="contain" />
          </div>
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
}

export function ExpertRecordPage({ rulebookId }: ExpertRecordPageProps) {
  const [rulebook, setRulebook] = useState<Rulebook | null>(null);
  const [corpus, setCorpus] = useState<ExpertCorpus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rb = await getRulebook(rulebookId);
      setRulebook(rb);
      setCorpus(await getExpertCorpus(rulebookId, rb?.rules ?? []));
    } catch (err) {
      console.error("[masterwork/record] failed to load the Record", err);
      setError(
        "We couldn't load your words right now. Nothing is lost — try again.",
      );
    }
  }, [rulebookId]);

  useEffect(() => {
    void load();
  }, [load]);

  const name = rulebook?.name ?? "this Rulebook";

  const words = useMemo(
    () => (corpus ? Math.round(corpus.totalChars / 5.5) : 0),
    [corpus],
  );

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Try again
        </Button>
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
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-8 sm:px-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">
              Your words
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything you&apos;ve told us while building{" "}
              <span className="font-medium text-foreground">{name}</span> —
              oldest first, nothing left out.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {corpus.contributions.length} thing
              {corpus.contributions.length === 1 ? "" : "s"} you contributed ·{" "}
              {corpus.interviews.length} interview
              {corpus.interviews.length === 1 ? "" : "s"} ·{" "}
              {words.toLocaleString()} words
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
            <Button asChild size="sm" variant="outline" className="h-9">
              <Link href={`/masterwork/${rulebookId}`}>Back to the Rulebook</Link>
            </Button>
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

      {corpus.contributions.length === 0 ? (
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
