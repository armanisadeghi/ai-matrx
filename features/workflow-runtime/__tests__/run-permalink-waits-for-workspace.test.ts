/**
 * A FINISHED RUN'S PERMALINK NEVER NARRATES FAKE PROGRESS.
 *
 * Expert Book Challenge wall W39, the run-permalink instance (confirmed live
 * 2026-09-12): opening `/workflows/runs/{id}` on a cold load fired the attach
 * read BEFORE the organization bootstrap had landed. The read went out with no
 * `X-Organization-Id`, the server refused it 400 `organization_required`, and
 * the refusal was swallowed — the run stayed on its `pending` default, so the
 * page said "GETTING READY · Starting" for ~20 seconds about a run that had
 * finished hours earlier.
 *
 * Same root as the guided start's "workspace still loading" toast: a surface
 * acting before the context it needs has resolved.
 *
 * Two halves, both pinned here:
 *   1. The read WAITS for the workspace, bounded, and uses one that arrives a
 *      moment later (`awaitRunStreamOrganizationContext`).
 *   2. When the read genuinely fails, the run carries a readFailure the page
 *      shows — it is never left looking like progress.
 */

let organizationId: string | null = null;
let admissionResolve: (() => void) | null = null;

jest.mock("@/lib/api/organization-admission", () => ({
  waitForOrganizationAdmission: () =>
    new Promise<string>((resolve) => {
      admissionResolve = () => resolve("ready");
    }),
}));

import type { RootState } from "@/lib/redux/store";
import { awaitRunStreamOrganizationContext } from "../transport/organization-context";
import reducer, {
  attachRun,
  noteRunReadFailure,
  seedRunRow,
} from "../redux/workflow-runs.slice";
import { selectRunReadFailure } from "../redux/workflow-runs.selectors";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "cef6ae07-4562-4dbd-a8e4-403309cace08";

const getState = () =>
  ({ appContext: { organization_id: organizationId } }) as unknown as RootState;

describe("the attach read waits for the workspace", () => {
  beforeEach(() => {
    organizationId = null;
    admissionResolve = null;
  });

  it("stamps an organization that lands AFTER the page opened", async () => {
    const pending = awaitRunStreamOrganizationContext(getState, {
      Authorization: "Bearer jwt-token",
    });
    await Promise.resolve();
    organizationId = ORGANIZATION_ID;
    admissionResolve?.();
    await expect(pending).resolves.toEqual({
      Authorization: "Bearer jwt-token",
      "X-Organization-Id": ORGANIZATION_ID,
    });
  });

  it("does not wait at all when one is already selected", async () => {
    organizationId = ORGANIZATION_ID;
    await expect(
      awaitRunStreamOrganizationContext(getState, {}),
    ).resolves.toEqual({ "X-Organization-Id": ORGANIZATION_ID });
    // Nothing subscribed to admission — the fast path never touched it.
    expect(admissionResolve).toBeNull();
  });
});

describe("a refused read is said out loud, never narrated as progress", () => {
  it("carries the refusal on the run, and clears it when a row lands", () => {
    let state = reducer(undefined, attachRun({ runId: RUN_ID }));
    expect(selectRunReadFailure(RUN_ID)({ workflowRuns: state } as never)).toBeNull();

    state = reducer(
      state,
      noteRunReadFailure({
        runId: RUN_ID,
        message: "We could not read this run — the server refused the request.",
      }),
    );
    expect(
      selectRunReadFailure(RUN_ID)({ workflowRuns: state } as never),
    ).toMatch(/refused/);

    state = reducer(
      state,
      seedRunRow({
        runId: RUN_ID,
        row: { id: RUN_ID, status: "completed" } as never,
      }),
    );
    expect(
      selectRunReadFailure(RUN_ID)({ workflowRuns: state } as never),
    ).toBeNull();
  });
});
