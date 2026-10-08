// Lane HR-360 (2026-10-08) — Share with both / Schedule meeting are the HR manager's controls.
// Red before: no seat check, so a respondent saw both buttons once both halves were in.
import { isReviewHrManager } from "../seat";

const HR = "87a6e699-3622-4869-8843-d0867456c0dd";
const EMPLOYEE = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";

it("the HR manager named on the review gets the controls", () => {
  expect(isReviewHrManager({ hr_manager_login: HR }, HR)).toBe(true);
});
it("a respondent never does", () => {
  expect(isReviewHrManager({ hr_manager_login: HR }, EMPLOYEE)).toBe(false);
});
it("a review that names no HR login, or a signed-out viewer, gets none", () => {
  expect(isReviewHrManager({}, HR)).toBe(false);
  expect(isReviewHrManager({ hr_manager_login: HR }, null)).toBe(false);
});
