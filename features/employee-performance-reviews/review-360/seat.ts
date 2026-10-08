// Who is looking at a 360 review (lane HR-360). Sharing and scheduling the meeting are the HR
// manager's acts; a respondent (the employee or the manager) never sees those controls, even once
// both halves are in and shared to them. The review row names the HR manager's login.

export function isReviewHrManager(doc: Record<string, unknown>, userId: string | null): boolean {
  return Boolean(userId) && typeof doc.hr_manager_login === "string" && doc.hr_manager_login === userId;
}
