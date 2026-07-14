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
