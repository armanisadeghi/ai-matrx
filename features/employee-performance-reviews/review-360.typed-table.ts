// features/employee-performance-reviews/review-360.typed-table.ts — lane HR-360 (2026-10-08)
//
// THE 360 REVIEW TABLE FAMILY, declared once in code (Arman, 2026-10-08: "one of the only reasons
// we'd create a system-wide custom table"). Two Confidential typed tables per organization:
//
//   · Review — status and timestamps only, never content. Linked to the HR employee record
//     (`employee`, an entity reference) so it shows in the employee's linked records. Readers: the
//     HR manager, the employee and the manager (editor, so their own submission can stamp it).
//   · Track — one per respondent (self | manager). Its content (`document`) is read only by its
//     respondent and the HR manager; the counterpart reads it only once HR shares both
//     (`shared = true`, the store's own reader `when`). The maker of either copy is only a reader.
//
// The Confidential level is applied per organization by the server step (aidream
// `/typed-tables/confidential`), which refuses unless this declaration equals its registry entry —
// keep both in step. Every write through @ai-matrx/records refuses until the copy is Confidential.

import { defineTypedTable, f, type TypedTableConfidential } from "@ai-matrx/records/typed-table";

const APPROVAL: TypedTableConfidential["approval"] = {
  words:
    "I have an employe 360 Review system I created as a trial, which is one of the only reasons we'd " +
    "create a system-wide custom table. The meeting also then generates some confidential notes, " +
    "recordings, etc. that have to be handled with a lot of care since they're confidential",
  approvedOn: "2026-10-08",
  covers: "the employee 360 review table family (reviews and review tracks), each organization's copy",
};

const DECLARED_IN = "matrx-frontend:features/employee-performance-reviews/review-360.typed-table.ts";

export const REVIEW_STATUSES = ["collecting", "ready", "shared"] as const;
export const TRACK_KINDS = ["self", "manager"] as const;

export const review360 = defineTypedTable({
  name: "360 reviews",
  slug: "employee_360_reviews",
  scope: "organization",
  kept_for: "performance",
  owner: "lane:HR-360",
  declared_in: DECLARED_IN,
  key: "review_ref",
  fields: {
    review_ref: f.text({ label: "Review", unique: true, required: true }),
    employee: f.entityReference(["hr_employee"], { label: "Employee record" }),
    employee_name: f.text({ label: "Employee" }),
    status: f.select(REVIEW_STATUSES, { label: "Status" }),
    due_on: f.date({ label: "Due" }),
    self_submitted_at: f.datetime({ label: "Self review in" }),
    manager_submitted_at: f.datetime({ label: "Manager review in" }),
    shared_at: f.datetime({ label: "Shared" }),
    self_track: f.text({ label: "Self review track" }),
    manager_track: f.text({ label: "Manager review track" }),
    employee_user: f.member({ label: "Employee login" }),
    manager_user: f.member({ label: "Manager login" }),
    hr_manager: f.member({ label: "HR manager" }),
  },
  confidential: {
    readers: [
      { field: "hr_manager", level: "editor" },
      { field: "employee_user", level: "editor" },
      { field: "manager_user", level: "editor" },
    ],
    // true: whoever first used the copy would otherwise own (and read) every row.
    makerIsReader: true,
    approval: APPROVAL,
  },
});

export const review360Track = defineTypedTable({
  name: "360 review tracks",
  slug: "employee_360_review_tracks",
  scope: "organization",
  kept_for: "performance",
  owner: "lane:HR-360",
  declared_in: DECLARED_IN,
  fields: {
    title: f.text({ label: "Title" }),
    review_ref: f.text({ label: "Review ref", required: true }),
    track: f.select(TRACK_KINDS, { label: "Track" }),
    respondent: f.member({ label: "Respondent" }),
    hr_manager: f.member({ label: "HR manager" }),
    counterpart: f.member({ label: "Counterpart" }),
    document: f.longText({ label: "Answers" }),
    submitted_at: f.datetime({ label: "Submitted" }),
    shared: f.checkbox({ label: "Shared" }),
    link: f.url({ label: "Open" }),
  },
  confidential: {
    readers: [
      { field: "respondent", level: "editor" },
      { field: "hr_manager", level: "viewer" },
      { field: "counterpart", level: "viewer", when: { shared: true } },
    ],
    // true: whoever first used the copy would otherwise own (and read) every row.
    makerIsReader: true,
    approval: APPROVAL,
  },
});

/** The one title and notice both respondents get — it names nobody (plan rule 5). */
export const TRACK_TITLE = "Complete your review";
