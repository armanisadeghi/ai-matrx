/**
 * features/hr/time/clock/PunchConfirmationCard.tsx — what the surface says after a punch is written.
 *
 * 🚨 **A REPLAY IS A SUCCESS, NOT AN ERROR** (§1.1, §3.4, L3-45). When `replayed` is true the
 * idempotency key collided: the double tap, the retry, the flaky network. The server returned the
 * *original* punch and wrote nothing new. This card renders **the same confirmation it would have
 * rendered the first time**, plus one honest line explaining that nothing was recorded twice.
 * Rendering a replay as an error is how a correctly-working idempotency key looks like a broken
 * time clock to the person standing in front of it.
 *
 * 🚨 **The confirmation states what was captured** (§4.9, ruled): *"Location recorded"*,
 * *"Photo recorded"*. The employee learns it here, at the moment it happened — never six months
 * later from a manager.
 */

"use client";

import { CheckCircle2, Info, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";

import { formatStampedTimeWithZone } from "./stampedTime";
import { formatElapsedMinutes } from "./liveElapsed";
import { punchKindPresentation } from "./punchVocabulary";
import type { PunchConfirmation } from "./usePunchClock";

export function PunchConfirmationCard({
  confirmation,
  onDismiss,
}: {
  confirmation: PunchConfirmation;
  onDismiss: () => void;
}) {
  const { result, capturedNotices, captureUnavailable } = confirmation;
  const { punch, clockState, exceptionsRaised, replayed } = result;
  const presentation = punchKindPresentation(punch.punchKind);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-foreground" />
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold text-foreground">
            {presentation.pastTense} at{" "}
            {/* 🚨 In the punch's STAMPED zone, with the abbreviation when it is not the reader's. */}
            {formatStampedTimeWithZone(punch.occurredAt, punch.tz)}
          </p>
          <p className="text-sm text-muted-foreground">
            {/*
              Server-computed elapsed worked time. This surface never sums a day, and the day TOTAL
              is not on this envelope (G2 F6) — so the server's own figure is shown rather than a
              manufactured one.
            */}
            {formatElapsedMinutes(clockState.elapsedWorkedMinutes)} worked today so far.
          </p>
        </div>
      </div>

      {replayed && (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          This was already recorded — we did not record it twice.
        </p>
      )}

      {capturedNotices.length > 0 && (
        <ul className="flex flex-col gap-1">
          {capturedNotices.map((notice) => (
            <li key={notice} className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="size-4" />
              {notice}
            </li>
          ))}
        </ul>
      )}

      {captureUnavailable && (
        <p className="text-sm text-muted-foreground">{captureUnavailable}</p>
      )}

      {exceptionsRaised.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Info className="size-4" />
            {exceptionsRaised.length === 1
              ? "One thing was flagged for your manager"
              : `${exceptionsRaised.length} things were flagged for your manager`}
          </p>
          <ul className="flex flex-col gap-1">
            {exceptionsRaised.map((exception) => (
              /*
                The server's own sentence. We deliberately do NOT link to route 31 from here: that
                route is another lane's and does not exist yet, and a link that 404s is worse than a
                sentence that stands on its own. Recorded as a debt rather than faked.
              */
              <li key={exception.id} className="text-sm text-muted-foreground">
                {exception.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button type="button" variant="outline" onClick={onDismiss} className="min-h-[48px] w-fit">
        Done
      </Button>
    </section>
  );
}
