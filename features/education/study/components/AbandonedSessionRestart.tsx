"use client";

// features/education/study/components/AbandonedSessionRestart.tsx
//
// Abandoned sessions have nothing useful to review — offer a single restart path:
// soft-delete this row, then open a fresh run for the same set/mode.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, Trash2, XCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { fcService } from "@/features/flashcards/data/fcService";
import { studyService } from "../service/studyService";
import type { StudySessionRow } from "../types";
import { resolveSessionRestartHref } from "../utils/sessionRestart";
import { sessionModeLabel } from "../utils/sessionListDisplay";

export function AbandonedSessionRestart({
  session,
  listHref = "/education/flashcards/sessions",
}: {
  session: StudySessionRow;
  /** Where to land after a plain delete (defaults to flashcards session history). */
  listHref?: string;
}) {
  const router = useRouter();
  const [setName, setSetName] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"restart" | "delete" | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const restartHref = resolveSessionRestartHref(session);
  const activity = sessionModeLabel(session.mode);

  useEffect(() => {
    const setId = session.source_set_id;
    if (!setId) return undefined;
    let cancelled = false;
    void (async () => {
      const res = await fcService.getSet(setId);
      if (cancelled || !res.data) return;
      setSetName(res.data.name);
    })();
    return () => {
      cancelled = true;
    };
  }, [session.source_set_id]);

  const startNewSession = async (): Promise<void> => {
    if (busyAction || isPending) return;
    setBusyAction("restart");
    const del = await studyService.deleteSession(session.id);
    if (del.error) {
      toast.error("Couldn't remove the old session", {
        description: del.error,
      });
      setBusyAction(null);
      return;
    }
    startTransition(() => {
      router.push(restartHref);
    });
  };

  const deleteAndReturn = async (): Promise<void> => {
    if (busyAction || isPending) return;
    setBusyAction("delete");
    const del = await studyService.deleteSession(session.id);
    if (del.error) {
      toast.error("Couldn't delete session", { description: del.error });
      setBusyAction(null);
      return;
    }
    startTransition(() => {
      router.push(listHref);
    });
  };

  const working = busyAction !== null || isPending;

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <XCircle className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Session abandoned
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          This {activity.toLowerCase()} run didn&apos;t finish, so there&apos;s
          nothing to review here.
          {setName ? (
            <>
              {" "}
              Start a new session with{" "}
              <span className="font-medium text-foreground">{setName}</span>.
            </>
          ) : (
            <> Start a new session for the same set.</>
          )}
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <Button
          size="lg"
          className="gap-2"
          disabled={working}
          onClick={() => void startNewSession()}
        >
          {busyAction === "restart" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Start new session
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="gap-1.5"
          disabled={working}
          onClick={() => void deleteAndReturn()}
        >
          {busyAction === "delete" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Delete
        </Button>
      </div>
    </div>
  );
}
