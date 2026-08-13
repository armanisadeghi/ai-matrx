"use client";

/**
 * What is holding the loop up, and the one click that continues it.
 *
 * No-dead-ends corollary 2: a problem you can detect ships with its fix. This
 * card never states a blocker without the buttons that resolve it, and never
 * names the record the stage is working on without a door to it.
 */

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Loader2, Play, SkipForward, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { STAGES } from "../../map/loop-map";
import { resolveStageRef, type RefSubject } from "../stage-doors";
import type { BlockerKind, LoopStateView } from "../api";

/** Plain English for a non-technical owner. No jargon, no enum values. */
const BLOCKER_COPY: Record<BlockerKind, string> = {
  human_decision: "This step is waiting for you to decide.",
  approval: "This step is waiting for your approval.",
  rate_limit: "A provider is rate-limiting us. It will clear on its own.",
  quota: "A provider quota is used up for now.",
  external_data: "We are waiting on data from an outside service.",
  schedule: "This step is waiting for its scheduled time.",
  upstream_failure: "An earlier step failed, so this one cannot run yet.",
  dependency: "This step needs something else finished first.",
  manual_hold: "Someone put this step on hold.",
};

function stageTitle(stageId: string): string {
  const stage = STAGES.find((s) => s.id === stageId);
  return stage?.publicInfo?.title ?? stage?.label ?? stageId;
}

export function LoopBlockerCard({
  loop,
  subject,
  onUnblock,
  onSkip,
  busy,
}: {
  loop: LoopStateView;
  subject: RefSubject;
  onUnblock: (stageRunId: string) => void;
  onSkip: (stageRunId: string, reason: string) => void;
  busy: boolean;
}) {
  const [skipping, setSkipping] = useState(false);
  const open = loop.open_stage;
  const blocker = loop.blocker;
  if (!open || !blocker) return null;

  const door = resolveStageRef(open.ref, subject);

  return (
    <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert
          className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            {stageTitle(open.stage)} needs you
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {BLOCKER_COPY[blocker.kind] ?? blocker.detail}
          </p>
          {blocker.resume_hint && (
            <p className="mt-1 text-sm text-foreground">{blocker.resume_hint}</p>
          )}
          {blocker.detail && BLOCKER_COPY[blocker.kind] && (
            <p className="mt-1 text-xs text-muted-foreground">{blocker.detail}</p>
          )}

          {door && door.href && (
            <Link
              href={door.href}
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Open the {door.label.toLowerCase()} this step is working on
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
          {door && !door.href && (
            <p className="mt-2 text-xs text-muted-foreground">
              Working on: {door.label}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="default"
              disabled={busy}
              onClick={() => onUnblock(open.id)}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
              I handled it — continue
            </Button>
            {skipping ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    onSkip(open.id, "Skipped by the site owner.");
                    setSkipping(false);
                  }}
                >
                  Confirm skip
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSkipping(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setSkipping(true)}
              >
                <SkipForward className="h-4 w-4" aria-hidden />
                Skip this step
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
