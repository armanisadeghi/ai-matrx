"use client";

// features/education/classes/components/ClassHubView.tsx
//
// The per-class hub (W2-class-hub.md §3 + Convergence C): a course-scoped
// workspace that aggregates everything tagged to the class scope, PLUS the
// membership + access-mode layer — an access badge, the Members/roster panel
// (owner manages requests + members), and the Join/Request/Enroll surface for a
// non-member. It serves BOTH the owner (a class in their org, resolved by
// useClasses) and a joined student (a class in the TEACHER's org, resolved by the
// edu_class_state RPC — RLS keeps a non-member out of a closed/paid class).

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  GraduationCap,
  Plus,
  ChevronLeft,
  Pencil,
  Archive,
  CalendarClock,
  User,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { useClasses } from "../hooks/useClasses";
import { useClassContent } from "../hooks/useClassContent";
import { useClassAccess } from "../hooks/useClassAccess";
import { useMyClasses } from "../hooks/useMyClasses";
import { useClassAssignments } from "../hooks/useClassAssignments";
import { ClassFormDialog, type ClassFormValue } from "./ClassFormDialog";
import { AddClassContentSheet } from "./AddClassContentSheet";
import { AccessModeBadge } from "./AccessModeBadge";
import { ClassAccessPanel } from "./ClassAccessPanel";
import { ClassRosterPanel } from "./ClassRosterPanel";
import { ClassAssignmentsPanel } from "./ClassAssignmentsPanel";
import { ClassProgressPanel } from "./ClassProgressPanel";
import { AssignedToYouPanel } from "./AssignedToYouPanel";
import { daysUntil } from "../settings";
import type { StudyClass } from "../types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ClassHubViewProps {
  /** The route param — a class scope id OR slug. */
  classParam: string;
}

export function ClassHubView({ classParam }: ClassHubViewProps) {
  const router = useRouter();
  const { classes, archived, loading, updateClass, orgId } = useClasses();

  const cls: StudyClass | undefined = [...classes, ...archived].find(
    (c) => c.id === classParam || c.slug === classParam,
  );

  // The access layer is the authoritative source for role/access_mode. For an
  // OWNED class we have its id from useClasses; for a JOINED class the param is
  // either the scope id or its slug — a student arriving on the teacher's slug
  // link (the URL the owner copies from their own address bar) must resolve
  // too, so joined classes (edu_my_classes, cross-org) are the slug fallback.
  const { joined: myClasses, loading: myClassesLoading } = useMyClasses();
  const joinedMatch = UUID_RE.test(classParam)
    ? undefined
    : myClasses.find((c) => c.slug === classParam || c.classId === classParam);
  const resolvedId =
    cls?.id ?? joinedMatch?.classId ?? (UUID_RE.test(classParam) ? classParam : null);
  const access = useClassAccess(resolvedId);

  // Owned classes load from the active organization's scope tree, which never
  // loads with no organization chosen — so that wait only counts once one is.
  // A joined class (cross-org) still resolves through useMyClasses without it.
  const { organizationState } = useOrganizationRequired();
  const orgReady = organizationState === "ready";

  const stillLoading =
    (orgReady && loading && !cls) ||
    (!cls && !resolvedId && myClassesLoading) ||
    (access.loading && !access.state);

  if (stillLoading) {
    return (
      <>
        <EducationToolHeader title="Class" />
        <div className="matrx-touch-targets mx-auto w-full max-w-3xl space-y-4 p-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  }

  // Owner / personal class → full editable hub. Joined class → member hub.
  if (cls) {
    return (
      <ClassHubBody
        cls={cls}
        orgId={orgId}
        access={access}
        onUpdate={updateClass}
      />
    );
  }

  if (access.state) {
    return <MemberClassView access={access} />;
  }

  if (!orgReady) {
    return (
      <>
        <EducationToolHeader title="Class" />
        <div className="matrx-touch-targets mx-auto w-full max-w-3xl space-y-4 p-4">
          <BackToClasses />
          <OrganizationContextNotice state={organizationState} what="This class" />
        </div>
      </>
    );
  }

  // Denied / deleted / never existed / signed-out all land here — a class is a
  // context scope, so the gate asks the platform which one it is.
  return (
    <>
      <EducationToolHeader title="Class" />
      <div className="matrx-touch-targets mx-auto w-full max-w-3xl space-y-4 p-4">
        <BackToClasses />
        <AccessGate
          token="scope"
          id={resolvedId ?? classParam}
          error={access.error}
          onRetry={() => void access.refresh()}
          fallbackHref="/education/classes"
          fallbackLabel="Classes"
        />
      </div>
    </>
  );
}

function BackToClasses() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-7 gap-1.5 text-muted-foreground"
      onClick={() => router.push("/education/classes")}
    >
      <ChevronLeft className="h-4 w-4" />
      My Classes
    </Button>
  );
}

