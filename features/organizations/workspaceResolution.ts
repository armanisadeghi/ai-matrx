/**
 * Typed constructors for `WorkspaceResolution`.
 *
 * 🚨 WHY THIS IS A SEPARATE MODULE. Every surface test that proves a refusal
 * mocks `./awaitWorkspace` wholesale (`jest.mock(..., () => ({ ... }))`), so a
 * constructor living in that file would be erased by the very tests that need
 * it. This leaf is never mocked; its only tie to `awaitWorkspace` is a
 * type-only import, which is erased at runtime.
 *
 * 🚨 WHY IT EXISTS AT ALL. `cause` SEPARATES THE TWO WAYS a workspace can be
 * missing (R37, 2026-09-18) — `"no-selection"` is an answer, `"unreadable"` is
 * the absence of one — and a hand-spelled `{ status: "unavailable", reason }`
 * simply forgets it. Inside a `jest.mock` factory TypeScript never complains,
 * so the fixture silently claims "pick an organization" to a person nobody
 * looked up. `workspaceUnavailable` takes the cause FIRST and has no default:
 * naming it is the point.
 */

import type { WorkspaceResolution } from "./awaitWorkspace";

export type WorkspaceUnavailable = Extract<
  WorkspaceResolution,
  { status: "unavailable" }
>;

/** The workspace is known. */
export function workspaceReady(organizationId: string): WorkspaceResolution {
  return { status: "ready", organizationId };
}

/**
 * There is no workspace to act in, and `cause` says which kind of "no" this is.
 * `reason` is the plain sentence that goes ON the surface.
 */
export function workspaceUnavailable(
  cause: WorkspaceUnavailable["cause"],
  reason: string,
): WorkspaceResolution {
  return { status: "unavailable", reason, cause };
}
