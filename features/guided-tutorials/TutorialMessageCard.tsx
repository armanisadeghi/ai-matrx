"use client";

/**
 * The `guided_tutorial` message card — drawn INSIDE the messaging package's
 * bubble through the host `actionRenderers` seam
 * (features/messaging/actions/messageActionSurfaces.tsx). "Show me how" moves
 * the app to the tutorial's route with `?tutorial=<id>`; the global
 * TutorialHost takes it from there.
 */

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CircleCheck, GraduationCap, Play, RotateCcw } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import type { GuidedTutorialActionPayload } from "@/features/messaging/types";
import { findTutorial, tutorialHref } from "./registry";
import { useTutorialCompleted } from "./TutorialHost";

export function TutorialMessageCard({ payload }: { payload: GuidedTutorialActionPayload; isOwn: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const tutorial = findTutorial(payload?.tutorial_id);
  const completed = useTutorialCompleted(payload?.tutorial_id ?? "");
  if (!payload?.tutorial_id) return null;

  const title = tutorial?.title ?? payload.title;
  const href = tutorial ? tutorialHref(tutorial) : payload.href?.startsWith("/") ? payload.href : null;
  const steps = tutorial?.steps.length ?? 0;

  return (
    <div className="flex w-full max-w-sm items-center gap-3 rounded-lg border border-border bg-card p-2.5 text-card-foreground">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary-ink">
        <GraduationCap className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate type-title">{title}</p>
        <p className="m-0 flex items-center gap-1 truncate type-meta text-muted-foreground">
          {completed ? <CircleCheck className="h-3 w-3 text-success" aria-hidden /> : null}
          {!tutorial ? "No longer available" : completed ? "Done" : `${steps} steps`}
        </p>
      </div>
      {href && tutorial ? (
        <Button
          variant={completed ? "outline" : "primary"}
          icon={completed ? <RotateCcw /> : <Play />}
          disabled={pending}
          onClick={() => startTransition(() => router.push(href))}
        >
          {completed ? "Again" : "Show me how"}
        </Button>
      ) : null}
    </div>
  );
}
