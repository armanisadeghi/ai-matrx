// The study kit's board and its continuation (2026-10-03 independent check).
//
// 1. The status line counts, it never promises time: "this takes a minute or
//    two" sat beside a 14-minute build. It now says outputs ready and sections
//    done across every output.
// 2. A stopped build is continued from what it stored — and only a request
//    this code can act on is offered (a malformed one is never a Continue).
// 3. A stored title never shows a resolver chunk id.
import { kitHeadline, kitSectionTotals } from "../components/KitBoard";
import { restoreKitRunRequest } from "../useKitGeneration";
import { titleWithoutInternalIds } from "@/features/education/convert/coverage";
import type { KitTargetState } from "../types";

jest.mock("@/features/education/convert/useContentConverter", () => ({ useContentConverter: jest.fn() }));

const running = (kind: KitTargetState["targetKind"], done: number, total: number): KitTargetState => ({
  targetKind: kind,
  label: kind,
  status: "running",
  coverage: { done, total, label: "", items: 0 },
});

describe("the board's status line", () => {
  it("counts ready outputs and sections across every output — no time promise", () => {
    const targets: KitTargetState[] = [
      running("deck", 3, 16),
      running("quiz", 5, 16),
      { targetKind: "summary", label: "Summary", status: "success", coverage: { done: 16, total: 16, label: "", items: 40 } },
      { targetKind: "audio", label: "Audio", status: "success", stillGenerating: true },
    ];
    const line = kitHeadline("generating", targets, { finished: 1, stillWorking: 3, failed: 0 });
    expect(line).toBe("1 of 4 ready · 24 of 48 sections");
    expect(line).not.toMatch(/minute|second|soon|while/i);
    expect(kitSectionTotals(targets)).toEqual({ done: 24, total: 48 });
  });

  it("names failures and reading plainly", () => {
    expect(kitHeadline("ingesting", [], { finished: 0, stillWorking: 0, failed: 0 })).toBe("Reading your material");
    expect(kitHeadline("done", [running("deck", 1, 2)], { finished: 0, stillWorking: 0, failed: 1 })).toBe(
      "0 of 1 ready · 1 failed",
    );
  });
});

describe("continuing a stopped kit", () => {
  const sourceSet = { __kind: "source_set", version: 1, sources: [{ resource_type: "file", resource_id: "f1" }] };
  it("restores a request it can continue", () => {
    expect(
      restoreKitRunRequest({
        kinds: ["deck", "quiz", "nonsense"],
        options: { depth: "thorough", count: 0, focus: "chapter 3" },
        orgId: "org-1",
        sourceSet,
        startedAt: 1,
      }),
    ).toEqual({
      kinds: ["deck", "quiz"],
      options: { depth: "thorough", focus: "chapter 3" },
      orgId: "org-1",
      sourceSet,
      startedAt: 1,
    });
  });

  it("refuses one without Sources, outputs or an organization", () => {
    expect(restoreKitRunRequest({ kinds: [], orgId: "o", sourceSet, startedAt: 1 })).toBeNull();
    expect(restoreKitRunRequest({ kinds: ["deck"], orgId: "", sourceSet, startedAt: 1 })).toBeNull();
    expect(
      restoreKitRunRequest({ kinds: ["deck"], orgId: "o", sourceSet: { ...sourceSet, sources: [] }, startedAt: 1 }),
    ).toBeNull();
  });
});

describe("a stored title never shows an internal id", () => {
  it("strips a resolver chunk id from an old per-section deck name", () => {
    expect(
      titleWithoutInternalIds(
        "official-ap-biology-ced.pdf and 1 more - section 5 of 6: Chunk 9e46adde-0a23-4fbf-8f4d-9a9c096e9a37 (page 25) (1/2)",
      ),
    ).toBe("official-ap-biology-ced.pdf and 1 more - section 5 of 6: Page 25 (1/2)");
  });
  it("leaves an ordinary title alone", () => {
    expect(titleWithoutInternalIds("Cell Membrane & Transport")).toBe("Cell Membrane & Transport");
  });
});
