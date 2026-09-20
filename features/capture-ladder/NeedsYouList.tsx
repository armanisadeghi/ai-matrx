"use client";

/**
 * features/capture-ladder/NeedsYouList.tsx
 *
 * THE FULL LIST behind `/capture/needs-you` — every page waiting for a person's
 * own browser. CONTRACT.md §8.1.
 *
 * The one distinction this screen exists to make: a `waiting` row and a
 * `needs_drive` row are DIFFERENT work. One is the browser's; the other is the
 * person's. Someone glancing here must be able to tell how much of it is theirs
 * without reading a word twice.
 *
 * ── What this list deliberately does NOT do any more (owner, 2026-09-18) ──
 *
 * *"absolutely avoid the card within a card stuff"* — the rows were bordered
 * cards inside a bordered panel. They are now one bordered list with divided
 * rows, which is the same information and one frame.
 *
 * *"It's writing a novel inside of the thing that delivers ZERO value"* — every
 * row used to carry six things: who acts, why it got here, what to do, the rung
 * badge, an estimate, and an attempt count. A row now carries the page, one
 * status word, and — only for rows that need the PERSON — the server's one
 * sentence saying what they have to do. The rest was true and useless.
 *
 * *"instead of clicking a text link like it's 2001"* — the page's address is no
 * longer the only clickable thing. The real action is the button above this
 * list; opening a page by hand is a small secondary control that says so.
 *
 * Every sentence about a row is still the SERVER's sentence (`what_to_do`):
 * this file never invents an explanation for a page.
 */

import {
  AlertTriangle,
  ExternalLink,
  Hand,
  Loader2,
  MonitorSmartphone,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  handoffNoun,
  HANDOFF_KIND_EXPLANATION,
  type CaptureHandoff,
} from "@/features/capture-ladder/types";
import type { NeedsYouState } from "@/features/capture-ladder/useNeedsYou";

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** True when the person themselves has to act — not their browser. */
export function isForThePerson(handoff: CaptureHandoff): boolean {
  return handoff.status === "needs_drive" || handoff.rung === "human_drive";
}

