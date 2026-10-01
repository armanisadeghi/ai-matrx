// features/admin/users/lib/accountSegments.ts
//
// The preset slices of the Accounts roster. Each is a fixed question an admin
// asks every day; custom slices are the table's own "+" view tabs.
//
// The default is "People" — humans who created an account and confirmed it or
// signed in. On 2026-09-30 that was about 130 of 1,456 accounts; the rest were
// idle guests, headless browsers, spam signups and our own tests. Every other
// slice carries its count on its button, so nothing is hidden without saying so.

import type { AdminUserRow } from "../types";

export const ACCOUNT_SEGMENTS = [
  { id: "people", label: "People" },
  { id: "using_ai", label: "Using AI" },
  { id: "unverified", label: "Unverified" },
  { id: "guests", label: "Guests" },
  { id: "bots_tests", label: "Bots & tests" },
  { id: "team", label: "Team" },
  { id: "all", label: "All" },
] as const;

export type AccountSegment = (typeof ACCOUNT_SEGMENTS)[number]["id"];

export const DEFAULT_ACCOUNT_SEGMENT: AccountSegment = "people";

export function isAccountSegment(value: string | null): value is AccountSegment {
  return ACCOUNT_SEGMENTS.some((segment) => segment.id === value);
}

type SegmentRow = Pick<
  AdminUserRow,
  "kind" | "is_anonymous" | "ai_requests" | "email_confirmed" | "last_sign_in_at"
>;

/** Signed up but never confirmed an email and never signed in. */
function isUnverified(row: SegmentRow): boolean {
  return !row.email_confirmed && !row.last_sign_in_at;
}

export function rowInSegment(row: SegmentRow, segment: AccountSegment): boolean {
  switch (segment) {
    case "people":
      return row.kind === "person" && !row.is_anonymous && !isUnverified(row);
    case "unverified":
      return row.kind === "person" && !row.is_anonymous && isUnverified(row);
    case "using_ai":
      return row.kind === "person" && row.ai_requests > 0;
    case "guests":
      return row.kind === "person" && row.is_anonymous;
    case "bots_tests":
      return row.kind === "bot" || row.kind === "test";
    case "team":
      return row.kind === "team";
    case "all":
      return true;
  }
}
