import { parseCreateMemoryAids, parseMemoryAid } from "../memoryWrites";

const aid = (title: string) => ({
  title,
  mnemonics: [{ technique: "sentence", target: "RGB", device: "Red Green Blue" }],
  analogies: [],
  memory_palace: { applicable: false, theme: "", loci: [] },
});

describe("memory aid writes", () => {
  it("keeps every registered kind and removes hidden palace data", () => {
    const parsed = parseMemoryAid({ ...aid("Colors"), memory_palace: {
      applicable: false, theme: "Old room", loci: [{ place: "", item: "" }],
    } });
    expect(parsed.__kind).toBe("memory_aid");
    expect(parsed.mnemonics[0].__kind).toBe("mnemonic");
    expect(parsed.memory_palace).toEqual({ __kind: "memory_palace", applicable: false, theme: "", loci: [] });
  });

  it("refuses a whole batch with every invalid entry and repeated title named", () => {
    expect(() => parseCreateMemoryAids([
      aid("Colors"),
      { ...aid("Colors"), mnemonics: [{ technique: "made-up", target: "RGB", device: "RGB" }] },
      { ...aid("Other"), analogies: [{ concept: "Color", analogy: "" }] },
    ])).toThrow(/3 problems/);
  });
});