export function NeedsYouRow({ handoff }: { handoff: CaptureHandoff }) {
  const yours = isForThePerson(handoff);
  const Icon = yours ? Hand : MonitorSmartphone;
  const host = hostOf(handoff.url);
  const label = handoff.title || host;
  const noun = handoffNoun(handoff.handoff_kind ?? null);

  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          yours ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
        )}
        aria-hidden="true"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {label}
          </span>
          {label !== host && (
            <span className="truncate text-xs text-muted-foreground">
              {host}
            </span>
          )}
          {/* WHAT this row is, but only when it is not the ordinary case. A
              queue of pages does not need "page" written on every line; a video
              sitting among them does, or the person reads the whole list as
              pages — which is exactly what this list did until 2026-09-20.
              One word, no chip: the row already carries enough. */}
          {handoff.handoff_kind !== "web_page" && (
            <span
              className="shrink-0 text-xs text-muted-foreground"
              title={
                handoff.handoff_kind
                  ? HANDOFF_KIND_EXPLANATION[handoff.handoff_kind]
                  : "We do not recognise what kind of thing this is — your extension does, and can still read it."
              }
            >
              {noun}
            </span>
          )}
        </div>

        {/* Only rows that need the PERSON carry a sentence. A row the browser
            handles alone needs no instruction, and printing one anyway is what
            made this list unreadable. */}
        {yours && handoff.what_to_do ? (
          <p className="text-xs text-muted-foreground">{handoff.what_to_do}</p>
        ) : null}

        {handoff.attempt_count > 1 ? (
          <p className="text-[11px] text-muted-foreground">
            Tried {handoff.attempt_count} times already.
          </p>
        ) : null}
      </div>

      <span
        className={cn(
          "mt-0.5 shrink-0 text-[11px] font-medium",
          yours
            ? "text-amber-700 dark:text-amber-400"
            : "text-muted-foreground",
        )}
      >
        {yours ? "Needs you" : "Your browser"}
      </span>

      {/* Secondary, and labelled as secondary: the button above does the real
          work. This is here for the person who simply wants to look. */}
      <a
        href={handoff.url}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open this ${noun} in a new tab yourself`}
        aria-label={`Open ${host} in a new tab yourself`}
        className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </li>
  );
}

export interface NeedsYouListProps {
  state: NeedsYouState;
  handoffs: CaptureHandoff[];
  /**
   * How fresh the list is, in words. Rendered ON the empty state too — that is
   * the whole point. "Nothing needs your browser" and "we have not been able to
   * ask for ten minutes" look identical without it.
   */
  livenessSentence?: string | null;
  /** Rows the ingress parse refused, in words. Never silently missing. */
  droppedSentence?: string | null;
  /**
   * Where else this person has pages waiting, in words.
   *
   * 🚨 An empty list MUST be able to say where it looked. On 2026-09-18 one
   * person's rows were spread across three of his workspaces and every surface
   * showed a serene zero for the one it happened to be on.
   */
  elsewhereSentence?: string | null;
  /** The workspace this list is about, so "empty" is never ambiguous. */
  organizationName?: string | null;
  className?: string;
}

/** A quiet standing note — never an alarm, always a sentence with a remedy. */
function Notice({
  sentence,
  tone,
}: {
  sentence: string;
  tone: "quiet" | "warn";
}) {
  const Icon = tone === "warn" ? AlertTriangle : WifiOff;
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-[11px] leading-snug",
        tone === "warn"
          ? "text-amber-700 dark:text-amber-400"
          : "text-muted-foreground",
      )}
    >
      <Icon className="mt-[1px] h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{sentence}</span>
    </p>
  );
}

/**
 * The list body. Renders the state it is given — including the states that are
 * not "a list": nothing here ever shows a calm empty list when the truth is
 * that we could not read the queue.
 */
export function NeedsYouList({
  state,
  handoffs,
  livenessSentence = null,
  droppedSentence = null,
  elsewhereSentence = null,
  organizationName = null,
  className,
}: NeedsYouListProps) {
  if (state.kind === "loading") {
    return (
      <p
        className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Looking for pages that need your browser…
      </p>
    );
  }

  if (state.kind === "no_organization") {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Pick a workspace and this list will show the pages waiting for your
        browser in it.
      </p>
    );
  }

  if (state.kind === "not_provisioned" || state.kind === "failed") {
    return (
      <p
        className={cn(
          "rounded-lg border border-border bg-card/60 p-3 text-sm text-muted-foreground",
          className,
        )}
      >
        {state.sentence}
      </p>
    );
  }

  if (handoffs.length === 0) {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <p className="text-sm text-muted-foreground">
          {organizationName
            ? `Nothing needs your browser in ${organizationName} right now.`
            : "Nothing needs your browser right now."}{" "}
          {/* What LANDS here, stated for the queue as it actually is: pages
              behind a sign-in AND videos whose subtitles a server cannot get.
              Naming only the page case taught the person the list was smaller
              than it is. */}
          When a site will show something to your own browser but not to our
          servers, it lands here.
        </p>
        {/* An empty list has to say WHERE it looked and HOW it knows. */}
        {elsewhereSentence ? (
          <Notice sentence={elsewhereSentence} tone="warn" />
        ) : null}
        {livenessSentence ? (
          <Notice sentence={livenessSentence} tone="quiet" />
        ) : null}
        {droppedSentence ? (
          <Notice sentence={droppedSentence} tone="warn" />
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* ONE frame. The rows divide it; they do not each get a card. */}
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card/60">
        {handoffs.map((handoff) => (
          <NeedsYouRow key={handoff.id} handoff={handoff} />
        ))}
      </ul>
      {elsewhereSentence ? (
        <Notice sentence={elsewhereSentence} tone="warn" />
      ) : null}
      {livenessSentence ? (
        <Notice sentence={livenessSentence} tone="quiet" />
      ) : null}
      {droppedSentence ? (
        <Notice sentence={droppedSentence} tone="warn" />
      ) : null}
    </div>
  );
}

export default NeedsYouList;
