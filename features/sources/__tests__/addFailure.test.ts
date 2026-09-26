/**
 * Sonnet walk 2026-09-27 (06a–07a): "Add to Sources" on pasted text left the
 * dialog open, no spinner, no sentence, and nothing became a Source. A
 * cancelled/unsurfaced "which workspace?" choice was swallowed by
 * `if (isOrganizationSelectionCancelled(err)) return;`. Every Add path now says
 * what happened and what to do — never silent.
 */
import { OrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { addFailureSentence } from "@/features/sources/addFailure";

describe("addFailureSentence", () => {
  it("a workspace choice that did not happen says so, with the remedy", () => {
    const sentence = addFailureSentence(new OrganizationSelectionCancelled());
    expect(sentence).toMatch(/Nothing was added/);
    expect(sentence).toMatch(/workspace/i);
  });

  it("any other failure still produces a sentence", () => {
    expect(addFailureSentence(new Error("boom")).length).toBeGreaterThan(0);
  });
});
