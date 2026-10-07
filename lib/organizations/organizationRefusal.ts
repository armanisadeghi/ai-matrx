// lib/organizations/organizationRefusal.ts
//
// THE NOT-A-MEMBER REFUSAL (active-organization plan, 2026-10-07): the server
// refused a request because the person is not a member of the organization it
// carried — they were removed from the active organization while it was active.
// The answer is to re-run the load ladder (a held organization that is no longer
// theirs is replaced, and the switch is announced), never to pick one here.

const NOT_A_MEMBER_CODES = new Set(["organization_forbidden", "organization_not_member"]);
const RECHECK_GAP_MS = 30_000;
let lastRecheckAt = 0;

/** True when an error body is the server's not-a-member refusal. */
export function isNotAMemberRefusal(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const record = body as { code?: unknown; detail?: unknown };
  if (typeof record.code === "string" && NOT_A_MEMBER_CODES.has(record.code)) return true;
  const detail = record.detail as { code?: unknown } | null | undefined;
  return (
    !!detail &&
    typeof detail === "object" &&
    typeof detail.code === "string" &&
    NOT_A_MEMBER_CODES.has(detail.code)
  );
}

/**
 * Re-run the ladder after a not-a-member refusal — at most once per
 * `RECHECK_GAP_MS`, so a burst of refused requests reads memberships once.
 * `recheck` is injected so this leaf imports no Redux.
 */
export function noticeNotAMemberRefusal(
  body: unknown,
  recheck: () => void,
  now: number = Date.now(),
): boolean {
  if (!isNotAMemberRefusal(body)) return false;
  if (now - lastRecheckAt < RECHECK_GAP_MS) return false;
  lastRecheckAt = now;
  recheck();
  return true;
}

/** Tests only. */
export function resetNotAMemberRefusalGap(): void {
  lastRecheckAt = 0;
}
