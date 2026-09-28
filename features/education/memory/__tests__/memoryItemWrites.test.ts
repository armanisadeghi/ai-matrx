import { parseMemoryAid } from "../memoryWrites";
import { parseMemoryItemChange } from "../memoryItemWrites";

const aid = parseMemoryAid({
  title: "Cells",
  mnemonics: [
    { technique: "sentence", target: "DNA", device: "First device" },
    { technique: "rhyme", target: "RNA", device: "Second device" },
  ],
  analogies: [{ concept: "Nucleus", analogy: "Library" }],
  memory_palace: { applicable: false, theme: "", loci: [] },
});

describe("one memory item write", () => {
  it("refuses a stale position-based approval after the set revision changes", () => {
    expect(() => parseMemoryItemChange({ action: "delete", kind: "mnemonic", position: 1, expected_version: 4 }, aid, 5)).toThrow("changed");
    expect(parseMemoryItemChange({ action: "delete", kind: "mnemonic", position: 1, expected_version: 5 }, aid, 5).aid.mnemonics[0].target).toBe("RNA");
  });
  it("updates only the selected item and keeps the other items", () => {
    const changed = parseMemoryItemChange({ action: "update", kind: "mnemonic", position: 2, item: { device: "Revised device" } }, aid);
    expect(changed.aid.mnemonics.map((item) => item.device)).toEqual(["First device", "Revised device"]);
    expect(changed.aid.analogies).toEqual(aid.analogies);
    expect(changed.aid.title).toBe(aid.title);
  });

  it("deletes one child without deleting the set", () => {
    const changed = parseMemoryItemChange({ action: "delete", kind: "mnemonic", position: 1 }, aid);
    expect(changed.aid.mnemonics).toHaveLength(1);
    expect(changed.aid.mnemonics[0].target).toBe("RNA");
    expect(changed.aid.analogies).toHaveLength(1);
  });

  it("accepts an empty saved set after its last child is removed", () => {
    const one = parseMemoryAid({ ...aid, mnemonics: [], analogies: aid.analogies });
    const changed = parseMemoryItemChange({ action: "delete", kind: "analogy", position: 1 }, one);
    expect(changed.aid.mnemonics).toEqual([]);
    expect(changed.aid.analogies).toEqual([]);
  });
});
