"use client";

// features/education/study/components/SessionsBrowser.tsx
//
// Mode-agnostic study-session history list (the study spine is shared, so this
// one browser serves flashcards, quizzes, and every future mode). Loads the
// user's sessions via studyService.listSessions (RLS-scoped), newest-first, with
// optional set/mode/status filters. Each row opens the session detail; rows can
// be deleted (soft-delete). The model every education feature copies.
//
// React Compiler is on: no manual memo.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  History,
  ChevronRight,
  Trash2,
  AlertCircle,
  Loader2,
  CheckCircle2,
  CircleDashed,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { studyService } from "../service/studyService";
import type { StudySessionRow } from "../types";

const MODE_LABEL: Record<string, string> = {
  fast_fire: "Fast Fire",
  classic_review: "Study",
  flashcards: "Study",
  quiz: "Quiz",
  practice_test: "Practice Test",
  adaptive: "Adaptive",
};

const STATUS_META: Record<
  string,
  { label: string; icon: typeof CheckCircle2; classes: string }
> = {
  completed: { label: "Completed", icon: CheckCircle2, classes: "text-green-600 dark:text-green-400" },
  active: { label: "In progress", icon: CircleDashed, classes: "text-amber-600 dark:text-amber-400" },
  abandoned: { label: "Abandoned", icon: XCircle, classes: "text-muted-foreground" },
};

function modeLabel(mode: string | null): string {
  if (!mode) return "Session";
  return MODE_LABEL[mode] ?? mode.replace(/_/g, " ");
}

function whenLabel(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function SessionsBrowser({
  setId,
  mode,
  title,
  backHref,
  detailBasePath,
}: {
  /** Restrict to one set (study_session.source_set_id). */
  setId?: string;
  /** Restrict to one mode (e.g. 'fast_fire'). */
  mode?: string;
  title: string;
  /** Back-link target; falls back to router.back(). */
  backHref?: string;
  /** Where a row links — `${detailBasePath}/${sessionId}`. */
  detailBasePath: string;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<StudySessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await studyService.listSessions({ setId, mode });
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setSessions([]);
      } else {
        setSessions(res.data ?? []);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [setId, mode, reloadKey]);

  const open = (id: string) => {
    startTransition(() => router.push(`${detailBasePath}/${id}`));
  };

  const doDelete = async () => {
    if (!confirmId) return;
    setDeleting(true);
    const res = await studyService.deleteSession(confirmId);
    setDeleting(false);
    setConfirmId(null);
    if (res.error) {
      toast.error("Couldn't delete session", { description: res.error });
    } else {
      toast.success("Session deleted");
      setReloadKey((k) => k + 1);
    }
  };

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 h-8 px-2 text-xs text-muted-foreground"
          onClick={() => (backHref ? router.push(backHref) : router.back())}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>

        <div className="mb-5 flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-14 text-center">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-foreground">Couldn&apos;t load sessions</p>
            <p className="max-w-md text-xs text-muted-foreground">{error}</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <History className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No sessions yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Study or run a Fast Fire drill and your sessions will show up here
              with your results and progress over time.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => {
              const status = STATUS_META[s.status ?? ""] ?? STATUS_META.abandoned;
              return (
                <li
                  key={s.id}
                  className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 hover:border-primary/40"
                >
                  <button
                    type="button"
                    onClick={() => open(s.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {modeLabel(s.mode)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {whenLabel(s.created_at)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-xs ${status.classes}`}
                    >
                      <status.icon className="h-3.5 w-3.5" />
                      {status.label}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete session"
                    onClick={() => setConfirmId(s.id)}
                    className="shrink-0 rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(o) => !o && setConfirmId(null)}
        title="Delete this session?"
        description="This removes the session and its results from your history. Your card mastery is not affected."
        confirmLabel="Delete"
        variant="destructive"
        busy={deleting}
        onConfirm={doDelete}
      />
    </div>
  );
}
