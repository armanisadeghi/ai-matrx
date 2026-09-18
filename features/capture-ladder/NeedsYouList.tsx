"use client";

/**
 * features/capture-ladder/NeedsYouList.tsx
 *
 * THE FULL LIST behind the tray — every page waiting for a person's own browser,
 * each one saying what it is, why it got here, what (if anything) the person has
 * to do, which rung it is waiting on, and how long it should take.
 * CONTRACT.md §8.1.
 *
 * The one distinction this screen exists to make, and the reason it is not just
 * a list of links: a `waiting` row and a `needs_drive` row look DIFFERENT. One
 * says "your browser will do this on its own"; the other says "you need to open
 * this one yourself". Someone glancing at this list must be able to tell how
 * much of it is work for them without reading a word twice.
 *
 * Every sentence on this screen is the SERVER's sentence (`reason_note`,
 * `what_to_do`) — this file never invents an explanation for a row. Where the
 * server said nothing, the row shows the rung's own standing explanation from
 * `types.ts`, which is the contract's wording, not a guess about this page.
 */

import {
  AlertTriangle,
  ExternalLink,
  Hand,
  Loader2,
  MonitorSmartphone,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  describeEstimate,
  describeWhoActs,
  RUNG_EXPLANATION,
  RUNG_LABEL,
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
function isForThePerson(handoff: CaptureHandoff): boolean {
  return handoff.status === "needs_drive" || handoff.rung === "human_drive";
}

export function NeedsYouRow({ handoff }: { handoff: CaptureHandoff }) {
  const yours = isForThePerson(handoff);
  const estimate = describeEstimate(handoff.estimated_seconds);
  const Icon = yours ? Hand : MonitorSmartphone;

  return (
    <li
      className={cn(
        "flex gap-3 rounded-lg border p-3 transition-colors",
        yours
          ? "border-amber-500/40 bg-amber-500/[0.06]"
          : "border-border bg-card/60",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 flex-shrink-0",
          yours
            ? "text-amber-600 dark:text-amber-400"
            : "text-muted-foreground",
        )}
        aria-hidden="true"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <a
            href={handoff.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-1 text-sm font-medium text-foreground hover:text-primary hover:underline"
          >
            <span className="truncate">
              {handoff.title || hostOf(handoff.url)}
            </span>
            <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
          </a>
          <span className="truncate text-xs text-muted-foreground">
            {hostOf(handoff.url)}
          </span>
        </div>

        {/* Who acts — the whole point of the row's two looks. */}
        <p
          className={cn(
            "text-xs font-medium",
            yours
              ? "text-amber-700 dark:text-amber-400"
              : "text-muted-foreground",
          )}
        >
          {describeWhoActs(handoff)}
        </p>

        {/* Why it got here — the server's sentence, never ours. */}
        {handoff.reason_note ? (
          <p className="text-xs text-muted-foreground">{handoff.reason_note}</p>
        ) : null}

        {/* What to do. Empty for own_browser rows by contract — nothing to do. */}
        {handoff.what_to_do ? (
          <p className="text-xs text-foreground">{handoff.what_to_do}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <Badge
            variant="neutral"
            className="gap-1 text-[11px] font-normal"
            title={RUNG_EXPLANATION[handoff.rung]}
          >
            {RUNG_LABEL[handoff.rung]}
          </Badge>
          {estimate ? (
            <span className="text-[11px] text-muted-foreground">
              Takes {estimate}
            </span>
          ) : null}
          {handoff.attempt_count > 0 ? (
            <span className="text-[11px] text-muted-foreground">
              {handoff.attempt_count === 1
                ? "Tried once already"
                : `Tried ${handoff.attempt_count} times already`}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export interface NeedsYouListProps {
  state: NeedsYouState;
  handoffs: CaptureHandoff[];
  /**
   * How fresh the list is, in words. Rendered ON the empty state too — that is
   * the whole point. "Nothing needs your browser" and "we have not been able to
   * ask for ten minutes" look identical without it, and the second one wearing
   * the first one's face is the exact silent failure this feature exists to
   * avoid.
   */
  livenessSentence?: string | null;
  /** Rows the ingress parse refused, in words. Never silently missing. */
  droppedSentence?: string | null;
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
      <Icon className="mt-[1px] h-3 w-3 flex-shrink-0" aria-hidden="true" />
      <span>{sentence}</span>
    </p>
  );
}

/**
 * The list body. Renders the state it is given — including the states that are
 * not "a list": nothing on this screen ever shows a calm empty list when the
 * truth is that we could not read the queue.
 */
export function NeedsYouList({
  state,
  handoffs,
  livenessSentence = null,
  droppedSentence = null,
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
          Nothing needs your browser right now. When a page will only open for
          someone signed in, it lands here.
        </p>
        {/* An empty list has to say how it knows it is empty. */}
        {livenessSentence ? (
          <Notice sentence={livenessSentence} tone="quiet" />
        ) : null}
        {droppedSentence ? (
          <Notice sentence={droppedSentence} tone="warn" />
        ) : null}
      </div>
    );
  }

  const forThePerson = handoffs.filter(isForThePerson).length;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <p className="text-sm text-muted-foreground">
        {handoffs.length === 1
          ? "One page is waiting for your browser."
          : `${handoffs.length} pages are waiting for your browser.`}{" "}
        {forThePerson === 0
          ? "Open the Matrx extension and it will read them for you — you do not have to do anything else."
          : forThePerson === handoffs.length
            ? "Open the Matrx extension; each one needs you to sign in or click through."
            : `Open the Matrx extension — ${forThePerson} of them need you to sign in or click through, and the rest read themselves.`}
      </p>
      <ul className="flex flex-col gap-2">
        {handoffs.map((handoff) => (
          <NeedsYouRow key={handoff.id} handoff={handoff} />
        ))}
      </ul>
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
