/**
 * THE TRIPWIRE.
 *
 * `GET /runs/waiting` landed in aidream before the deployed server carried it.
 * A routine "restore the live API contract" regen against PRODUCTION therefore
 * deleted the path and its four schemas out of `api-types.ts`, and the next
 * agent to meet the type errors "fixed" them by gutting the inbox's hook into a
 * stub that returns an error forever. Nothing screamed: the surface simply
 * stopped working, and the commit that did it looked like housekeeping.
 *
 * This test makes that silent. Regenerate the types from a server that does not
 * serve this projection and CI fails by name, with the reason and the fix.
 *
 * When production has caught up this test still passes — it asserts the
 * contract exists, not where it was generated from. Delete it only when the
 * endpoint has been deployed long enough that a regen cannot lose it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_TYPES = join(process.cwd(), "types/python-generated/api-types.ts");

describe("the waiting-runs contract survives a type regen", () => {
  const generated = readFileSync(API_TYPES, "utf8");

  it("still declares GET /runs/waiting", () => {
    expect(generated).toContain('"/runs/waiting"');
  });

  it.each(["WaitingRun", "WaitingRunsResponse", "WaitingSnapshot", "WaitingGap"])(
    "still declares the %s schema",
    (schema) => {
      expect(generated).toContain(`${schema}: {`);
    },
  );

  it("still declares GET /runs/stream, the announce channel", () => {
    expect(generated).toContain('"/runs/stream"');
  });
});
