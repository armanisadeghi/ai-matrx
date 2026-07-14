"use client";

// features/education/classes/components/ClassHubView.tsx
//
// The per-class hub (W2-class-hub.md §3): a course-scoped workspace that
// aggregates everything tagged to the class scope (decks, quizzes, notes,
// media, files) plus its exam dates. Reading is the scope's incoming
// platform.associations edges; nothing here writes global/active context.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  Plus,
  ChevronLeft,
  Pencil,
  Trash2,
  CalendarClock,
  User,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useClasses } from "../hooks/useClasses";
import { useClassContent } from "../hooks/useClassContent";
import { ClassFormDialog, type ClassFormValue } from "./ClassFormDialog";
import { AddClassContentSheet } from "./AddClassContentSheet";
import { daysUntil } from "../settings";
import type { StudyClass } from "../types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ClassHubViewProps {
  /** The route param — a class scope id OR slug. */
  classParam: string;
}

export function ClassHubView({ classParam }: ClassHubViewProps) {
  const router = useRouter();
  const { classes, archived, loading, updateClass, deleteClass, orgId } =
    useClasses();

  const cls: StudyClass | undefined = [...classes, ...archived].find(
    (c) => c.id === classParam || c.slug === classParam,
  );

  if (loading && !cls) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!cls) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => router.push("/education/classes")}
        >
          <ChevronLeft className="h-4 w-4" />
          My Classes
        </Button>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
          <GraduationCap className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            This class doesn&apos;t exist, or you don&apos;t have access to it.
          </p>
        </div>
      </div>
    );
  }

  return <ClassHubBody cls={cls} orgId={orgId} onUpdate={updateClass} onDelete={deleteClass} />;
}

function ClassHubBody({
  cls,
  orgId,
  onUpdate,
  onDelete,
}: {
  cls: StudyClass;
  orgId: string | null;
  onUpdate: (
    id: string,
    patch: { name?: string; description?: string; settings?: ClassFormValue["settings"] },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const content = useClassContent(cls.id, orgId);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const today = todayIso();

  const meta = [
    cls.settings.teacher,
    cls.settings.term,
    cls.settings.period && `Period ${cls.settings.period}`,
  ]
    .filter(Boolean)
    .join(" · ");

  async function handleEdit(value: ClassFormValue) {
    await onUpdate(cls.id, {
      name: value.name,
      description: value.description,
      settings: value.settings,
    });
    toast.success("Class updated.");
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete ${cls.name}?`,
      description:
        "This removes the class and its tags. Your decks, quizzes, notes, and media are NOT deleted — they just stop being grouped here.",
      confirmLabel: "Delete class",
      variant: "destructive",
    });
    if (!ok) return;
    await onDelete(cls.id);
    toast.success("Class deleted.");
    router.push("/education/classes");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4">
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-7 gap-1.5 text-muted-foreground"
          onClick={() => router.push("/education/classes")}
        >
          <ChevronLeft className="h-4 w-4" />
          My Classes
        </Button>

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GraduationCap className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-foreground">
                {cls.name}
              </h1>
              {meta && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  {meta}
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setEditOpen(true)}
              aria-label="Edit class"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              aria-label="Delete class"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {cls.description && (
          <p className="text-sm text-muted-foreground">{cls.description}</p>
        )}
      </div>

      {/* Exam dates */}
      {cls.settings.examDates.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Exam dates
          </h2>
          <ul className="space-y-1.5">
            {cls.settings.examDates.map((exam) => {
              const days = daysUntil(exam.date, today);
              const past = days < 0;
              return (
                <li
                  key={exam.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {exam.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {exam.date}
                      {!past && ` · in ${days}d`}
                      {past && " · past"}
                    </div>
                  </div>
                  {!past && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 gap-1 text-xs"
                      onClick={() =>
                        router.push(
                          `/education/planner?examBy=${encodeURIComponent(exam.date)}&for=${encodeURIComponent(cls.name)}`,
                        )
                      }
                    >
                      Plan around this
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Study content */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">
            Study content
            {content.totalCount > 0 && (
              <span className="ml-1.5 text-muted-foreground">
                ({content.totalCount})
              </span>
            )}
          </h2>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add content
          </Button>
        </div>

        {content.loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : content.totalCount === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing tagged to this class yet. Tag a deck, quiz, note, or upload
              — or generate new material while this class is your active context.
            </p>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add study content
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {content.groups.map((group) => (
              <div key={group.group} className="space-y-1.5">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.group}
                </h3>
                <ul className="space-y-1.5">
                  {group.items.map((item) => {
                    const Icon = item.Icon;
                    const href = item.href;
                    const inner = (
                      <>
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {item.title}
                        </span>
                        {href && (
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                      </>
                    );
                    return (
                      <li key={item.edgeId}>
                        {href ? (
                          <button
                            type="button"
                            onClick={() => router.push(href)}
                            className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
                          >
                            {inner}
                          </button>
                        ) : (
                          <div className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2">
                            {inner}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <ClassFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={cls}
        onSubmit={handleEdit}
      />
      <AddClassContentSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        className={cls.name}
        content={content}
      />
    </div>
  );
}
