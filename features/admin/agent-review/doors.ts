// THE DOOR LAW for agent review rows (common-docs/policies/no-dead-ends.md).
//
// The row's own page is the link every agent owes Arman (the
// `agent-review-queue` skill, THE DIRECT-LINK RULE). It used to be declared
// inside `components/AgentReviewQueueTable.tsx`, so anything else that needed
// the path had to import a 700-line client table to get a template string.
// Declared once here so no surface hand-writes the route.

/** The queue list route. */
export const AGENT_REVIEW_QUEUE_ROUTE = "/administration/users/agent-review";

/** Canonical link to ONE review row. */
export function reviewItemPath(id: string): string {
  return `${AGENT_REVIEW_QUEUE_ROUTE}/${id}`;
}
