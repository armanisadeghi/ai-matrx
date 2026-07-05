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
import Link from "next/link";
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
  Trophy,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { fcService } from "@/features/flashcards/data/fcService";
import { studyService } from "../service/studyService";
import type { SessionAttemptSummary, StudySessionRow } from "../types";
import {
  buildSessionListLines,
  sessionListScorePct,
  sessionModeLabel,
} from "../utils/sessionListDisplay";
import { ScoreRing, scoreAccentBgClasses } from "./ScoreRing";

const STATUS_META: Record<
  string,
  { label: string; icon: typeof CheckCircle2; classes: string }
> = {
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    classes: "text-green-600 dark:text-green-400",
  },
  active: {
    label: "In progress",
    icon: CircleDashed,
    classes: "text-amber-600 dark:text-amber-400",
  },
  abandoned: {
    label: "Abandoned",
    icon: XCircle,
    classes: "text-muted-foreground",
  },
};

function modeLabel(mode: string | null): string {
  return sessionModeLabel(mode);
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
  const [setNames, setSetNames] = useState<Record<string, string>>({});
  const [attemptSummaries, setAttemptSummaries] = useState<
    Record<string, SessionAttemptSummary>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await studyService.listSessions({ setId, mode });
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setSessions([]);
        setSetNames({});
        setAttemptSummaries({});
        setLoading(false);
        return;
      }

      const rows = res.data ?? [];
      setSessions(rows);
      setError(null);

      const sessionIds = rows.map((s) => s.id);
      const sourceSetIds = rows
        .map((s) => s.source_set_id)
        .filter((id): id is string => !!id);

      const [namesRes, attemptsRes] = await Promise.all([
        fcService.getSetNamesByIds(sourceSetIds),
        studyService.getAttemptSummariesForSessions(sessionIds),
      ]);

      if (cancelled) return;
      setSetNames(namesRes.data ?? {});
      setAttemptSummaries(attemptsRes.data ?? {});
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [setId, mode, reloadKey]);

  const open = (id: string) => {
    if (isPending) return;
    setNavigatingId(id);
    startTransition(() => {
      router.push(`${detailBasePath}/${id}`);
    });
  };

  const deleteSessionImmediately = async (id: string): Promise<void> => {
    if (deletingId || deleting) return;
    setDeletingId(id);
    const res = await studyService.deleteSession(id);
    setDeletingId(null);
    if (res.error) {
      toast.error("Couldn't delete session", { description: res.error });
    } else {
      toast.success("Session deleted");
      setReloadKey((k) => k + 1);
    }
  };

  const requestDelete = (session: StudySessionRow): void => {
    if (session.status === "abandoned") {
      void deleteSessionImmediately(session.id);
      return;
    }
    setConfirmId(session.id);
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
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8 pb-safe">
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
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-14 text-center">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-foreground">
              Couldn&apos;t load sessions
            </p>
            <p className="max-w-md text-xs text-muted-foreground">{error}</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <History className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              No sessions yet
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Study or run a Fast Fire drill and your sessions will show up here
              with your results and progress over time.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {sessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                setName={
                  s.source_set_id ? setNames[s.source_set_id] : undefined
                }
                attempts={attemptSummaries[s.id]}
                detailHref={`${detailBasePath}/${s.id}`}
                isNavigating={navigatingId === s.id && isPending}
                disabled={isPending || deletingId !== null}
                onOpen={() => open(s.id)}
                onDelete={() => requestDelete(s)}
                isDeleting={deletingId === s.id}
              />
            ))}
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

function SessionRow({
  session,
  setName,
  attempts,
  detailHref,
  isNavigating,
  disabled,
  isDeleting,
  onOpen,
  onDelete,
}: {
  session: StudySessionRow;
  setName?: string;
  attempts?: SessionAttemptSummary;
  detailHref: string;
  isNavigating: boolean;
  disabled: boolean;
  isDeleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const status = STATUS_META[session.status ?? ""] ?? STATUS_META.abandoned;
  const lines = buildSessionListLines(
    session,
    setName,
    attempts,
    modeLabel(session.mode),
  );
  const scorePct = sessionListScorePct(attempts);
  const isHighScore = scorePct !== null && scorePct >= 90;
  const editedCount = attempts?.editedCount ?? 0;

  const handleOpen = (e: React.MouseEvent) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    onOpen();
  };

  return (
    <li
      className={cn(
        "group relative flex items-stretch overflow-hidden rounded-2xl border border-border bg-card transition-all",
        "hover:border-primary/40 hover:shadow-md",
        isNavigating && "opacity-70",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          scoreAccentBgClasses(scorePct),
        )}
      />

      <Link
        href={detailHref}
        onClick={handleOpen}
        aria-disabled={disabled}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-3",
          disabled && "pointer-events-none",
        )}
      >
        <ScoreRing
          pct={scorePct}
          size={48}
          strokeWidth={5}
          valueClassName="text-[13px]"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-foreground">
              {lines.title}
            </p>
            {isHighScore && (
              <Trophy
                className="h-3.5 w-3.5 shrink-0 text-amber-500"
                aria-label="High score"
              />
            )}
            {editedCount > 0 && (
              <Pencil
                className="h-3 w-3 shrink-0 text-muted-foreground"
                aria-label={`${editedCount} answer${editedCount === 1 ? "" : "s"} manually edited`}
              />
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {lines.detail}
          </p>
          {lines.meta && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
              {lines.meta}
            </p>
          )}
        </div>

        <span
          className={cn(
            "hidden shrink-0 items-center gap-1 text-xs sm:inline-flex",
            status.classes,
          )}
        >
          {isNavigating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <status.icon className="h-3.5 w-3.5" />
          )}
          {status.label}
        </span>

        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>

      <button
        type="button"
        aria-label="Delete session"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="shrink-0 self-stretch px-2 text-muted-foreground opacity-100 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
      >
        {isDeleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </button>
    </li>
  );
}
