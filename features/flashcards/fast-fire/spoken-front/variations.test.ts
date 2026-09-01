import {
  ANTICIPATION_CUES,
  DIRECTORS_NOTES,
  ENERGY_CUES,
  SAMPLE_CONTEXTS,
  SCENES,
  SPEAKER_PROFILES,
  pickSpokenFrontVariables,
} from "./variations";

describe("pickSpokenFrontVariables", () => {
  it("keeps every guaranteed TTS offer populated for hashes above 0x7fffffff", () => {
    // This is the real FastFire Test Deck water card. Its FNV-1a hash is
    // 0x9acf0899, so a signed right shift produces negative array indexes.
    const picked = pickSpokenFrontVariables(
      "440a0f5b-c523-46b3-9a31-58cba8b6a0ff",
      "What is the chemical symbol for water?",
      3,
      4,
    );

    expect(picked.content).not.toContain("undefined");
    expect(SAMPLE_CONTEXTS).toContain(picked.sample_context);
    expect(SPEAKER_PROFILES).toContain(picked.speaker_profile);
    expect(DIRECTORS_NOTES).toContain(picked.directors_notes);
    expect(SCENES).toContain(picked.scene);

    const cueCount = ENERGY_CUES.filter((cue) =>
      picked.content.includes(cue),
    ).length;
    const anticipationCount = ANTICIPATION_CUES.filter((cue) =>
      picked.content.includes(cue),
    ).length;
    expect(cueCount).toBe(1);
    expect(anticipationCount).toBe(1);
  });
});
