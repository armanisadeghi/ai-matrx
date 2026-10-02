import { executeResultHeadline } from "@/features/directive-catalog/executeResult";
import type { DirectiveApplyResult, DirectiveReceipt } from "@/features/directive-catalog/types";

function result(statuses: DirectiveReceipt["status"][], applied = statuses.length): DirectiveApplyResult {
  return {
    directive: "directive_v1_create_task",
    applied,
    failed: statuses.filter((s) => s === "failed").length,
    receipts: statuses.map((status) => ({ status }) as DirectiveReceipt),
  };
}

describe("the builder's result line reads the receipts, not the count", () => {
  it("a repeat Create the ledger deduped says 'already applied' — the server still counts it as applied", () => {
    expect(executeResultHeadline(result(["already_applied"], 1))).toBe(
      "Already applied — nothing new was written.",
    );
  });
  it("a fresh write says Applied", () => {
    expect(executeResultHeadline(result(["applied"]))).toBe("Applied.");
  });
  it("a mix names each part", () => {
    expect(executeResultHeadline(result(["applied", "already_applied", "failed"], 2))).toBe(
      "1 applied, 1 already applied, 1 failed.",
    );
  });
});
