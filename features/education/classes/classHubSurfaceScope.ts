// features/education/classes/classHubSurfaceScope.ts
//
// Builds the `matrx-user/education-class` scope from what the class hub
// already holds in render state. Synchronous and fetch-free: the Surface
// Context window polls getScope every 400ms. A key is OMITTED while its data
// is loading (or failed) and is an empty array once loaded with nothing in it.

import {
  createEducationClassScope,
  type ClassHubContentEntry,
  type ClassHubView,
} from "@/features/surfaces/manifests/education-class.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { daysUntil } from "./settings";
import type { UseClassAccessReturn } from "./hooks/useClassAccess";
import type { UseClassAssignmentsReturn } from "./hooks/useClassAssignments";
import type { UseClassContentReturn } from "./hooks/useClassContent";
import type { UseClassRosterReturn } from "./hooks/useClassRoster";
import type {
  UseClassProgressOverviewReturn,
  UseMyClassProgressReturn,
} from "./hooks/useClassProgress";
import type { ClassAccessState, StudyClass } from "./types";

const todayIso = () => new Date().toISOString().slice(0, 10);

/** The scope for a hub state with no class data (loading / held / denied). */
export function buildClassHubPlaceholderScope(
  view: Exclude<ClassHubView, "owner" | "member">,
  classParam: string,
): SurfaceScopePayload {
  return createEducationClassScope({ view, class_param: classParam });
}

function contentScope(content: UseClassContentReturn): {
  study_content?: ClassHubContentEntry[];
  study_content_count?: number;
} {
  if (content.loading || content.error) return {};
  const items = content.groups.flatMap((g) =>
    g.items.map((item) => ({
      token: item.token,
      id: item.entityId,
      title: item.title,
      group: g.group,
      href: item.href,
    })),
  );
  return { study_content: items, study_content_count: content.totalCount };
}

function rosterScope(roster: UseClassRosterReturn) {
  if (roster.loading || roster.error) return {};
  return {
    roster: roster.members.map((m) => ({
      user_id: m.userId,
      name: m.email ?? m.displayName ?? m.userId,
      role: m.role,
      status: m.status,
    })),
  };
}

function accessCounts(access: UseClassAccessReturn, includePending: boolean) {
  const state = access.state;
  if (!state) return {};
  return {
    member_count: state.memberCount,
    ...(includePending && state.pendingCount != null
      ? { pending_count: state.pendingCount }
      : {}),
  };
}

export function buildClassHubOwnerScope(input: {
  classParam: string;
  cls: StudyClass;
  access: UseClassAccessReturn;
  roster: UseClassRosterReturn;
  assignments: UseClassAssignmentsReturn;
  progress: UseClassProgressOverviewReturn;
  content: UseClassContentReturn;
}): SurfaceScopePayload {
  const { cls, access, roster, assignments, progress, content } = input;
  const today = todayIso();
  const titleOf = new Map(
    assignments.assignments.map((a) => [`${a.token}:${a.resourceId}`, a.title]),
  );
  const assignmentsReady = !assignments.loading && !assignments.error;
  const progressReady = !progress.loading && !progress.error && progress.overview;

  return createEducationClassScope({
    view: "owner",
    class_param: input.classParam,
    my_status: access.state?.myStatus ?? null,
    class_id: cls.id,
    class_slug: cls.slug,
    class_name: cls.name,
    class_description: cls.description,
    class_settings: {
      teacher: cls.settings.teacher ?? null,
      term: cls.settings.term ?? null,
      period: cls.settings.period ?? null,
      access_mode: cls.settings.accessMode,
      price_cents: cls.settings.priceCents ?? null,
    },
    access_mode: cls.settings.accessMode,
    exam_dates: cls.settings.examDates.map((e) => ({
      title: e.title,
      date: e.date,
      days_until: daysUntil(e.date, today),
    })),
    ...accessCounts(access, true),
    ...rosterScope(roster),
    ...(assignmentsReady
      ? {
          assignments: assignments.assignments.map((a) => ({
            token: a.token,
            id: a.resourceId,
            title: a.title,
            due_date: a.dueDate,
            href: a.href,
          })),
        }
      : {}),
    ...(progressReady && progress.overview
      ? {
          class_progress: progress.overview.students.map((s) => ({
            student: s.name ?? s.email ?? s.userId,
            completed: s.cells.filter((c) => c.status === "completed").length,
            in_progress: s.cells.filter((c) => c.status === "in_progress").length,
            not_started: s.cells.filter((c) => c.status === "not_started").length,
            cells: s.cells.map((c) => ({
              title: titleOf.get(`${c.token}:${c.resourceId}`) ?? c.resourceId,
              status: c.status,
              score_pct: c.scorePct,
            })),
          })),
        }
      : {}),
    ...contentScope(content),
  });
}

export function buildClassHubMemberScope(input: {
  classParam: string;
  access: UseClassAccessReturn;
  /** The resolved access state (the member view renders only once it is). */
  state: ClassAccessState;
  roster: UseClassRosterReturn | null;
  assignments: UseClassAssignmentsReturn | null;
  myProgress: UseMyClassProgressReturn | null;
  content: UseClassContentReturn;
}): SurfaceScopePayload {
  const { state } = input;
  const isActive = state.myStatus === "active";
  const { assignments, myProgress } = input;
  const myReady =
    isActive &&
    assignments &&
    myProgress &&
    !assignments.loading &&
    !assignments.error &&
    !myProgress.loading;
  const progressByKey = new Map(
    (myProgress?.progress ?? []).map((p) => [`${p.token}:${p.resourceId}`, p]),
  );

  return createEducationClassScope({
    view: "member",
    class_param: input.classParam,
    my_status: state.myStatus,
    class_id: state.classId,
    class_slug: state.slug,
    class_name: state.name,
    class_description: state.description,
    access_mode: state.accessMode,
    ...accessCounts(input.access, false),
    ...(isActive && input.roster ? rosterScope(input.roster) : {}),
    ...(myReady && assignments
      ? {
          my_assignments: assignments.assignments.map((a) => {
            const p = progressByKey.get(`${a.token}:${a.resourceId}`);
            return {
              title: a.title,
              token: a.token,
              id: a.resourceId,
              due_date: a.dueDate,
              status: p?.status ?? "not_started",
              score_pct: p?.scorePct ?? null,
            };
          }),
        }
      : {}),
    ...(isActive ? contentScope(input.content) : {}),
  });
}
