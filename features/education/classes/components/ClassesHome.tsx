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
import { GraduationCap, Plus, CalendarClock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { useClasses } from "../hooks/useClasses";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { useMyClasses } from "../hooks/useMyClasses";
import { ClassFormDialog, type ClassFormValue } from "./ClassFormDialog";
import { AccessModeBadge } from "./AccessModeBadge";
import { daysUntil, nextExamDate } from "../settings";
import type { ClassSettings, StudyClass } from "../types";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteOutcome,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
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

/** What a class write hands back to the agent. */
interface ClassWriteOutcome {
  summary: string;
  data: { classes: { id: string; slug: string | null; name: string }[] };
}

function describe(cls: { id: string; slug: string | null; name: string }): string {
  return `"${cls.name}" (id ${cls.id}${cls.slug ? `, slug ${cls.slug}` : ""})`;
}

function outcome(
  verb: "Created" | "Updated" | "Deleted",
  done: StudyClass[],
  changed?: string[][],
): ClassWriteOutcome {
  const list = done.map(
    (c, i) =>
      `${describe(c)}${changed?.[i]?.length ? ` [${changed[i].join(", ")}]` : ""}`,
  );
  return {
    summary: `${verb} ${done.length} class${done.length === 1 ? "" : "es"}: ${list.join("; ")}.`,
    data: {
      classes: done.map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
    },
  };
}

/** A write that failed part-way: say exactly what was and was not done. */
function partialFailure(
  verb: "Created" | "Updated" | "Deleted",
  done: StudyClass[],
  total: number,
  failedName: string,
  error: unknown,
  notAttempted: string[],
): never {
  throw new Error(
    `${verb} ${done.length} of ${total} classes${
      done.length ? ` (${done.map(describe).join(", ")})` : ""
    }. "${failedName}" failed: ${
      error instanceof Error && error.message ? error.message : "unknown error"
    }.${notAttempted.length ? ` Not attempted: ${notAttempted.join(", ")}.` : ""}`,
  );
}

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

  // Write half. Each target is a pure `validate` (the whole list is checked
  // against the person's current classes before anything is written) and an
  // `apply` that writes through this page's own canonical path and returns
  // what happened, with ids and slugs, for the agent. If one write fails
  // part-way, the error says exactly which classes were already done, so a
  // retry never duplicates.
  const classWriteTargets = {
    create_classes: {
      validate: (value: unknown) => {
        parseCreateClassesValue(
          value,
          allOwned.map((c) => c.name),
        );
      },
      apply: async (value: unknown): Promise<SurfaceWriteOutcome> => {
        const inputs = parseCreateClassesValue(
          value,
          allOwned.map((c) => c.name),
        );
        const done: StudyClass[] = [];
        for (const [i, input] of inputs.entries()) {
          try {
            done.push(await createClass(input));
          } catch (e) {
            if (isOrganizationSelectionCancelled(e) && done.length === 0)
              refuseSurfaceWrite(
                "The person closed the workspace picker, so no classes were created. Ask which workspace the classes belong in.",
              );
            partialFailure("Created", done, inputs.length, input.name, e,
              inputs.slice(i + 1).map((c) => c.name));
          }
        }
        return outcome("Created", done);
      },
    },
    update_classes: {
      validate: (value: unknown) => {
        parseUpdateClassesValue(value, allOwned);
      },
      apply: async (value: unknown): Promise<SurfaceWriteOutcome> => {
        const plans = parseUpdateClassesValue(value, allOwned);
        const done: StudyClass[] = [];
        for (const [i, plan] of plans.entries()) {
          try {
            const updated = await updateClass(plan.id, plan.patch);
            // Same as the hub's Edit dialog: an access change is also
            // registered server-side (+ the owner membership row).
            if (plan.accessModeChanged)
              await setAccessMode(plan.id, plan.patch.settings.accessMode);
            done.push(updated);
          } catch (e) {
            partialFailure("Updated", done, plans.length, plan.previousName, e,
              plans.slice(i + 1).map((p) => p.previousName));
          }
        }
        return outcome("Updated", done, plans.map((p) => p.changed));
      },
    },
    delete_classes: {
      validate: (value: unknown) => {
        parseDeleteClassesValue(value, allOwned);
      },
      apply: async (value: unknown): Promise<SurfaceWriteOutcome> => {
        const targets = parseDeleteClassesValue(value, allOwned);
        const done: StudyClass[] = [];
        for (const [i, cls] of targets.entries()) {
          try {
            await deleteClass(cls.id);
            done.push(cls as StudyClass);
          } catch (e) {
            partialFailure("Deleted", done, targets.length, cls.name, e,
              targets.slice(i + 1).map((c) => c.name));
          }
        }
        return outcome("Deleted", done);
      },
    },
  };

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
    <EducationToolHeader title="My Classes" />
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-4">
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
    </SurfaceRuntimeProvider>
  );
}
