"use client";

/**
 * features/hr/time/shared/PunchChain.tsx — the RAW block, and only the raw block.
 *
 * 🚨 AD-11 / SPEC-TIME §0 law 1 — **raw and computed are never conflated.** On a day view this
 * renders BENEATH the intervals in a visually distinct block, and *"the two blocks are never
 * interleaved"* (§5.1). It shows punch facts and nothing derived: no hours, no rounding, no total.
 *
 * 🚨 **A VOID IS RENDERED, STRUCK THROUGH, WITH THE VOIDING PUNCH AS A DOOR — NEVER HIDDEN.**
 * §2.5: *"a hidden void is a destroyed record."* Filtering voided punches out of this list would be
 * the single most damaging thing a component in this feature could do, so there is no prop for it.
 */

import Link from "next/link";
import { Camera, MapPin, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { hrPunchesHref } from "@/features/hr/routes";

import type { PunchRow } from "../api/types";
import { formatDateTimeInTz } from "./format";
import { StampedTime } from "./timing";
import { ACTOR_TYPE_LABELS, PUNCH_KIND_LABELS, PUNCH_SOURCE_LABELS } from "./vocabulary";

/** Who actually made this punch, in words — `Kiosk device` beats an actor-type token every time. */
export function punchActorSentence(punch: PunchRow): string {
  const actor = ACTOR_TYPE_LABELS[punch.actorType];
  const via = PUNCH_SOURCE_LABELS[punch.source];
  return punch.actorNote ? `${actor} · ${via} · ${punch.actorNote}` : `${actor} · ${via}`;
}

export function PunchChain({
  punches,
  /** The door onto a voiding punch — the register scrolls to it, the day view opens route 30. */
  onOpenPunch,
  emptySentence = "No punches were recorded on this day.",
  className,
}: {
  punches: PunchRow[];
  onOpenPunch?: (punchId: string) => void;
  emptySentence?: string;
  className?: string;
}) {
  return (
    <section
      className={cn(
        // Visually distinct on purpose: dashed, muted, and labelled as evidence.
        "rounded-lg border border-dashed border-border bg-muted/30 p-3",
        className,
      )}
      aria-label="Raw punches"
    >
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Raw punches
        </h4>
        <p className="text-[11px] text-muted-foreground">
          Exactly what was recorded. No hours are calculated here.
        </p>
      </header>

      {punches.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptySentence}</p>
      ) : (
        <ol className="space-y-1.5">
          {punches.map((punch) => (
            <PunchChainRow key={punch.id} punch={punch} onOpenPunch={onOpenPunch} />
          ))}
        </ol>
      )}
    </section>
  );
}

function PunchChainRow({
  punch,
  onOpenPunch,
}: {
  punch: PunchRow;
  onOpenPunch?: (punchId: string) => void;
}) {
  const voided = punch.voidedAt !== null;

  return (
    <li
      className={cn(
        "rounded-md border border-border bg-card px-2.5 py-1.5 text-xs",
        voided && "border-dashed opacity-90",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* THE STRIKE-THROUGH. The record stays legible; it is marked, not removed. */}
        <span className={cn("font-medium", voided && "line-through decoration-2")}>
          {PUNCH_KIND_LABELS[punch.punchKind]}
        </span>
        <span className={cn(voided && "line-through decoration-2")}>
          <StampedTime at={punch.occurredAt} tz={punch.tz} />
        </span>
        <span className="text-muted-foreground">{punchActorSentence(punch)}</span>

        {punch.hasGeo ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground" title="Location was captured with this punch">
            <MapPin className="h-3 w-3" aria-hidden />
            Location
          </span>
        ) : null}
        {punch.hasPhoto ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground" title="A photo was captured with this punch">
            <Camera className="h-3 w-3" aria-hidden />
            Photo
          </span>
        ) : null}
      </div>

      {voided ? (
        <div className="mt-1.5 flex items-start gap-1.5 rounded border border-border bg-muted/60 px-2 py-1 text-[11px]">
          <Undo2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            Voided {formatDateTimeInTz(punch.voidedAt, punch.tz)}
            {punch.voidedReason ? <> — &ldquo;{punch.voidedReason}&rdquo;</> : null}
            {/*
             * 🚨 THE DOOR IS UNCONDITIONAL. §2.5 requires the voiding punch to be *a door*, and an
             * earlier version of this fell back to a bare uuid when no `onOpenPunch` was supplied —
             * which is a dead end, in the one place a person is reconciling a wage record. When the
             * host offers no in-place opener, the fallback is the raw register filtered to this
             * employment, where the replacement punch is listed. Never text.
             */}
            {punch.voidedByPunchId ? (
              <>
                {" · "}
                {onOpenPunch ? (
                  <button
                    type="button"
                    onClick={() => onOpenPunch(punch.voidedByPunchId as string)}
                    className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                  >
                    Open the punch that replaced it
                  </button>
                ) : (
                  <Link
                    href={hrPunchesHref(undefined, { employment: punch.employmentId })}
                    className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                  >
                    Open the punch that replaced it
                  </Link>
                )}
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      {punch.enteredReason ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Entered by a manager — &ldquo;{punch.enteredReason}&rdquo;
        </p>
      ) : null}
    </li>
  );
}
