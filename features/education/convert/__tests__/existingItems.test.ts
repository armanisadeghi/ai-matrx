import { dropRepeats, repeatsExisting } from "../existingItems";

// What the kit already holds, across ALL its decks (two decks here).
const existing = [
  { text: "What is an isotope?", answer: "Atoms of one element with different neutron counts" },
  { text: "Who proposed the atomic theory in 1808?", answer: "John Dalton" },
];

describe("kit-wide dedupe", () => {
  it("drops an exact repeat (case and punctuation ignored)", () => {
    expect(repeatsExisting({ text: "what is an ISOTOPE", answer: "x" }, existing)).toBe(true);
  });

  it("drops a near-duplicate question with the same answer", () => {
    expect(
      repeatsExisting(
        { text: "Which scientist proposed the atomic theory in 1808?", answer: "John Dalton" },
        existing,
      ),
    ).toBe(true);
  });

  it("keeps new cards and never drops everything", () => {
    const made = [
      { front: "What is an isotope?", back: "Same element, different neutrons" },
      { front: "What is the mass number?", back: "Protons plus neutrons" },
    ];
    const kept = dropRepeats(made, existing, (c) => ({ text: c.front, answer: c.back }));
    expect(kept.map((c) => c.front)).toEqual(["What is the mass number?"]);
  });
});
