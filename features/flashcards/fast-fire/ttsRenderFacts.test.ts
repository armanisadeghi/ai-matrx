import { ttsRenderFacts } from "./ttsRenderFacts";
import {
  ENERGY_CUES,
  FIRST_CARD_PHRASES,
  pickSpokenFrontCues,
  pickSpokenFrontVariables,
} from "./spoken-front/variations";

describe("ttsRenderFacts", () => {
  it("sends only the facts the site holds, native types, absent keys omitted", () => {
    const facts = ttsRenderFacts({
      renderLane: "spoken_front",
      cardId: "c1",
      cardFront: "What is H2O?",
      cardBack: "",
      cardTopic: null,
      position: { index: 2, total: 10 },
      setId: "s1",
      setName: "Chemistry basics",
      leadInPhrase: "[fast] Next!",
      anticipationCue: "[pause]",
    });
    expect(facts).toEqual({
      render_lane: "spoken_front",
      card_id: "c1",
      card_front: "What is H2O?",
      card_index: 2,
      card_total: 10,
      set_id: "s1",
      set_name: "Chemistry basics",
      lead_in_phrase: "[fast] Next!",
      anticipation_cue: "[pause]",
    });
  });

  it("never claims a set position the caller does not really have", () => {
    const facts = ttsRenderFacts({ renderLane: "helper", cardId: "c1", helperText: "Because." });
    expect(facts).toEqual({ render_lane: "helper", card_id: "c1", helper_text: "Because." });
    expect("card_index" in facts).toBe(false);
  });

  it("never overlaps the five by-name speech variables", () => {
    const facts = ttsRenderFacts({
      renderLane: "spoken_front",
      cardId: "c1",
      cardFront: "f",
      cardBack: "b",
      cardTopic: "t",
      position: { index: 0, total: 1 },
      setId: "s",
      setName: "n",
      energyCue: "e",
      leadInPhrase: "l",
      anticipationCue: "a",
      helperText: "h",
    });
    for (const k of ["content", "sample_context", "speaker_profile", "directors_notes", "scene"]) {
      expect(k in facts).toBe(false);
    }
  });
});

describe("pickSpokenFrontCues", () => {
  it("returns exactly the pieces the spoken content is built from", () => {
    const ids = Array.from({ length: 60 }, (_, i) => `card-${i}-${i * 7919}`);
    for (const [i, id] of ids.entries()) {
      const total = 12;
      const index = i % total;
      const cues = pickSpokenFrontCues(id, index, total);
      const { content } = pickSpokenFrontVariables(id, "Q?", index, total);
      expect(content).toBe(`${cues.lead_in_phrase} ${cues.anticipation_cue} Q?`);
      if (index === 0) {
        expect(FIRST_CARD_PHRASES).toContain(cues.lead_in_phrase);
        expect(cues.energy_cue).toBeUndefined();
      }
      if (cues.energy_cue) {
        expect(ENERGY_CUES).toContain(cues.energy_cue);
        expect(cues.lead_in_phrase.startsWith(`${cues.energy_cue} `)).toBe(true);
      }
    }
  });
});
