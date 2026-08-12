/**
 * Validation core for the `matrx-user/marketing-authority` write targets.
 *
 * Kept as pure functions OUTSIDE the React component on purpose: the surface
 * writeback seam (`applySurfaceWrite`) wraps `await handler(value)` in a
 * try/catch and turns a throw into the error envelope the agent reads. A throw
 * raised inside a React state updater would land asynchronously and never
 * reach that catch, so every check runs here and the component only wires them
 * up. Same reasoning as `features/administration/lib/sql-editor-write-targets`
 * and the `applications` notice core.
 *
 * THE ONE VOCABULARY: `AUTHORITY_GUIDANCE_MAX_CHARS` is imported by the
 * Textarea's `maxLength`, interpolated into the manifest's model-facing
 * description, and enforced here — so the limit the agent is told, the limit
 * the handler enforces, and the limit the control imposes cannot drift.
 */

import type { AuthorityRecommendation } from "./types";

/** Max characters of the "Optional priority" guidance note. */
export const AUTHORITY_GUIDANCE_MAX_CHARS = 4000;

/**
 * Validate a guidance value for `authority_guidance`.
 *
 * Returns the string to stage. The empty string is ALLOWED and means "clear
 * the note" — guidance is optional by design, so clearing it is a real
 * intention rather than a malformed write.
 */
export function validateAuthorityGuidance(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(
      `authority_guidance must be a string containing the priority note to stage, got ${
        value === null ? "null" : typeof value
      }.`,
    );
  }
  if (value.length > AUTHORITY_GUIDANCE_MAX_CHARS) {
    throw new Error(
      `authority_guidance is ${value.length} characters; the maximum is ${AUTHORITY_GUIDANCE_MAX_CHARS}.`,
    );
  }
  return value;
}

/**
 * State a triage handler needs to decide whether a write is legal. Passed in
 * from refs read at CALL time, never from a render snapshot: the seam resolves
 * the handler before it shows the confirm dialog, so a guard closing over
 * rendered state can act on a value that went stale while the dialog sat open
 * (the `image-studio` trap, recorded on the `chat-voice` adopter).
 */
export interface AuthorityTriageState {
  /** Null when the latest result has not loaded yet — NOT the same as empty. */
  recommendations: AuthorityRecommendation[] | null;
  /** Candidate keys already dismissed this visit or on the loaded row. */
  dismissed: ReadonlySet<string>;
  /** Candidate keys already added to the link plan this visit. */
  approved: ReadonlySet<string>;
  /** Candidate key of a triage action currently in flight, if any. */
  working: string | null;
  /** True while the authority analysis is streaming. */
  running: boolean;
}

function assertKeyShape(target: string, value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(
      `${target} must be the candidate_key string of one recommendation, got ${
        value === null ? "null" : typeof value
      }. Read authority_recommendations for the available keys.`,
    );
  }
  const key = value.trim();
  if (!key) {
    throw new Error(
      `${target} must be a non-empty candidate_key. Read authority_recommendations for the available keys.`,
    );
  }
  return key;
}

/**
 * Resolve a `candidate_key` to a recommendation the user can actually SEE,
 * or throw an error the agent can act on.
 *
 * The distinctions here are the point:
 *  - not loaded  ≠ empty        ("no result yet" is a retry, "none proposed" is not)
 *  - resolves    ≠ visible      (a dismissed row is gone from the user's screen)
 *  - already actioned            (re-approving is a silent no-op the user cannot see)
 */
export function resolveAuthorityRecommendation(
  target: string,
  value: unknown,
  state: AuthorityTriageState,
  { requireNotApproved = false }: { requireNotApproved?: boolean } = {},
): AuthorityRecommendation {
  const key = assertKeyShape(target, value);

  if (state.running) {
    throw new Error(
      `${target} is refused while the authority analysis is running — the recommendation set is being replaced right now. Wait for the run to finish and read authority_recommendations again.`,
    );
  }
  if (state.working) {
    throw new Error(
      `${target} is refused while another recommendation ("${state.working}") is still being written. Wait for it to finish.`,
    );
  }
  if (state.recommendations === null) {
    throw new Error(
      `${target} cannot be applied: the authority result has not loaded on this page yet. This is not the same as "no recommendations" — wait for the page to finish loading and read authority_recommendations.`,
    );
  }
  if (state.recommendations.length === 0) {
    throw new Error(
      `${target} cannot be applied: this site's latest authority run proposed no recommendations, so there is nothing to triage.`,
    );
  }

  const match = state.recommendations.find(
    (item) => item.candidate_key === key,
  );
  if (!match) {
    const visible = state.recommendations
      .filter((item) => !state.dismissed.has(item.candidate_key))
      .map((item) => item.candidate_key);
    throw new Error(
      `${target}: no recommendation on this page has candidate_key "${key}". Currently visible keys: ${
        visible.length ? visible.join(", ") : "(none — all are dismissed)"
      }.`,
    );
  }
  if (state.dismissed.has(key)) {
    throw new Error(
      `${target}: recommendation "${key}" is already dismissed and is no longer on the user's screen, so it cannot be actioned.`,
    );
  }
  if (requireNotApproved && state.approved.has(key)) {
    throw new Error(
      `${target}: recommendation "${key}" is already in the link plan — re-adding it would change nothing the user can see.`,
    );
  }
  return match;
}
