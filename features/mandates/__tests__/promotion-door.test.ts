/**
 * PROMOTION HAS ONE DOOR, AND THE CLIENT NEVER RE-DECIDES IT.
 *
 * `mandate.duplicate_mandate` (aidream 0592) is SECURITY DEFINER and granted to
 * `authenticated`, so THE BODY IS THE GATE — the `agx_duplicate_agent`
 * precedent REVIEW-one-resolution.md §8b item 3 tells L3 to copy verbatim. Four
 * rules live in that body and nowhere else:
 *
 *   · super-admin only, on the p_as_system branch
 *   · the copy is homed in the Matrx System org, read from `iam.system_orgs`
 *     key='system' — never a literal uuid
 *   · THE HOLDER LAW — a promoted copy's holder must be a system agent
 *   · the copy starts with NO RUNGS
 *
 * The client's job is to OFFER the control and to PRINT the refusal. The
 * failure mode this guard exists for is the one this campaign keeps finding: a
 * screen that re-implements a database rule, drifts from it, and then lies. So:
 * the promotion module may not write `mandate.definition` itself, may not
 * decide the home, and may not swallow the door's words.
 *
 * The runtime behaviour of the door itself is proven against PRODUCTION, not
 * here — `aidream/tests/test_mandate_promotion_live.py`, RED then GREEN.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
const REPO_ROOT = join(__dirname, "..", "..", "..");

/**
 * Comments are stripped before every check — same reason as
 * `scoped-corpus-reads.test.ts`: these files are dense with prose ABOUT the
 * rules they must not re-implement, and a guard that fails on its own
 * explanation gets turned off within a week. (Copied rather than imported:
 * importing another `.test.ts` re-registers its suite.)
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function read(relative: string): string {
  return withoutComments(readFileSync(join(REPO_ROOT, relative), "utf8"));
}

const PROMOTION = "features/mandates/admin/promotion.ts";
const BUTTON = "features/mandates/admin/mandate-actions.tsx";

describe("the promotion door", () => {
  it("promotes through the RPC and never inserts a definition itself", () => {
    const source = read(PROMOTION);
    expect(source).toContain('.rpc("duplicate_mandate"');
    expect(source).toContain("p_as_system: true");
    // A client-side read-then-insert is exactly what `duplicateWorkflow`
    // replaced for workflows: it copied the source's org and visibility onto
    // the copy. There is no second write path here.
    expect(source).not.toMatch(/\.insert\(/);
    expect(source).not.toMatch(/\.upsert\(/);
  });

  it("never names the system organization — the door reads it from iam.system_orgs", () => {
    const source = read(PROMOTION);
    expect(source).not.toContain("SYSTEM_ORGANIZATION_ID");
    expect(source).not.toContain("39c38960");
    expect(source).not.toContain("p_organization_id");
  });

  it("carries the door's own words out whole, hint included", () => {
    const source = read(PROMOTION);
    // message + detail become the printable sentence; hint names the next door
    // (`agx_duplicate_agent(p_as_system)` when THE HOLDER LAW fires), so it is
    // carried too rather than dropped on the floor.
    expect(source).toContain("hint: error.hint");
    expect(source).toContain("MandateDoorError");
  });

  it("prints the refusal instead of inventing a sentence for it", () => {
    const source = read(BUTTON);
    expect(source).toContain("PromoteToSystemMandateButton");
    expect(source).toContain("refusal.message");
    expect(source).toContain("refusal.hint");
    // The admin gate on the button is CHROME. It must never be the only gate,
    // and it must never be the thing that decides the outcome.
    expect(source).toContain("selectIsSuperAdmin");
  });

  it("says that a promoted copy starts with no bindings", () => {
    // The single most surprising thing about promotion, so the screen states
    // it up front rather than letting an admin discover an unbound system job.
    const source = readFileSync(join(REPO_ROOT, BUTTON), "utf8");
    expect(source).toContain("The copy starts with no bindings");
  });
});
