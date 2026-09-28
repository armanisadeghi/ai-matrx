/**
 * Surface manifest — Class Hub (`matrx-user/education-class`).
 *
 * One class at /education/classes/[classId] (the param is the class scope id
 * or its slug). Before this manifest existed the route fell through the
 * `/education` prefix to the generic education hub surface, so an agent helping
 * here could not see the class, its roster, its assignments or its study
 * content (fleet wave, 2026-09-27).
 *
 * The page serves TWO people, so `view` is read first:
 *   owner   — the full hub: class details, exam dates, roster (with emails,
 *             requests), assignments, class progress grid, study content.
 *   member  — a joined student: class details, their status, the active
 *             roster (display names only — peer emails are nulled server-side),
 *             their own assignments + progress, study content.
 *   loading / needs_workspace / unavailable — no class data yet.
 *
 * Write half — only what the page itself already does, through the same hooks
 * (`features/education/classes/hooks/*`); every target is OWNER-only and
 * `ask`:
 *   update_class        — the Edit dialog (+ Archive): useClasses().updateClass
 *                         (+ setAccessMode when access changes, as My Classes).
 *   attach_content      — Add study content: useClassContent().attach.
 *   detach_content      — the picker's remove: useClassContent().detach.
 *   assign_resources    — Assign a deck/quiz (and change a due date):
 *                         useClassAssignments().assign.
 *   unassign_resources  — Remove assignment: useClassAssignments().unassign.
 * Validation is pure (`features/education/classes/classHubAgentWrites.ts`) and
 * runs as `validate`, before the approval card; a bad list writes nothing.
 *
 * Emitter: `features/education/classes/components/ClassHubView.tsx` via
 * `features/education/classes/classHubSurfaceScope.ts`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const EDUCATION_CLASS_SURFACE_NAME = "matrx-user/education-class";

const groups: SurfaceValueGroup[] = [
  {
    key: "class_view",
    label: "Class view",
    sortOrder: 100,
    description:
      "Who is looking (owner or member) and whether the class loaded — read first; it decides which other groups are populated.",
  },
  {
    key: "class_details",
    label: "Class details",
    sortOrder: 200,
    description:
      "The class itself: name, description, teacher/term/period, access mode, price and exam dates.",
  },
  {
    key: "roster",
    label: "Members",
    sortOrder: 300,
    description: "Who is in the class and each person's role and status.",
  },
  {
    key: "assignments",
    label: "Assignments",
    sortOrder: 400,
    description:
      "Decks and quizzes assigned to the whole class, with due dates, and how students are doing on them.",
  },
  {
    key: "study_content",
    label: "Study content",
    sortOrder: 500,
    description:
      "Everything tagged to the class: decks, quizzes, study media, notes and files.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Class view ─────────────────────────────────────────────────────────
  {
    name: "view",
    label: "Hub view",
    description:
      '"owner" (the person owns the class — full, editable hub), "member" (they joined someone else\'s class), "loading", "needs_workspace" (they own it but no workspace is selected, so it cannot be managed yet) or "unavailable" (not found, deleted, or no access). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 100,
    group: "class_view",
  },
  {
    name: "class_param",
    label: "Class in the address",
    description:
      "The class id or slug from the page address (/education/classes/<this>). Always present, even before the class loads.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 110,
    group: "class_view",
  },
  {
    name: "my_status",
    label: "My membership",
    description:
      'The person\'s own status on the class: "active", "pending" (asked to join, awaiting the owner) or "entitled" (purchased, not yet enrolled); null for the owner of a personal class. Present in the owner and member views.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 120,
    group: "class_view",
  },

  // ── Class details ──────────────────────────────────────────────────────
  {
    name: "class_id",
    label: "Class id",
    description:
      "UUID of the class (its scope id). Present in the owner and member views.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 200,
    group: "class_details",
  },
  {
    name: "class_slug",
    label: "Class slug",
    description:
      "The class's short address name, when it has one. Present in the owner and member views.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 205,
    group: "class_details",
  },
  {
    name: "class_name",
    label: "Class name",
    description:
      "The class's name, as in the page title. Present in the owner and member views.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 210,
    group: "class_details",
  },
  {
    name: "class_description",
    label: "Class description",
    description:
      "The class's description; an empty string when it has none. Present in the owner and member views.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 220,
    group: "class_details",
  },
  {
    name: "class_settings",
    label: "Class settings",
    description:
      "The owner's class settings as { teacher, term, period, access_mode, price_cents } — access_mode is \"open\", \"closed\" or \"paid\"; price_cents is set only for paid classes. Owner view only.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 230,
    group: "class_details",
  },
  {
    name: "access_mode",
    label: "Access mode",
    description:
      '"open" (anyone can join), "closed" (invite or request, owner approves) or "paid" (purchase to enroll). Present in the owner and member views.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 240,
    group: "class_details",
  },
  {
    name: "exam_dates",
    label: "Exam dates",
    description:
      "The class's exam dates as { title, date (YYYY-MM-DD), days_until } — days_until is negative for a past exam. Empty array when none. Owner view only (members do not see exam dates on this page).",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 250,
    group: "class_details",
  },
  {
    name: "member_count",
    label: "Member count",
    description:
      "How many people are on the class roster, from the class access read. Absent until that read resolves.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 260,
    group: "class_details",
  },
  {
    name: "pending_count",
    label: "Pending requests",
    description:
      "How many join requests await the owner's approval. Owner view only; absent until the class access read resolves.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 270,
    group: "class_details",
  },

  // ── Roster ─────────────────────────────────────────────────────────────
  {
    name: "roster",
    label: "Roster",
    description:
      'Every person on the roster as { user_id, name, role ("owner" | "member"), status ("active" | "pending" | "entitled") }. The owner sees everyone including pending requests, and name is their email; a member sees active members only, by display name. Absent while the roster loads or when it failed to load; an empty array when nobody is on it.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 300,
    group: "roster",
  },

  // ── Assignments ────────────────────────────────────────────────────────
  {
    name: "assignments",
    label: "Class assignments",
    description:
      'The decks and quizzes assigned to the whole class, as { token ("fc_set" deck | "assessment" quiz/test), id, title, due_date (YYYY-MM-DD or null), href }. Use token + id with unassign_resources, or with assign_resources to change a due date. Owner view only; absent while loading or when the read failed; an empty array when nothing is assigned.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 400,
    group: "assignments",
  },
  {
    name: "class_progress",
    label: "Class progress",
    description:
      'The owner\'s progress grid: one row per student as { student, completed, in_progress, not_started, cells: [{ title, status ("not_started" | "in_progress" | "completed"), score_pct }] }, cells in assignment order. Owner view only; absent while loading or when the read failed; an empty array when there are no students.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 410,
    group: "assignments",
  },
  {
    name: "my_assignments",
    label: "Assigned to me",
    description:
      "A member's own assignments in this class as { title, token, id, due_date, status, score_pct } — what the Assigned to you panel shows. Member view (active members) only; absent while loading.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 420,
    group: "assignments",
  },

  // ── Study content ──────────────────────────────────────────────────────
  {
    name: "study_content",
    label: "Class study content",
    description:
      'Everything tagged to the class (assignments excluded), as { token ("fc_set" | "assessment" | "study_media" | "note" | "file"), id, title, group, href }, grouped as on the page. Use token + id with detach_content. Absent while loading, when the read failed, or for a member who is not active yet; an empty array when nothing is tagged.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 500,
    group: "study_content",
  },
  {
    name: "study_content_count",
    label: "Study content count",
    description:
      "How many items are tagged to the class. Absent exactly when study_content is absent.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 510,
    group: "study_content",
  },
];

const ITEM_LIST =
  'a JSON ARRAY (not a string) of 1-25 objects, each { token, id } — token names the kind of record and id is its UUID';

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "update_class",
    label: "Update this class",
    description:
      'Changes THIS class, saved immediately — exactly what the Edit dialog (and the Archive button) does. Value is a JSON OBJECT (not a string, not an array) with any of: { name?: string, description?: string, teacher?: string, term?: string, period?: string, access_mode?: "open" | "closed" | "paid", price?: number (US dollars, at least 1; needed when making the class paid unless it already has a price), exam_dates?: [{ title: string, date: "YYYY-MM-DD" }], archived?: boolean }. Only the fields you send change; send "" to clear a text field. exam_dates REPLACES the whole exam list (send every exam to keep). archived: true moves the class out of My Classes into Archived classes (nothing is lost; it can be restored). Owner view only; refused on a member view.',
    valueType: "object",
    updatesValue: "class_settings",
    mode: "entity",
    applyPolicy: "ask",
    group: "class_details",
    sortOrder: 200,
  },
  {
    name: "attach_content",
    label: "Add study content",
    description: `Tags existing records to this class so they show under Study content — what Add content does. Value is ${ITEM_LIST}; token is one of "fc_set" (flashcard deck), "assessment" (quiz or practice test), "study_media" (summary, mind map, audio…), "note", "file". The records themselves are not changed or copied. An item already in study_content, a bad token or id, or the same item twice refuses the whole list. Owner view only.`,
    valueType: "array",
    updatesValue: "study_content",
    mode: "entity",
    applyPolicy: "ask",
    group: "study_content",
    sortOrder: 500,
  },
  {
    name: "detach_content",
    label: "Remove study content",
    description: `Untags records from this class — they leave Study content; the records themselves are NOT deleted. Value is ${ITEM_LIST}, each taken from study_content. An item that is not in study_content refuses the whole list. Owner view only.`,
    valueType: "array",
    updatesValue: "study_content",
    mode: "entity",
    applyPolicy: "ask",
    group: "study_content",
    sortOrder: 510,
  },
  {
    name: "assign_resources",
    label: "Assign to the class",
    description:
      'Assigns decks or quizzes to every student in the class — what Assign does — or changes the due date of one already assigned. Value is a JSON ARRAY (not a string) of 1-25 objects, each { token: "fc_set" (deck) | "assessment" (quiz / practice test), id: string (UUID), due_date?: "YYYY-MM-DD" | null }. Re-sending an assigned item with a new due_date updates the date; null clears it. A bad token, id or date, or the same item twice, refuses the whole list. Owner view only.',
    valueType: "array",
    updatesValue: "assignments",
    mode: "entity",
    applyPolicy: "ask",
    group: "assignments",
    sortOrder: 400,
  },
  {
    name: "unassign_resources",
    label: "Remove assignments",
    description:
      "Removes assignments from the class — what Remove assignment does. The deck or quiz itself and everyone's study history are untouched. Value is a JSON ARRAY (not a string) of 1-25 { token, id } objects taken from assignments. An item that is not assigned refuses the whole list. Owner view only.",
    valueType: "array",
    updatesValue: "assignments",
    mode: "entity",
    applyPolicy: "ask",
    group: "assignments",
    sortOrder: 410,
  },
];

export const educationClassManifest: SurfaceManifest = {
  surfaceName: EDUCATION_CLASS_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "One class: details, exam dates, roster, assignments, class progress and study content; edit the class, tag content, assign decks and quizzes (/education/classes/[classId]).",
  readiness: "partial",
  readinessNote:
    "Manifest, emitter and five write targets wired 2026-09-27 for the owner and member views. Not yet stamped verified: no data-surface-value Locate anchors; no canonical v3 context menu on the hub; write targets name no valueKind (validated by hand in classHubAgentWrites.ts); member view proven only by code, not a live member account.",
  label: "Class Hub",
  urlPattern: "/education/classes/[classId]",
  intro: `<surface_intro>
You are on one class's hub at /education/classes/<id>. A class gathers one course's material: its details and exam dates, the people on its roster, decks and quizzes assigned to every student, and study content tagged to it.

Read \`view\` first. "owner" is the person's own class — everything is present and editable. "member" is a class they joined: they see the class, the active roster, their own assignments (my_assignments) and the study content, and cannot change anything. "loading", "needs_workspace" and "unavailable" carry no class data yet.

For the owner, change the class only through these targets (each takes a JSON value, never a string):
- update_class — fix details, access, price or exam dates, or archive (archived: true). Only the fields you send change.
- attach_content / detach_content — tag or untag existing records as study content, by { token, id }.
- assign_resources / unassign_resources — assign decks (fc_set) or quizzes (assessment) to every student, or change a due date.
Never change the class with generic scope, tag or association tools: they skip the class's own rules.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

export type ClassHubView =
  | "owner"
  | "member"
  | "loading"
  | "needs_workspace"
  | "unavailable";

export interface ClassHubRosterEntry {
  user_id: string;
  name: string;
  role: string;
  status: string;
}

export interface ClassHubAssignmentEntry {
  token: string;
  id: string;
  title: string;
  due_date: string | null;
  href: string | null;
}

export interface ClassHubProgressRow {
  student: string;
  completed: number;
  in_progress: number;
  not_started: number;
  cells: { title: string; status: string; score_pct: number | null }[];
}

export interface ClassHubMyAssignment {
  title: string;
  token: string;
  id: string;
  due_date: string | null;
  status: string;
  score_pct: number | null;
}

export interface ClassHubContentEntry {
  token: string;
  id: string;
  title: string;
  group: string;
  href: string | null;
}

/**
 * Type-safe payload helper. Required keys mirror `alwaysAvailable: true`;
 * optional keys mirror `alwaysAvailable: false`.
 */
export function createEducationClassScope(values: {
  view: ClassHubView;
  class_param: string;
  selection?: string;
  context?: Record<string, unknown>;
  my_status?: string | null;
  class_id?: string;
  class_slug?: string | null;
  class_name?: string;
  class_description?: string;
  class_settings?: {
    teacher: string | null;
    term: string | null;
    period: string | null;
    access_mode: string;
    price_cents: number | null;
  };
  access_mode?: string;
  exam_dates?: { title: string; date: string; days_until: number }[];
  member_count?: number;
  pending_count?: number;
  roster?: ClassHubRosterEntry[];
  assignments?: ClassHubAssignmentEntry[];
  class_progress?: ClassHubProgressRow[];
  my_assignments?: ClassHubMyAssignment[];
  study_content?: ClassHubContentEntry[];
  study_content_count?: number;
}): SurfaceScopePayload {
  return values as unknown as SurfaceScopePayload;
}
