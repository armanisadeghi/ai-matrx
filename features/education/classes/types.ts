// features/education/classes/types.ts
//
// A "class" is a scope (context.scopes row) under the Class scope type. These
// types are a thin, education-facing VIEW over the canonical scope + its
// settings JSONB — never a parallel data model.

import type { LucideIcon } from "lucide-react";
import type { Scope } from "@/features/agent-context/redux/scope/types";

/** One exam/assessment date on a class. Stored in scope.settings.exam_dates. */
export interface ClassExamDate {
  /** Stable client-generated id (for keys + edit/remove). */
  id: string;
  /** e.g. "Midterm", "Unit 3 Test", "Final". */
  title: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
}

/**
 * How a class is joined (Convergence C). Stored in scope.settings.access_mode;
 * enforced by the edu_class_* RPC family + context.scopes RLS.
 *   open   — publicly listed + anyone can join immediately.
 *   closed — invite / request → owner-approve; not publicly listed.
 *   paid   — join gated by a class_access grant a purchase confers.
 */
export type AccessMode = "open" | "closed" | "paid";

/** Structured, education-facing shape of a class scope's settings JSONB. */
export interface ClassSettings {
  examDates: ClassExamDate[];
  teacher?: string;
  term?: string;
  period?: string;
  /** Optional accent color override (hex). */
  color?: string;
  /** Soft-hide from the active list without deleting the scope. */
  archived?: boolean;
  /** open | closed | paid. Missing → 'closed' (private personal classes). */
  accessMode: AccessMode;
}

/** A caller's membership role on a class. */
export type ClassRole = "owner" | "member";

/**
 * A caller's membership status on a class.
 *   active   — on the roster (or the owner).
 *   pending  — requested a closed class, awaiting owner approval.
 *   entitled — holds the paid class_access grant, not yet enrolled.
 */
export type ClassStatus = "active" | "pending" | "entitled";

/** The read contract behind the Join/Request/Enroll button (edu_class_state). */
export interface ClassAccessState {
  classId: string;
  name: string;
  description: string;
  slug: string | null;
  organizationId: string;
  accessMode: AccessMode;
  isOwner: boolean;
  myRole: ClassRole | null;
  myStatus: ClassStatus | null;
  memberCount: number;
  /** Only populated for the owner. */
  pendingCount: number | null;
}

/** One row of a class roster (edu_class_roster). */
export interface ClassRosterMember {
  userId: string;
  email: string | null;
  role: ClassRole;
  status: ClassStatus;
  createdAt: string;
}

/** A class the caller owns / joined / requested (edu_my_classes). */
export interface MyClass {
  classId: string;
  name: string;
  description: string;
  slug: string | null;
  organizationId: string;
  accessMode: AccessMode;
  myRole: ClassRole;
  myStatus: ClassStatus;
  ownerId: string | null;
  settings: ClassSettings;
}

/** The outcome verbs the join/request/enroll RPCs return. */
export type ClassJoinStatus =
  | "joined"
  | "already_member"
  | "pending"
  | "needs_request"
  | "needs_purchase"
  | "left"
  | "removed"
  | "approved"
  | "not_pending"
  | "entitled"
  | "ok";

export interface ClassJoinResult {
  status: ClassJoinStatus;
  role?: ClassRole;
  accessMode?: AccessMode;
  stub?: boolean;
  userId?: string;
}

/** A class = a scope + its parsed settings. */
export interface StudyClass {
  /** The scope id — the canonical class id used in routes + associations. */
  id: string;
  /** Kebab slug (unique within the Class scope type); usable in routes. */
  slug: string | null;
  name: string;
  description: string;
  organizationId: string;
  settings: ClassSettings;
  /** The underlying scope, if a caller needs the raw row. */
  raw: Scope;
}

// ─── Assignments + class analytics (Convergence C — teacher tools) ────────────
//
// An assignment is a platform.associations edge (role='assignment') from a
// resource → the class scope, with a due date in metadata. Completion + scores
// are DERIVED from the shared study spine, never stored. See
// migrations/edu_class_assignments_analytics.sql + the edu_class_assign*/progress
// RPC family. Teacher reads are class-scoped by consent (enrolment).

/** The resource tokens a class owner can assign: a deck or a quiz/practice-test. */
export type AssignableToken = "fc_set" | "assessment";

/** One assignment on a class (an edu_class_assignments row). */
export interface ClassAssignment {
  token: string;
  resourceId: string;
  /** ISO date (YYYY-MM-DD) the assignment is due, or null for no due date. */
  dueDate: string | null;
  assignedAt: string | null;
  assignedBy: string | null;
}

/** A student's completion of ONE assigned resource, derived from the study spine. */
export type AssignmentStatus = "not_started" | "in_progress" | "completed";

export interface AssignmentProgress {
  token: string;
  resourceId: string;
  dueDate: string | null;
  status: AssignmentStatus;
  /** 0-100 accuracy/score for this resource, or null if never attempted. */
  scorePct: number | null;
  attempts: number;
  correct: number;
  lastActivity: string | null;
}

/** One student row in the class progress grid (edu_class_progress_overview). */
export interface ClassProgressStudent {
  userId: string;
  email: string | null;
  name: string | null;
  /** Per-assignment completion cells, aligned to the overview's assignments. */
  cells: AssignmentProgress[];
}

/** The owner's class progress grid: assignments (columns) × students (rows). */
export interface ClassProgressOverview {
  assignments: ClassAssignment[];
  students: ClassProgressStudent[];
}

/** One piece of study content surfaced on a class hub (a resolved edge). */
export interface ClassContentItem {
  /** The association edge id (stable key + removal handle). */
  edgeId: string;
  token: string;
  entityId: string;
  title: string;
  href: string | null;
  Icon: LucideIcon;
  /** Display group label ("Decks", "Quizzes & Tests", …). */
  group: string;
}
