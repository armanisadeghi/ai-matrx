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

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  GraduationCap,
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
import { ReadFailure } from "@ai-matrx/design-system";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { ErrorNotice } from "@ai-matrx/design-system";
import { describeFailure } from "@/lib/failure/transport";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useClasses } from "../hooks/useClasses";
import { useClassContent } from "../hooks/useClassContent";
import { useClassAccess } from "../hooks/useClassAccess";
import { useMyClasses } from "../hooks/useMyClasses";
import { useClassAssignments } from "../hooks/useClassAssignments";
import { useClassRoster } from "../hooks/useClassRoster";
import {
  useClassProgressOverview,
  useMyClassProgress,
} from "../hooks/useClassProgress";
import { setAccessMode } from "../service";
import {
  buildClassHubMemberScope,
  buildClassHubOwnerScope,
  buildClassHubPlaceholderScope,
} from "../classHubSurfaceScope";
import {
  parseAssignResourcesValue,
  parseAttachContentValue,
  parseDetachContentValue,
  parseUnassignResourcesValue,
  parseUpdateClassValue,
} from "../classHubAgentWrites";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import {
  EDUCATION_CLASS_SURFACE_NAME,
  type ClassHubView,
} from "@/features/surfaces/manifests/education-class.manifest";
import { ClassFormDialog, type ClassFormValue } from "./ClassFormDialog";
import {
  ClassPartChips,
  ClassStudyContent,
  useSelectedClassPart,
} from "./ClassStudyContent";
import { useClassParts } from "../hooks/useClassParts";
import { groupsInPart } from "../classParts";
import { AccessModeBadge } from "./AccessModeBadge";
import { ClassAccessPanel } from "./ClassAccessPanel";
import { ClassRosterPanel } from "./ClassRosterPanel";
import { ClassAssignmentsPanel } from "./ClassAssignmentsPanel";
import { ClassProgressPanel } from "./ClassProgressPanel";
import { AssignedToYouPanel } from "./AssignedToYouPanel";
import { daysUntil } from "../settings";
import type { StudyClass } from "../types";
import { isUuidShape } from "@ai-matrx/kit/uuid";

/**
 * Surface `matrx-user/education-class` for a hub state with no class data
 * (loading / held for a workspace / unavailable) — the agent still learns
 * which state the page is in instead of seeing the generic education hub.
 */
