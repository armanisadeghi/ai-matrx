// features/portals/PortalStatusTimeline.tsx — where her job stands, read-only (lane S6, U12).
//
// The Stripe customer portal / parcel-tracker line: every declared stage in order, the passed
// ones checked with the moment each was reached, the current one marked in the business's own
// colour, the rest ahead. Vertical on every width — a phone reads it top to bottom and a desktop
// has the room. Built from `buildTimeline` (timeline.ts); this file only draws.

import { Check } from "lucide-react";

import type { PortalLook } from "./look";
import type { Timeline } from "./timeline";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/** Resolved on the server and sent as a string, so server and client never disagree. */
const WHEN = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export function PortalStatusTimeline({
  timeline,
  look,
  unavailable = false,
}: {
  timeline: Timeline;
  look: PortalLook;
  /** The history door refused or failed: the stages still show, the moments say why they are missing. */
  unavailable?: boolean;
}) {
  const current = look.bandClass ?? "bg-primary";
  return (
    <section aria-labelledby="portal-status-heading" className="mt-6 rounded-xl border border-border bg-card p-4">
      <h2 id="portal-status-heading" className="text-sm font-semibold tracking-tight text-foreground">
        {timeline.label}
      </h2>
      {timeline.offList ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Right now: <span className="font-medium text-foreground">{timeline.offList}</span>, which is not one of the
          steps below.
        </p>
      ) : null}
      <ol className="mt-3">
        {timeline.steps.map((step, index) => {
          const last = index === timeline.steps.length - 1;
          return (
            <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0" aria-current={step.state === "current" ? "step" : undefined}>
              {!last ? (
                <span
                  aria-hidden
                  className={`absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-0.5 ${
                    step.state === "done" ? current : "bg-border"
                  }`}
                />
              ) : null}
              <span
                aria-hidden
                className={`relative z-[1] mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  step.state === "done"
                    ? `${current} border-transparent text-white`
                    : step.state === "current"
                      ? `border-transparent ${current} ring-4 ring-offset-0 ring-border`
                      : "border-border bg-card"
                }`}
              >
                {step.state === "done" ? <Check className="h-3.5 w-3.5" /> : null}
                {step.state === "current" ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-sm ${
                    step.state === "ahead" ? "text-muted-foreground" : "font-medium text-foreground"
                  }`}
                >
                  {step.label}
                  {step.state === "current" ? <span className="sr-only"> (now)</span> : null}
                </p>
                {step.state !== "ahead" ? (
                  <p className="text-xs text-muted-foreground">
                    {step.reachedAt
                      ? WHEN.format(new Date(step.reachedAt))
                      : unavailable
                        ? "When it got here could not be read just now."
                        : step.state === "current"
                          ? "Now"
                          : "Done"}
                    <ErrorAlchemyMenu />
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
