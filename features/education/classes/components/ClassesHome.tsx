"use client";

// features/education/classes/components/ClassesHome.tsx
//
// List-view-first home for the Per-Class Hub (W2-class-hub.md). Lists the
// student's classes (each a scope) with a New button; click a class → its hub.
// Matches the education tool-page convention (MemoryHome): centered container,
// inline header, content floats behind the shell glass. React Compiler on.

import { useRef, useState, type ReactNode } from "react";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GraduationCap, Plus, CalendarClock, User, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton, ArchivedDisclosure } from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { useClasses } from "../hooks/useClasses";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { useMyClasses } from "../hooks/useMyClasses";
import { ClassFormDialog, type ClassFormValue } from "./ClassFormDialog";
import { AccessModeBadge } from "./AccessModeBadge";
import { daysUntil, nextExamDate } from "../settings";
import type { ClassSettings, StudyClass } from "../types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { collectionWriteHandlers } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import {
  EDUCATION_CLASSES_SURFACE_NAME,
  type NewClassDraftScope,
} from "@/features/surfaces/manifests/education-classes.manifest";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import {
  parseCreateClassesValue,
  parseDeleteClassesValue,
  parseUpdateClassesValue,
} from "../classAgentWrites";
import { setAccessMode } from "../service";
import { buildEducationClassesScope } from "../classesSurfaceScope";

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
  const today = todayIso();
  const next = nextExamDate(settings, today);
  const meta = [settings.teacher, settings.term, settings.period && `Period ${settings.period}`]
    .filter(Boolean)
    .join(" · ");

  return (
    // A class is a real record with its own page, so the card is an ANCHOR, not
    // a <button>. As a button it navigated on click and nothing else — no
    // cmd-click, no middle-click, no "open in new tab", no visible destination
    // on hover. Same layout, all four doors back.
    <Link
      href={`/education/classes/${slug ?? id}`}
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
    </Link>
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
  const {
    classes,
    archived,
    loading,
    error: classesError,
    refresh,
    createClass,
    updateClass,
    deleteClass,
  } = useClasses();
  const {
    joined,
    loading: joinedLoading,
    error: joinedError,
  } = useMyClasses();
  const { organizationState } = useOrganizationRequired();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // The archived-items-law reveal half: an archived class is hidden by
  // default and restorable in one click, never gone for good from this page
  // (settings.archived is the sanctioned soft-hide the class hub's Archive
  // action writes — see ClassHubView.tsx).
  async function handleRestore(cls: StudyClass) {
    setRestoringId(cls.id);
    try {
      await updateClass(cls.id, { settings: { ...cls.settings, archived: false } });
      toast.success(`${cls.name} restored.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not restore that class.");
    } finally {
      setRestoringId(null);
    }
  }
  // The dialog's live values, published by ClassFormDialog on every render —
  // read synchronously by getScope (polled every 400ms; it must never fetch).
  const draftRef = useRef<NewClassDraftScope | null>(null);

  // Surface `matrx-user/education-classes`: what this page shows, plus the
  // agent's ways in — `new_class_draft` (registered by the dialog, which owns
  // those fields) and `create_classes` / `update_classes` / `delete_classes`
  // (here).
  const getScope = () =>
    buildEducationClassesScope({
      organizationState,
      ownedLoading: loading,
      classes,
      archived,
      joinedLoading: joinedLoading || joinedError != null,
      joined,
      dialogOpen,
      draft: draftRef.current,
    });

  // Every class the agent may name by id: active AND archived.
  const allOwned = [...classes, ...archived];

  // Write half — create / update / delete a LIST of classes, through the
  // shared collection helper: the whole list is checked before the person's
  // approval card, saved item by item through this page's own functions, a
  // part-way failure names what was done, and the agent gets back what landed.
  const toRef = (c: { id: string; slug: string | null; name: string }) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
  });
  const classWriteTargets = collectionWriteHandlers(
    {
      plural: "classes",
      singular: "class",
      create: {
        parse: (value) =>
          parseCreateClassesValue(
            value,
            allOwned.map((c) => c.name),
          ),
        run: async (input) => toRef(await createClass(input)),
        nameOf: (input) => input.name,
        refusalFor: (e) =>
          isOrganizationSelectionCancelled(e)
            ? "The person closed the workspace picker, so no classes were created. Ask which workspace the classes belong in."
            : undefined,
      },
      update: {
        parse: (value) => parseUpdateClassesValue(value, allOwned),
        run: async (plan) => {
          const updated = await updateClass(plan.id, plan.patch);
          // Same as the hub's Edit dialog: an access change is also
          // registered server-side (+ the owner membership row).
          if (plan.accessModeChanged)
            await setAccessMode(plan.id, plan.patch.settings.accessMode);
          return toRef(updated);
        },
        nameOf: (plan) => plan.previousName,
        changedOf: (plan) => plan.changed,
      },
      delete: {
        parse: (value) => parseDeleteClassesValue(value, allOwned),
        run: async (cls) => {
          await deleteClass(cls.id);
          return toRef(cls);
        },
        nameOf: (cls) => cls.name,
      },
    },
    refuseSurfaceWrite,
  );

  // Two-phase registration: `validate` runs before the person's approval
  // card (a bad list is refused and no card is shown), `apply` after approval;
  // its outcome goes back to the agent in the tool result.
  const getWriteHandlers = () => classWriteTargets;

  async function handleCreate(value: ClassFormValue) {
    const created = await createClass(value);
    if (created) {
      router.push(`/education/classes/${created.slug ?? created.id}`);
    }
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName={EDUCATION_CLASSES_SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
    {/* The canonical right-click menu; the provider goes AROUND it. No
        education product slug covers classes, so it reports as the closest
        honest one — the study planner (classes carry the exam dates it plans
        around). */}
    <NonEditableContextMenu
      sourceFeature="education-planner"
      surfaceName={EDUCATION_CLASSES_SURFACE_NAME}
      menuVersion={1}
      getApplicationScope={getScope}
      contentSource={{ type: "raw" }}
    >
    <div className="contents">
    <EducationToolHeader title="My Classes" />
    <div className="matrx-touch-targets mx-auto w-full max-w-3xl space-y-5 px-4 pb-4">
      <div className="flex items-center justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          New class
        </Button>
      </div>

      {organizationState !== "ready" ? (
        // Owned classes live in an organization's scope tree; with none chosen
        // the list can never load, so say so with the picker instead of a
        // skeleton that never resolves.
        <OrganizationContextNotice
          state={organizationState}
          what="Your classes"
        />
      ) : loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : classesError != null && classes.length === 0 ? (
        <ReadFailure error={classesError} what="your classes" onRetry={() => void refresh()} />
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

      {/* Archived classes — hidden by default, restorable in one click
          (never gone for good: the archived-items-law reveal half). */}
      {organizationState === "ready" && archived.length > 0 && (
        <ArchivedDisclosure
          count={archived.length}
          open={showArchived}
          onOpenChange={setShowArchived}
        >
          <ul className="space-y-2">
            {archived.map((cls) => (
              <li
                key={cls.id}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <GraduationCap className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {cls.name}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1.5 text-xs"
                  disabled={restoringId === cls.id}
                  onClick={() => void handleRestore(cls)}
                >
                  <ArchiveRestore className="h-3.5 w-3.5" />
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </ArchivedDisclosure>
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
        agentSurfaceName={EDUCATION_CLASSES_SURFACE_NAME}
        onDraftChange={(draft) => {
          draftRef.current = draft;
        }}
      />
    </div>
    </div>
    </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}