function ClassHubPlaceholderSurface({
  view,
  classParam,
  children,
}: {
  view: Exclude<ClassHubView, "owner" | "member">;
  classParam: string;
  children: ReactNode;
}) {
  return (
    <SurfaceRuntimeProvider
      surfaceName={EDUCATION_CLASS_SURFACE_NAME}
      getScope={() => buildClassHubPlaceholderScope(view, classParam)}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ClassHubViewProps {
  /** The route param — a class scope id OR slug. */
  classParam: string;
}

export function ClassHubView({ classParam }: ClassHubViewProps) {
  const router = useRouter();
  const { classes, archived, loading, updateClass } = useClasses();

  const cls: StudyClass | undefined = [...classes, ...archived].find(
    (c) => c.id === classParam || c.slug === classParam,
  );

  // The access layer is the authoritative source for role/access_mode. For an
  // OWNED class we have its id from useClasses; for a JOINED class the param is
  // either the scope id or its slug — a student arriving on the teacher's slug
  // link (the URL the owner copies from their own address bar) must resolve
  // too, so joined classes (edu_my_classes, cross-org) are the slug fallback.
  const {
    joined: myClasses,
    loading: myClassesLoading,
    failure: myClassesFailure,
    refresh: refreshMyClasses,
  } = useMyClasses();
  const joinedMatch = isUuidShape(classParam)
    ? undefined
    : myClasses.find((c) => c.slug === classParam || c.classId === classParam);
  const resolvedId =
    cls?.id ?? joinedMatch?.classId ?? (isUuidShape(classParam) ? classParam : null);
  const access = useClassAccess(resolvedId);

  // Owned classes come from every organization's scope tree the person is in,
  // so nothing here waits on (or depends on) the selected organization.
  const stillLoading =
    (loading && !cls) ||
    (!cls && !resolvedId && myClassesLoading) ||
    (access.loading && !access.state);

  if (stillLoading) {
    return (
      <ClassHubPlaceholderSurface view="loading" classParam={classParam}>
        <EducationToolHeader title="Class" />
        <div className="matrx-touch-targets mx-auto w-full max-w-3xl space-y-4 p-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </ClassHubPlaceholderSurface>
    );
  }

  // Owner / personal class → full editable hub. Joined class → member hub.
  // `cls` only proves the scope is VISIBLE in this org's Class-type scope list
  // (e.g. a co-member of the same organization can read another member's
  // class row) — it is never proof of OWNERSHIP. The access layer's
  // `edu_class_state` RPC is the one authority on who owns a class; gate the
  // full editable hub (Edit/Archive/Invite/Assign/Add-content/roster
  // management) on it explicitly, or a non-owner org-mate sees and can
  // attempt every owner control on a class that isn't theirs (D-2026-09-28).
  if (cls && access.state?.isOwner) {
    return (
      <ClassHubBody
        classParam={classParam}
        cls={cls}
        allOwned={[...classes, ...archived]}
        orgId={cls.organizationId}
        access={access}
        onUpdate={updateClass}
      />
    );
  }

  if (access.state) {
    return <MemberClassView classParam={classParam} access={access} />;
  }

  // Denied / deleted / never existed / signed-out all land here — a class is a
  // context scope, so the gate asks the platform which one it is.
  return (
    <ClassHubPlaceholderSurface view="unavailable" classParam={classParam}>
      <EducationToolHeader title="Class" />
      <div className="matrx-touch-targets mx-auto w-full max-w-3xl space-y-4 p-4">
        <BackToClasses />
        {/* A read that FAILED is a fault, never "not found / ask for access":
            when the joined-classes read broke (edu_my_classes 500), a class
            reached by its slug could not be resolved, and the gate used to
            tell the person they had no access (2026-10-03). */}
        <AccessGate
          token="scope"
          id={resolvedId ?? classParam}
          error={access.error ?? (cls || joinedMatch ? null : myClassesFailure)}
          onRetry={() => {
            void refreshMyClasses();
            void access.refresh();
          }}
          renderFault={(fault) => (
            <ErrorNotice
              title="Couldn't open this class"
              message={describeFailure(fault, { action: "load this class", read: true }).sentence}
              error={fault}
              operation="Open a class"
              actions={
                <Button
                  variant="outline"
                  onClick={() => {
                    void refreshMyClasses();
                    void access.refresh();
                  }}
                >
                  Try again
                </Button>
              }
            />
          )}
          fallbackHref="/education/classes"
          fallbackLabel="Classes"
        />
      </div>
    </ClassHubPlaceholderSurface>
  );
}

function BackToClasses() {
  const router = useRouter();
  return (
    <Button
      icon={<ChevronLeft />}
      variant="quiet"
      className="-ml-2"
      onClick={() => router.push("/education/classes")}
    >
      My Classes
    </Button>
  );
}

/** The owner / personal hub — editable, with content + roster. */
function ClassHubBody({
  classParam,
  cls,
  allOwned,
  orgId,
  access,
  onUpdate,
}: {
  classParam: string;
  cls: StudyClass;
  /** Every class the person owns (active + archived) — rename collisions. */
  allOwned: StudyClass[];
  orgId: string | null;
  access: ReturnType<typeof useClassAccess>;
  onUpdate: (
    id: string,
    patch: { name?: string; description?: string; settings?: ClassFormValue["settings"] },
  ) => Promise<StudyClass>;
}) {
  const router = useRouter();
  const content = useClassContent(cls.id, orgId);
  const assignments = useClassAssignments(cls.id);
  // Read here (not inside the panels) so the surface scope and the panels
  // show the same rows from one read.
  const roster = useClassRoster(cls.id);
  const progress = useClassProgressOverview(cls.id);
  // A new or removed assignment is a new progress column: re-read the grid
  // (the panel used to remount on the count for the same reason).
  const assignmentCount = assignments.assignments.length;
  const seenAssignmentCount = useRef(assignmentCount);
  useEffect(() => {
    if (seenAssignmentCount.current === assignmentCount) return;
    seenAssignmentCount.current = assignmentCount;
    void progress.reload();
  }, [assignmentCount, progress]);
  const [editOpen, setEditOpen] = useState(false);
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
        "It moves to Archived classes. Your decks, quizzes, notes and media stay — restore it anytime.",
      confirmLabel: "Archive class",
      variant: "destructive",
    });
    if (!ok) return;
    await onUpdate(cls.id, { settings: { ...cls.settings, archived: true } });
    toast.success("Class archived.");
    router.push("/education/classes");
  }

  // Surface `matrx-user/education-class` — what this hub shows, and the
  // agent's ways in, each through the same hook the page's own buttons use.
  const getScope = () =>
    buildClassHubOwnerScope({
      classParam,
      cls,
      access,
      roster,
      assignments,
      progress,
      content,
    });

  function requireOwner() {
    if (!isOwner)
      throw new Error("Only the class owner can change this class.");
  }

  const writeHandlers: SurfaceWriteHandlers = {
    update_class: {
      validate: (value) => {
        requireOwner();
        parseUpdateClassValue(value, cls, allOwned);
      },
      apply: async (value) => {
        requireOwner();
        const plan = parseUpdateClassValue(value, cls, allOwned);
        const updated = await onUpdate(plan.id, plan.patch);
        // Same as My Classes' update_classes: an access change is also
        // registered server-side (+ the owner membership row).
        if (plan.accessModeChanged)
          await setAccessMode(plan.id, plan.patch.settings.accessMode);
        await access.refresh();
        return {
          summary: `Updated ${plan.previousName}: ${plan.changed.join(", ")}.`,
          data: { id: updated.id, slug: updated.slug, name: updated.name },
        };
      },
    },
    attach_content: {
      validate: (value) => {
        requireOwner();
        parseAttachContentValue(value, content.attachedKeys);
      },
      apply: async (value) => {
        requireOwner();
        const items = parseAttachContentValue(value, content.attachedKeys);
        const done: string[] = [];
        for (const item of items) {
          const result = await content.attach(
            item.token as Parameters<typeof content.attach>[0],
            item.id,
          );
          if (!result.ok)
            throw new Error(
              `Could not tag ${item.token} ${item.id} to the class: ${result.error ?? "the write was refused"}.${done.length ? ` Already tagged: ${done.join(", ")}.` : ""}`,
            );
          done.push(`${item.token} ${item.id}`);
        }
        return { summary: `Tagged ${done.length} item(s) to ${cls.name}.`, data: items };
      },
    },
    detach_content: {
      validate: (value) => {
        requireOwner();
        parseDetachContentValue(value, content.attachedKeys);
      },
      apply: async (value) => {
        requireOwner();
        const items = parseDetachContentValue(value, content.attachedKeys);
        const done: string[] = [];
        for (const item of items) {
          const result = await content.detach(
            item.token as Parameters<typeof content.detach>[0],
            item.id,
          );
          if (!result.ok)
            throw new Error(
              `Could not untag ${item.token} ${item.id} from the class: ${result.error ?? "the write was refused"}.${done.length ? ` Already untagged: ${done.join(", ")}.` : ""}`,
            );
          done.push(`${item.token} ${item.id}`);
        }
        return { summary: `Removed ${done.length} item(s) from ${cls.name}'s study content.`, data: items };
      },
    },
    assign_resources: {
      validate: (value) => {
        requireOwner();
        parseAssignResourcesValue(value);
      },
      apply: async (value) => {
        requireOwner();
        const items = parseAssignResourcesValue(value);
        const done: string[] = [];
        for (const item of items) {
          const { ok } = await assignments.assign(item.token, item.id, item.dueDate);
          if (!ok)
            throw new Error(
              `Could not assign ${item.token} ${item.id} to the class (the error was shown to the person).${done.length ? ` Already assigned: ${done.join(", ")}.` : ""}`,
            );
          done.push(`${item.token} ${item.id}`);
        }
        return { summary: `Assigned ${done.length} item(s) to ${cls.name}.`, data: items };
      },
    },
    unassign_resources: {
      validate: (value) => {
        requireOwner();
        parseUnassignResourcesValue(value, assignments.assignedKeys);
      },
      apply: async (value) => {
        requireOwner();
        const items = parseUnassignResourcesValue(value, assignments.assignedKeys);
        const done: string[] = [];
        for (const item of items) {
          const { ok } = await assignments.unassign(item.token, item.id);
          if (!ok)
            throw new Error(
              `Could not remove the assignment ${item.token} ${item.id} (the error was shown to the person).${done.length ? ` Already removed: ${done.join(", ")}.` : ""}`,
            );
          done.push(`${item.token} ${item.id}`);
        }
        return { summary: `Removed ${done.length} assignment(s) from ${cls.name}.`, data: items };
      },
    },
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={EDUCATION_CLASS_SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={() => writeHandlers}
    >
      <EducationToolHeader title={cls.name} />
      <div className="matrx-touch-targets mx-auto w-full max-w-3xl space-y-5 p-4">
      <div className="space-y-3">
        <BackToClasses />

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
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
              icon={<Pencil />}
              variant="quiet"
              onClick={() => setEditOpen(true)}
              aria-label="Edit class"
            />
            <Button
              icon={<Archive />}
              variant="quiet"
              onClick={handleArchive}
              aria-label="Archive class"
            />
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
                    <div className="text-xs text-muted-foreground">
                      {exam.date}
                      {!past && ` · in ${days}d`}
                      {past && " · past"}
                    </div>
                  </div>
                  {!past && (
                    <Button
                      variant="outline"
                      className="shrink-0"
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
        roster={roster}
      />

      {/* Assignments (owner-managed) — a deck/quiz assigned to the whole roster. */}
      <ClassAssignmentsPanel
        classId={cls.id}
        className={cls.name}
        assignments={assignments}
      />

      {/* Class progress — who has completed each assignment. The grid is
          re-read above when the set of assignments changes, so a new
          assignment appears as a column. */}
      <ClassProgressPanel classId={cls.id} progress={progress} />

      {/* Study content — keeps taking sources, filed by class and by unit. */}
      <ClassStudyContent cls={cls} content={content} />

      <ClassFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={cls}
        onSubmit={handleEdit}
      />
      </div>
    </SurfaceRuntimeProvider>
  );
}

/** A joined student's view of a class they don't own. */
function MemberClassView({
  classParam,
  access,
}: {
  classParam: string;
  access: ReturnType<typeof useClassAccess>;
}) {
  const state = access.state!;
  const isActive = state.myStatus === "active";
  const content = useClassContent(
    isActive ? state.classId : null,
    state.organizationId,
  );
  // Read here (not inside the panels) so the surface scope and the panels
  // show the same rows from one read.
  const roster = useClassRoster(state.classId, isActive);
  const assignments = useClassAssignments(state.classId, isActive);
  const myProgress = useMyClassProgress(state.classId, isActive);
  // Units are read-only here: a member sees them and what is filed in each
  // (anyone who can see the class sees its units); editing stays with the owner.
  const parts = useClassParts(
    { id: state.classId, organizationId: state.organizationId },
    content,
  );
  const { selected: selectedPart, selectPart } = useSelectedClassPart(
    parts.parts,
  );
  const shownGroups = groupsInPart(
    content.groups,
    selectedPart
      ? (parts.membership.get(selectedPart.id) ?? new Set<string>())
      : null,
  );

  const getScope = () =>
    buildClassHubMemberScope({
      classParam,
      access,
      state,
      roster,
      assignments,
      myProgress,
      content,
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={EDUCATION_CLASS_SURFACE_NAME}
      getScope={getScope}
    >
      <EducationToolHeader title={state.name} />
      <div className="matrx-touch-targets mx-auto w-full max-w-3xl space-y-5 p-4">
      <BackToClasses />

      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
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
            roster={roster}
          />
          <AssignedToYouPanel
            classId={state.classId}
            assignments={assignments}
            myProgress={myProgress}
          />
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
              <>
                {parts.parts.length > 0 && (
                  <ClassPartChips
                    parts={parts}
                    selectedId={selectedPart?.id ?? null}
                    onSelect={selectPart}
                  />
                )}
                {selectedPart && parts.membershipError ? (
                  <ReadFailure
                    error={parts.membershipError}
                    what={`what ${selectedPart.name} holds`}
                    onRetry={() => void parts.reloadMembership()}
                    className="m-0"
                  />
                ) : selectedPart && parts.membershipLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : shownGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing in {selectedPart?.name ?? "this class"} yet.
                  </p>
                ) : (
                  <ContentGroups groups={shownGroups} />
                )}
              </>
            )}
          </section>
        </>
      )}
      </div>
    </SurfaceRuntimeProvider>
  );
}

/** Shared content-group renderer for both the owner and member hubs. */
function ContentGroups({
  groups,
}: {
  groups: ReturnType<typeof useClassContent>["groups"];
}) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
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
