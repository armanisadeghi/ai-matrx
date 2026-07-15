"use client";

// features/education/classes/components/ClassesHome.tsx
//
// List-view-first home for the Per-Class Hub (W2-class-hub.md). Lists the
// student's classes (each a scope) with a New button; click a class → its hub.
// Matches the education tool-page convention (MemoryHome): centered container,
// inline header, content floats behind the shell glass. React Compiler on.

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Plus, CalendarClock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useClasses } from "../hooks/useClasses";
import { useMyClasses } from "../hooks/useMyClasses";
import { ClassFormDialog, type ClassFormValue } from "./ClassFormDialog";
import { AccessModeBadge } from "./AccessModeBadge";
import { daysUntil, nextExamDate } from "../settings";
import type { ClassSettings, StudyClass } from "../types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function ClassRow({
  id,
  slug,
  name,
  settings,
  statusChip,
}: {
  id: string;
  slug: string | null;
  name: string;
  settings: ClassSettings;
  statusChip?: ReactNode;
}) {
  const router = useRouter();
  const today = todayIso();
  const next = nextExamDate(settings, today);
  const meta = [settings.teacher, settings.term, settings.period && `Period ${settings.period}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={() => router.push(`/education/classes/${slug ?? id}`)}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <GraduationCap className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">
            {name}
          </span>
          <AccessModeBadge mode={settings.accessMode} />
        </div>
        {meta && (
          <div className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <User className="h-3 w-3" />
            {meta}
          </div>
        )}
      </div>
      {statusChip}
      {!statusChip && next && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          <CalendarClock className="h-3 w-3" />
          {next.title} in {Math.max(0, daysUntil(next.date, today))}d
        </span>
      )}
    </button>
  );
}

function OwnedRow({ cls }: { cls: StudyClass }) {
  return (
    <ClassRow id={cls.id} slug={cls.slug} name={cls.name} settings={cls.settings} />
  );
}

const JOINED_STATUS_LABEL: Record<string, string> = {
  pending: "Requested",
  entitled: "Purchased",
};

export function ClassesHome() {
  const router = useRouter();
  const { classes, loading, createClass } = useClasses();
  const { joined } = useMyClasses();
  const [dialogOpen, setDialogOpen] = useState(false);

  async function handleCreate(value: ClassFormValue) {
    const created = await createClass(value);
    if (created) {
      router.push(`/education/classes/${created.slug ?? created.id}`);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">My Classes</h1>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          New class
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        One workspace per course. Everything you generate or upload can be tagged
        to a class, and each class hub gathers its decks, quizzes, notes, media,
        and exam dates in one place.
      </p>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : classes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
          <GraduationCap className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No classes yet. Add the courses you&apos;re taking — then tag your
            study material to them.
          </p>
          <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add your first class
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {classes.map((cls) => (
            <li key={cls.id}>
              <OwnedRow cls={cls} />
            </li>
          ))}
        </ul>
      )}

      {/* Classes the user has joined (owned by someone else). */}
      {joined.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Joined classes
          </h2>
          <ul className="space-y-2">
            {joined.map((c) => (
              <li key={c.classId}>
                <ClassRow
                  id={c.classId}
                  slug={c.slug}
                  name={c.name}
                  settings={{ ...c.settings, accessMode: c.accessMode }}
                  statusChip={
                    JOINED_STATUS_LABEL[c.myStatus] ? (
                      <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        {JOINED_STATUS_LABEL[c.myStatus]}
                      </span>
                    ) : undefined
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ClassFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
      />
    </div>
  );
}
