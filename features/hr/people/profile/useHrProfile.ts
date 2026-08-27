"use client";

// features/hr/people/profile/useHrProfile.ts
//
// Routes 13/14's read. `hr_employee_profile` answers THREE questions in one call
// and the surface must not second-guess any of them:
//
//   • WHICH TABS. `profile.tabs` is authoritative. Render exactly those, in that
//     order. Never intersect it with a client-side guess, never add a tab back,
//     never filter one out — the server already omitted every tab whose fields
//     are all inaccessible, which is what makes §4.2 mechanical instead of
//     remembered.
//   • WHICH FIELDS. `profile.personal` carries ONLY the keys this viewer may
//     see. A missing key is "no access"; a present-but-null key is "nobody filled
//     it in". Those are different facts, so this hook never normalizes the object
//     into a fully-populated shape.
//   • WHAT MACHINERY EXISTS. `worker_class_machinery` says whether I-9, W-4, PTO,
//     overtime and payroll apply at all. `false` means ABSENT, never disabled.
//
// 🚨 `{granted:false, reason:'not_reachable'}` DOES NOT DISTINGUISH "does not
// exist" from "you may not see it", and nothing here may recover the difference.
// That is the leak the envelope exists to prevent.

import {
  fetchHrEmployeeProfile,
  fetchHrEmploymentHistory,
} from "../../service";
import type {
  HrDenied,
  HrEmployeeProfile,
  HrEmploymentHistory,
  HrFailed,
} from "../../types";
import { useHrRequest } from "../shared/useHrRequest";

export type HrProfileState = {
  profile: HrEmployeeProfile | null;
  isLoading: boolean;
  /** A refusal. Render the no-access state — never an empty profile. */
  denied: HrDenied | null;
  error: HrFailed | null;
  refresh: () => void;
};

type ProfileRequest = { employeeId: string; asOf: string | null };

/** Module-level, so the read hook's dependency array holds a stable reference. */
function runProfile(args: ProfileRequest) {
  return fetchHrEmployeeProfile(args);
}

export function useHrProfile(args: {
  employeeId: string | null;
  asOf?: string | null;
}): HrProfileState {
  const { employeeId, asOf = null } = args;

  const request =
    employeeId === null
      ? null
      : JSON.stringify({ employeeId, asOf } satisfies ProfileRequest);

  const state = useHrRequest<ProfileRequest, HrEmployeeProfile>(
    request,
    runProfile,
  );

  return {
    profile: state.data,
    isLoading: state.isLoading,
    denied: state.denied,
    error: state.error,
    refresh: state.refresh,
  };
}

// ── The Job tab's second read ───────────────────────────────────────────────

export type HrHistoryState = {
  history: HrEmploymentHistory | null;
  isLoading: boolean;
  denied: HrDenied | null;
  error: HrFailed | null;
  refresh: () => void;
};

/**
 * Deliberately a SEPARATE call from the profile: the Job tab is one of twelve,
 * and loading every spell, assignment, reporting line, external id and
 * engagement for a viewer who opened Personal would be a per-visit cost paid by
 * everyone for one tab.
 */
function runHistory(args: { employeeId: string }) {
  return fetchHrEmploymentHistory(args.employeeId);
}

export function useHrEmploymentHistory(employeeId: string | null): HrHistoryState {
  const request =
    employeeId === null ? null : JSON.stringify({ employeeId });

  const state = useHrRequest<{ employeeId: string }, HrEmploymentHistory>(
    request,
    runHistory,
  );

  return {
    history: state.data,
    isLoading: state.isLoading,
    denied: state.denied,
    error: state.error,
    refresh: state.refresh,
  };
}

// ── Reading the loosely-typed halves of the history payload ─────────────────
//
// `hr_employment_history` returns jsonb arrays the generated types cannot
// describe. These readers are the ONE place a value is coerced, so a shape
// surprise shows up here rather than as `undefined` in the middle of a render.

export function readString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

export function readNumber(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function readBoolean(row: Record<string, unknown>, key: string): boolean {
  return row[key] === true;
}

/**
 * §6.4's actor taxonomy. "Changed by user" is insufficient; the row must say
 * WHICH KIND of actor, because "the integration did it" and "your manager did
 * it" are different answers to the same question.
 */
export type HrActorKind =
  | "employee"
  | "manager"
  | "hr_admin"
  | "integration"
  | "automation"
  | "ai_agent";

const ACTOR_WORDS: Record<HrActorKind, string> = {
  employee: "the employee",
  manager: "their manager",
  hr_admin: "HR",
  integration: "a connected system",
  automation: "an automated rule",
  ai_agent: "an AI agent",
};

export function actorKindOf(row: Record<string, unknown>): HrActorKind | null {
  const raw = readString(row, "recorded_by_actor_type") ?? readString(row, "actor_type");
  if (!raw) return null;
  return raw in ACTOR_WORDS ? (raw as HrActorKind) : null;
}

export function actorKindWords(kind: HrActorKind | null): string | null {
  return kind ? ACTOR_WORDS[kind] : null;
}