/** The owner / personal hub — editable, with content + roster. */
function ClassHubBody({
  cls,
  orgId,
  access,
  onUpdate,
}: {
  cls: StudyClass;
  orgId: string | null;
  access: ReturnType<typeof useClassAccess>;
  onUpdate: (
    id: string,
    patch: { name?: string; description?: string; settings?: ClassFormValue["settings"] },
  ) => Promise<unknown>;
}) {
  const router = useRouter();
  const content = useClassContent(cls.id, orgId);
  const assignments = useClassAssignments(cls.id);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const today = todayIso();

  const isOwner = access.state?.isOwner ?? true;
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
    // Access mode is part of settings; re-affirm it server-side (+ owner row).
    await access.refresh();
    toast.success("Class updated.");
  }

  // Archive, never a hard delete from this page — the platform rule (a
  // person's records are archived and restorable, never permanently removed
  // from a page they're looking at). `settings.archived` is the sanctioned
  // soft-hide (see ClassesHome's "Archived classes" section for the restore
  // path); the DB's own `delete_scope` RPC (a deeper soft-delete with no
  // restore surface anywhere in the app) stays reserved for the agent write
  // targets that already document this same choice (classAgentWrites.ts).
  async function handleArchive() {
    const ok = await confirm({
      title: `Archive ${cls.name}?`,
      description:
        "It moves out of My Classes into Archived classes. Your decks, quizzes, notes, and media are NOT affected — you can restore this class anytime.",
      confirmLabel: "Archive class",
      variant: "destructive",
    });
    if (!ok) return;
    await onUpdate(cls.id, { settings: { ...cls.settings, archived: true } });
    toast.success("Class archived.");
    router.push("/education/classes");
  }

  return (
    <>
      <EducationToolHeader title={cls.name} />
      <div className="matrx-touch-targets mx-auto w-full max-w-3xl space-y-5 p-4">
      <div className="space-y-3">
        <BackToClasses />

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GraduationCap className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-semibold text-foreground">
                  {cls.name}
                </h1>
                <AccessModeBadge mode={cls.settings.accessMode} />
              </div>
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
              onClick={handleArchive}
              aria-label="Archive class"
            >
              <Archive className="h-4 w-4" />
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

      {/* Members / roster */}
      <ClassRosterPanel
        classId={cls.id}
        className={cls.name}
        isOwner={isOwner}
        onChanged={access.refresh}
      />

      {/* Assignments (owner-managed) — a deck/quiz assigned to the whole roster. */}
      <ClassAssignmentsPanel
        classId={cls.id}
        className={cls.name}
        assignments={assignments}
      />

      {/* Class progress — who has completed each assignment. Remounts when the
          set of assignments changes so a new assignment appears as a column. */}
      <ClassProgressPanel
        key={assignments.assignments.length}
        classId={cls.id}
      />

      {/* Study content */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">
            Study content
            {!content.error && content.totalCount > 0 && (
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
        ) : content.error ? (
          <ReadFailure
            error={content.error}
            what="this class's study content"
            onRetry={() => void content.reload()}
            className="m-0"
          />
        ) : content.totalCount === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing tagged to this class yet. Tag a deck, quiz, note, or upload
              — or generate new material while this class is your active context.
            </p>
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add study content
            </Button>
          </div>
        ) : (
          <ContentGroups content={content} />
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
    </>
  );
}

/** A joined student's view of a class they don't own. */
function MemberClassView({
  access,
}: {
  access: ReturnType<typeof useClassAccess>;
}) {
  const state = access.state!;
  const isActive = state.myStatus === "active";
  const content = useClassContent(
    isActive ? state.classId : null,
    state.organizationId,
  );

  return (
    <>
      <EducationToolHeader title={state.name} />
      <div className="matrx-touch-targets mx-auto w-full max-w-3xl space-y-5 p-4">
      <BackToClasses />

      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <GraduationCap className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-foreground">
              {state.name}
            </h1>
            <AccessModeBadge mode={state.accessMode} />
          </div>
          {state.description && (
            <p className="text-sm text-muted-foreground">{state.description}</p>
          )}
        </div>
      </div>

      <ClassAccessPanel access={access} />

      {isActive && (
        <>
          <ClassRosterPanel
            classId={state.classId}
            isOwner={false}
            onChanged={access.refresh}
          />
          <AssignedToYouPanel classId={state.classId} />
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-foreground">
              Study content
              {!content.error && content.totalCount > 0 && (
                <span className="ml-1.5 text-muted-foreground">
                  ({content.totalCount})
                </span>
              )}
            </h2>
            {content.loading ? (
              <Skeleton className="h-12 w-full" />
            ) : content.error ? (
              <ReadFailure
                error={content.error}
                what="this class's study content"
                onRetry={() => void content.reload()}
                className="m-0"
              />
            ) : content.totalCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing shared to this class yet.
              </p>
            ) : (
              <ContentGroups content={content} />
            )}
          </section>
        </>
      )}
      </div>
    </>
  );
}

/** Shared content-group renderer for both the owner and member hubs. */
function ContentGroups({
  content,
}: {
  content: ReturnType<typeof useClassContent>;
}) {
  return (
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
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </>
              );
              return (
                <li key={item.edgeId}>
                  {href ? (
                    // A real record opens through a real link — new tab,
                    // middle-click and crawl all keep working (core rule 5:
                    // "a link is a link", never a button calling router.push).
                    <Link
                      href={href}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
                    >
                      {inner}
                    </Link>
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
  );
}
