// features/employee-performance-reviews/standard/messages.ts
//
// EVERY REFUSAL A REVIEW DOOR CAN ANSWER, SAID IN WORDS. A door answers `{ ok:false, reason }`;
// nothing in the standard review shows a bare code or swallows one. Pure, so it is testable.

import type { AnswerProblem } from "./types";

const REFUSALS: Record<string, string> = {
  no_caller: "Your session has ended. Sign in again to continue.",
  not_permitted: "You do not have permission to do that for this employer.",
  not_reachable: "This review is not available to you.",
  cycle_not_open: "This review cycle is closed, so the review can no longer change.",
  review_cancelled: "This review was cancelled.",
  review_shared: "This review has already been shared with the employee.",
  not_respondent: "You are not the person who writes this part of the review.",
  already_submitted: "This part was already submitted. Ask HR or the manager to reopen the review to change it.",
  version_conflict: "This was changed somewhere else since you opened it. Reload to see the latest, then continue.",
  nothing_saved: "Nothing has been saved yet. Fill in the form first.",
  peer_reviews_not_open: "Peer reviews are not open yet.",
  not_the_manager: "Only the employee's manager can do that.",
  not_both_submitted: "Both the self review and the manager review must be submitted first.",
  overall_rating_missing: "Choose an overall rating before sharing.",
  not_the_employee: "Only the employee can do that.",
  comment_is_the_employees_own: "Only the employee can write the acknowledgment comment.",
  not_shared: "This review has not been shared with the employee yet.",
  no_acknowledgement_step: "This review has no acknowledgment step to complete.",
  already_cancelled: "This review is already cancelled.",
  already_acknowledged: "This review was already acknowledged.",
  review_closed_to_reassignment: "The manager can no longer be changed on this review.",
  manager_not_active: "That manager is not an active employee.",
  manager_is_the_employee: "An employee cannot be their own manager.",
  already_the_manager: "That person is already the manager on this review.",
  manager_already_submitted: "The manager already submitted, so the manager cannot be changed.",
  not_in_organization: "That person does not work for this employer.",
  nobody_to_review: "No one matched. Pick a team, a department or named people.",
  calibration_required: "HR has to record a calibrated rating before this review can be shared. Ask HR to calibrate it.",
  comment_not_enabled: "This employer has turned acknowledgment comments off. Acknowledge without a comment.",
  template_invalid: "This template has problems. They are marked below.",
  review_closed_to_peers: "Peer feedback can no longer be requested on this review.",
  not_performance_review_answers: "The answers could not be read. Reload the review and try again.",
};

const VALIDATION_FIELDS: Record<string, string> = {
  name: "Give the cycle a name.",
  dates: "Fill in the self, manager and share due dates.",
  period: "Fill in the review period.",
  period_end: "The period must end after it starts.",
  template_id: "That template is not available for this employer.",
  population: "Pick a team, a department or named people to review.",
  role: "That review part does not exist.",
  answers: "The answers could not be saved. Reload the review and try again.",
  rating: "That is not a rating on this review's scale.",
  reason: "Say why. A reason is required.",
  employment_id: "Choose whose goal this is.",
  title: "Give the goal a title.",
  status: "Pick a status for the goal.",
  values: "A number or date in the goal is not valid.",
  progress: "Progress must be between 0 and 100.",
  due_on: "The due date cannot be before the start date.",
  parent_goal_id: "That goal cannot be aligned under this one.",
  cycle_id: "That review cycle is not available.",
  approve: "Choose approve or decline.",
};

export interface Refusal {
  reason: string;
  field?: string | null;
  detail?: string | null;
}

/** The sentence for a refused door. Unknown reasons are still said, with the reason named. */
export function refusalMessage(r: Refusal): string {
  if (r.reason === "validation") {
    if (r.detail === "alignment_loop") return "That would make the goal support itself. Pick a goal that is not below this one.";
    return (r.field && VALIDATION_FIELDS[r.field]) || r.detail || "Something in what you entered is not valid.";
  }
  return REFUSALS[r.reason] ?? `The server refused this (${r.reason}).`;
}

const LAUNCH_REFUSALS: Record<string, string> = {
  no_manager: "has no manager on record, so there is no one to review them. Set a manager on their HR profile.",
  terminated: "has left the company.",
  not_active: "is not an active employee right now.",
  manager_not_active: "reports to a manager who is not active. Update their manager on their HR profile.",
  already_in_cycle: "is already in this cycle.",
  not_in_organization: "does not work for this employer.",
};

/** One launch refusal, by name: "Priya Raman has no manager on record…". */
export function launchRefusalMessage(name: string | null, reason: string): string {
  const who = name ?? "This person";
  return `${who} ${LAUNCH_REFUSALS[reason] ?? `could not be added (${reason}).`}`;
}

/** One `answers_incomplete` problem, naming the question. `labelOf` maps a question key to its label. */
export function problemMessage(p: AnswerProblem, labelOf: (key: string) => string): string {
  const q = p.question ? labelOf(p.question) : "The form";
  switch (p.problem) {
    case "too_few":
      return `${q}: add at least ${p.minItems ?? 1} (you have ${p.have ?? 0}).`;
    case "too_many":
      return `${q}: keep it to ${p.maxItems ?? 0} at most (you have ${p.have ?? 0}).`;
    case "unrated":
      return `${q}: choose a rating.`;
    case "out_of_scale":
      return `${q}: that rating is not on the scale.`;
    case "missing":
      return `${q}: this cannot be left empty.`;
    case "not_performance_review_answers":
      return "The answers could not be read. Reload the review and try again.";
    default:
      return `${q}: ${p.problem}.`;
  }
}

const TEMPLATE_PROBLEMS: Record<string, string> = {
  empty: "Add at least one section.",
  section_kind: "This section is not valid. Remove it and add it again.",
  key_and_title_required: "Every section needs a title.",
  no_questions: "This section has no questions. Add one or remove the section.",
  question_kind: "This question is not valid. Remove it and add it again.",
  question_key_and_label_required: "Every question needs a label.",
  duplicate_question_key: "Two questions share the same name. Give each its own label.",
  question_type: "Pick a question type.",
  min_items: "The minimum number of items must be zero or more.",
  max_items: "The maximum must be at least one and no smaller than the minimum.",
  no_rating_items: "A rating question needs at least one item to rate.",
  rating_item: "Every item to rate needs a label.",
  scale_needs_two_points: "The rating scale needs at least two points.",
  point_needs_value_key_label: "Every rating point needs a number and a label.",
  duplicate_point_value: "Two rating points share the same number.",
};

/** One template problem (`{ at, problem }`) said in words; never the bare code. */
export function templateProblemMessage(problem: string): string {
  return TEMPLATE_PROBLEMS[problem] ?? `This part is not valid (${problem}).`;
}

const PEER_REFUSALS: Record<string, string> = {
  is_a_party: "is already part of this review and cannot also be a peer.",
  not_active: "is not an active employee right now.",
  peer_has_no_login: "has no sign-in yet, so they cannot be asked.",
  already_nominated: "was already nominated.",
  not_in_organization: "does not work for this employer.",
};

/** One refused peer nomination, by name: "Marcus Webb has no sign-in yet…". */
export function peerRefusalMessage(name: string | null, reason: string): string {
  return `${name ?? "This person"} ${PEER_REFUSALS[reason] ?? `could not be nominated (${reason}).`}`;
}
