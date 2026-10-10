// THE OUTLINE-RUN SIZE LAW (2026-10-09): a "Focus on gaps" quiz over a kit with a
// six-section outline produced 84 questions. Sections decide WHERE questions go,
// never HOW MANY: with no typed count the run is the kind's default size.
import { quizGenerator, practiceTestGenerator } from "../quizGenerator";
import { generateQuestionsFromSources } from "../generateQuestionsFromSources";
import { readOutlineGroups } from "@/features/education/kits/outline/outlineService";

jest.mock("../generateQuestionsFromSources", () => ({ generateQuestionsFromSources: jest.fn() }));
jest.mock("../assessmentService", () => ({ assessmentService: { createWithItems: jest.fn() } }));
jest.mock("@/features/education/convert/recordSourceLineage", () => ({ recordSourceLineage: jest.fn() }));
jest.mock("@/features/education/convert/existingItems", () => ({ readExistingKitItems: jest.fn(async () => []) }));
jest.mock("@/features/education/kits/outline/outlineService", () => ({ readOutlineGroups: jest.fn() }));

const SECTIONS = Array.from({ length: 6 }, (_, i) => ({ id: `sec${i}`, title: `Section ${i}` }));
const OUTLINE = { sections: SECTIONS, groups: SECTIONS.map((s) => ({ label: s.title, text: `### Chunk ${s.id}\nfacts` })) };
const CTX = { orgId: null } as never;

async function countPassed(gen: typeof quizGenerator, opts: Record<string, unknown>, withOutline: boolean) {
  jest.mocked(readOutlineGroups).mockResolvedValue(withOutline ? (OUTLINE as never) : null);
  jest.mocked(generateQuestionsFromSources).mockRejectedValue(new Error("stop"));
  await gen
    .run({ source: { text: "x", title: "T", ref: { kind: "kit", kitId: "k1" } as never }, targetKind: gen.targetKind, options: opts } as never, CTX)
    .catch(() => undefined);
  return jest.mocked(generateQuestionsFromSources).mock.calls.at(-1)?.[0].count;
}

describe("outline runs are the kind's default size", () => {
  it("quiz over a six-section outline with no typed count asks for 8", async () => {
    expect(await countPassed(quizGenerator, {}, true)).toBe(8);
  });
  it("practice test asks for 20", async () => {
    expect(await countPassed(practiceTestGenerator, {}, true)).toBe(20);
  });
  it("a typed count still wins", async () => {
    expect(await countPassed(quizGenerator, { count: 15 }, true)).toBe(15);
  });
  it("a plain source stays source-scaled", async () => {
    expect(await countPassed(quizGenerator, {}, false)).toBeUndefined();
  });
});
