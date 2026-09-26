/**
 * Surface manifest — My Classes (`matrx-user/education-classes`).
 *
 * The /education/classes list: the classes the person owns (each a scope of
 * the org's "Class" scope type), the classes they joined, and the New class
 * dialog. Class HUB pages (/education/classes/[id]) are not this surface.
 *
 * Why it exists (2026-09-26 live test): with no surface here, an agent could
 * fill only the dialog's plain text fields (through the platform
 * `window_form_fields` net) — never its access-mode buttons or exam-date rows —
 * and when asked to "just add them" it reached for the generic scope tools,
 * which created classes with EMPTY settings (no access mode, no join code, no
 * owner membership) and added teacher/term fields to the Class TYPE itself.
 * Both targets below go through the page's own canonical path instead
 * (`useClasses().createClass` — the one the Create button calls).
 *
 * Write half: TWO targets, both `ask`.
 *  - `new_class_draft` (draft) opens the New class dialog and fills EVERY
 *    field, access mode, price and exam dates included. Nothing is saved; the
 *    person presses Create.
 *  - `create_classes` (entity) creates a LIST of classes in one approval —
 *    one class is a list of one. Every entry is validated before the first is
 *    created, so a bad entry creates nothing.
 * Editing, archiving and deleting a class live on its hub page and stay out of
 * this surface.
 *
 * Emitter: `features/education/classes/components/ClassesHome.tsx` (provider +
 * handlers); `ClassFormDialog` publishes its live draft through a callback into
 * a ref, so `getScope` stays synchronous (it is polled every 400ms).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const EDUCATION_CLASSES_SURFACE_NAME = "matrx-user/education-classes";

const groups: SurfaceValueGroup[] = [
  {
    key: "classes",
    label: "Classes",
    sortOrder: 100,
    description:
      "The classes the person owns and the classes they joined, as listed on the page.",
  },
  {
    key: "new_class",
    label: "New class",
    sortOrder: 200,
    description: "The New class dialog: whether it is open and what it holds.",
  },
];

const CLASS_SHAPE =
  "{ id, slug, name, description, teacher, term, period, access_mode, price_cents, exam_dates: [{ title, date }] }";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "organization_state",
    label: "Workspace state",
    description:
      'Whether a workspace (organization) is selected, which owned classes live in: "ready", or the reason the list cannot load (for example "required" when none is chosen). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 100,
    group: "classes",
  },
  {
    name: "owned_classes",
    label: "My classes",
    description: `The active (not archived) classes the person owns, name-ordered, as ${CLASS_SHAPE}. access_mode is "open", "closed" or "paid"; price_cents is set only for paid classes. Absent while loading or when no workspace is selected; an empty array when they own none.`,
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 110,
    group: "classes",
  },
  {
    name: "owned_class_count",
    label: "Class count",
    description:
      "How many active classes the person owns. Absent exactly when owned_classes is absent.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 120,
    group: "classes",
  },
  {
    name: "archived_class_count",
    label: "Archived classes",
    description:
      "How many of the person's classes are archived (hidden from the list). Absent exactly when owned_classes is absent.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 130,
    group: "classes",
  },
  {
    name: "joined_classes",
    label: "Joined classes",
    description:
      'Classes someone else owns that the person joined or asked to join, as { id, slug, name, access_mode, my_status } — my_status is "active", "pending" (awaiting the owner) or "entitled" (purchased, not yet enrolled). Absent while loading; an empty array when there are none.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 140,
    group: "classes",
  },
  {
    name: "class_dialog_open",
    label: "New class dialog open",
    description: "Whether the New class dialog is open. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 200,
    group: "new_class",
  },
  {
    name: "new_class_draft",
    label: "New class draft",
    description:
      "The New class dialog's live values as { name, description, teacher, term, period, access_mode, price, exam_dates: [{ title, date }] } — price is in dollars as typed. The read twin of the new_class_draft write target. Absent while the dialog is closed.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 210,
    group: "new_class",
  },
];

const CLASS_FIELDS =
  'name: string (plain text, e.g. "AP Biology"; required when creating), description?: string, teacher?: string, term?: string (e.g. "Fall 2026"), period?: string (e.g. "3"), access_mode?: "open" | "closed" | "paid" (default "closed" — a private class; "open" is publicly listed and anyone can join; "paid" needs price), price?: number (US dollars, at least 1; required when access_mode is "paid", not allowed otherwise), exam_dates?: [{ title: string, date: "YYYY-MM-DD" }]';

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "new_class_draft",
    label: "New class form",
    description: `Opens the New class dialog (if closed) and fills it in. NOTHING is saved — the person reviews it and presses Create class. Value is an OBJECT with any of: { ${CLASS_FIELDS} }. Only the fields you include change; exam_dates REPLACES the dialog's exam-date rows. Use this for one class the person wants to look over first; to create classes directly, use create_classes.`,
    valueType: "object",
    updatesValue: "new_class_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "new_class",
    sortOrder: 200,
  },
  {
    name: "create_classes",
    label: "Create classes",
    description: `Creates one or more classes, saved immediately, exactly as the Create class button does (access mode, join code and the person's owner membership included). Value is an ARRAY of 1-25 objects, each { ${CLASS_FIELDS} }. Every entry is checked before any is created: a missing name, a bad date, a duplicate name within the list or a name the person already has refuses the whole write with the reason, and nothing is created. This is the ONLY correct way to add classes here — never create them with generic scope or context tools, which skip the class settings.`,
    valueType: "array",
    updatesValue: "owned_classes",
    mode: "entity",
    applyPolicy: "ask",
    group: "classes",
    sortOrder: 110,
  },
];

export const educationClassesManifest: SurfaceManifest = {
  surfaceName: EDUCATION_CLASSES_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "My Classes: owned and joined classes, New class dialog, create a list of classes (/education/classes).",
  readiness: "partial",
  readinessNote:
    "Manifest, emitter and both write targets shipped 2026-09-26. Not yet stamped verified: the live agent runs (fill the dialog incl. access mode + exam dates; create a list of classes) must pass on production; neither structured target names a valueKind yet (the handlers validate by hand); no data-surface-value Locate anchors.",
  label: "My Classes",
  urlPattern: "/education/classes",
  intro: `<surface_intro>
You are on My Classes at /education/classes. A class gathers one course's study material and exam dates; owned_classes lists the person's own classes and joined_classes the ones they joined.

To add classes, use create_classes — it takes a LIST, so "add my five courses" is one write the person approves once. Each class needs only a name; set access_mode only when the person says who may join (default "closed" is a private class). To fill the New class dialog for the person to review instead, use new_class_draft. Never create classes with generic scope or context tools: they skip the class's access mode, join code and owner membership, and can change the Class type for everyone in the workspace.

If organization_state is not "ready", no workspace is selected; a create will ask the person which workspace to use.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One entry of `owned_classes`. */
export interface ClassScopeEntry {
  id: string;
  slug: string | null;
  name: string;
  description: string;
  teacher: string | null;
  term: string | null;
  period: string | null;
  access_mode: string;
  price_cents: number | null;
  exam_dates: { title: string; date: string }[];
}

/** One entry of `joined_classes`. */
export interface JoinedClassScopeEntry {
  id: string;
  slug: string | null;
  name: string;
  access_mode: string;
  my_status: string;
}

/** The dialog's live values — the `new_class_draft` read twin. */
export interface NewClassDraftScope {
  name: string;
  description: string;
  teacher: string;
  term: string;
  period: string;
  access_mode: string;
  price: string;
  exam_dates: { title: string; date: string }[];
}

/**
 * Type-safe payload helper. Required keys mirror `alwaysAvailable: true`;
 * optional keys mirror `alwaysAvailable: false`.
 */
export function createEducationClassesScope(values: {
  organization_state: string;
  class_dialog_open: boolean;
  selection?: string;
  context?: Record<string, unknown>;
  owned_classes?: ClassScopeEntry[];
  owned_class_count?: number;
  archived_class_count?: number;
  joined_classes?: JoinedClassScopeEntry[];
  new_class_draft?: NewClassDraftScope;
}): SurfaceScopePayload {
  return values as unknown as SurfaceScopePayload;
}
