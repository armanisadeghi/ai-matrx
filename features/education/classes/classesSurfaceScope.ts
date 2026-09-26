// features/education/classes/classesSurfaceScope.ts
//
// Builds the `matrx-user/education-classes` scope from what My Classes already
// holds in render state. Synchronous and fetch-free: the Surface Context window
// polls getScope every 400ms. A key is OMITTED while its data is not loaded
// and is an empty array once loaded with nothing in it.

import {
  createEducationClassesScope,
  type ClassScopeEntry,
  type JoinedClassScopeEntry,
  type NewClassDraftScope,
} from "@/features/surfaces/manifests/education-classes.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { MyClass, StudyClass } from "./types";

export function toClassScopeEntry(cls: StudyClass): ClassScopeEntry {
  return {
    id: cls.id,
    slug: cls.slug,
    name: cls.name,
    description: cls.description,
    teacher: cls.settings.teacher ?? null,
    term: cls.settings.term ?? null,
    period: cls.settings.period ?? null,
    access_mode: cls.settings.accessMode,
    price_cents: cls.settings.priceCents ?? null,
    exam_dates: cls.settings.examDates.map((e) => ({
      title: e.title,
      date: e.date,
    })),
  };
}

function toJoinedEntry(cls: MyClass): JoinedClassScopeEntry {
  return {
    id: cls.classId,
    slug: cls.slug,
    name: cls.name,
    access_mode: cls.accessMode,
    my_status: cls.myStatus,
  };
}

export function buildEducationClassesScope(input: {
  organizationState: string;
  ownedLoading: boolean;
  classes: StudyClass[];
  archived: StudyClass[];
  joinedLoading: boolean;
  joined: MyClass[];
  dialogOpen: boolean;
  draft: NewClassDraftScope | null;
}): SurfaceScopePayload {
  const ownedLoaded =
    input.organizationState === "ready" && !input.ownedLoading;
  return createEducationClassesScope({
    organization_state: input.organizationState,
    class_dialog_open: input.dialogOpen,
    ...(ownedLoaded
      ? {
          owned_classes: input.classes.map(toClassScopeEntry),
          owned_class_count: input.classes.length,
          archived_class_count: input.archived.length,
        }
      : {}),
    ...(input.joinedLoading
      ? {}
      : { joined_classes: input.joined.map(toJoinedEntry) }),
    ...(input.dialogOpen && input.draft ? { new_class_draft: input.draft } : {}),
  });
}
