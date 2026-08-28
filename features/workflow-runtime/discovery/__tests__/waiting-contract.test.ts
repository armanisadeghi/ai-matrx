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
 * Frontend and backend release independently. This test therefore accepts two
 * honest states: the live contract carries the whole projection, or the hook
 * fails closed without bypassing the typed client. A half-contract is always
 * an error.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_TYPES = join(process.cwd(), "types/python-generated/api-types.ts");
const WAITING_HOOK = join(
  process.cwd(),
  "features/workflow-runtime/discovery/useWaitingRuns.ts",
);

describe("the waiting-runs contract survives a type regen", () => {
  const generated = readFileSync(API_TYPES, "utf8");

  it("is either fully generated or explicitly unavailable", () => {
    const hasRoute = generated.includes('"/runs/waiting"');
    const schemas = ["WaitingRun", "WaitingRunsResponse", "WaitingSnapshot", "WaitingGap"];
    const present = schemas.filter((schema) => generated.includes(`${schema}: {`));
    if (hasRoute) {
      expect(present).toEqual(schemas);
      return;
    }
    expect(present).toEqual([]);
    expect(readFileSync(WAITING_HOOK, "utf8")).toContain(
      "WAITING_ROUTE_UNAVAILABLE",
    );
  });

  it("still declares GET /runs/stream, the announce channel", () => {
    expect(generated).toContain('"/runs/stream"');
  });
});
