/**
 * The number beside a decision answer must describe THAT answer.
 *
 * Every payload in this file is copied verbatim out of `chat.message` — the
 * Jev and Sonnet turns of conversation `c813a6ec` and battle set `b0ac5d97`
 * — so a green run here means the live rows read correctly, not that a
 * hand-written fixture agrees with the reader.
 *
 * Both defects these cover were found by a reviewer looking at the screen:
 *   A. `{"answer": false, "probability": 0.3}` rendered "No 30%".
 *   B. a score of 1.87 rendered level 2's label beside level 1's 49%.
 *   C. (2026-09-23) a score's label named the level NEAREST the weighted
 *      number, contradicting the bars below it; the label is now the peak.
 */

import {
  answerProbability,
  formatDecisionAnswer,
  probabilityOfTrue,
  readDecisionAnswers,
} from "../read";

/** Battle b0ac5d97, Jev column — message ea19fc54-ca17-4acd-9da4-2b66638a135a. */
const JEV_BATTLE_TURN = {
  __kind: "decision_answers",
  model: "jev-1.13.0",
  method: "native",
  answers: {
    urgency: {
      __kind: "decision_answer",
      type: "score",
      answer: 1.87,
      legend: {
        "0": "cosmetic",
        "1": "minor friction",
        "2": "a feature is blocked",
        "3": "data or money at risk",
        "4": "down for someone",
      },
      confidence: 0.25,
      probabilities: { "0": 0.02, "1": 0.49, "2": 0.27, "3": 0.03, "4": 0.19 },
    },
    is_defect: {
      __kind: "decision_answer",
      type: "noul",
      answer: false,
      confidence: 0.7,
      probability: 0.3,
    },
    owning_surface: {
      __kind: "decision_answer",
      type: "choice",
      answer: "frontend",
      confidence: 0.94,
      probabilities: {
        data: 0.01,
        server: 0.0,
        unclear: 0.04,
        frontend: 0.95,
        infrastructure: 0.0,
      },
    },
  },
  unanswerable: {},
  usage: { input_tokens: 815, output_tokens: 91 },
  cost_usd: 0.00003423,
};

/** Battle b0ac5d97, Sonnet column — message d422fce7-4332-4258-bc95-ee734a6f1862. */
const SONNET_BATTLE_TURN = {
  __kind: "decision_answers",
  model: "claude-sonnet-5",
  method: "verbalized",
  answers: {
    urgency: {
      __kind: "decision_answer",
      type: "score",
      answer: 3.12,
      legend: {
        "0": "cosmetic",
        "1": "minor friction",
        "2": "a feature is blocked",
        "3": "data or money at risk",
        "4": "down for someone",
      },
      confidence: 0.65,
      probabilities: { "0": 0.02, "1": 0.05, "2": 0.25, "3": 0.15, "4": 0.53 },
    },
    is_defect: {
      __kind: "decision_answer",
      type: "noul",
      answer: true,
      confidence: 0.9,
      probability: 0.96,
    },
  },
  unanswerable: {},
  usage: { input_tokens: 37234, output_tokens: 1642 },
  cost_usd: 0.109504,
};

/** Conversation c813a6ec, Jev — message 1fcca3c1-f3e4-424c-9bc7-4a86515758fb. */
const JEV_RUNNER_TURN = {
  __kind: "decision_answers",
  model: "jev-1.13.0",
  method: "native",
  answers: {
    urgency: {
      __kind: "decision_answer",
      type: "score",
      answer: 3.09,
      legend: {
        "0": "cosmetic",
        "1": "minor friction",
        "2": "a feature is blocked",
        "3": "data or money at risk",
        "4": "down for someone",
      },
      confidence: 0.24,
      probabilities: { "0": 0.0, "1": 0.0, "2": 0.35, "3": 0.21, "4": 0.44 },
    },
    is_defect: {
      __kind: "decision_answer",
      type: "noul",
      answer: true,
      confidence: 0.96,
      probability: 0.96,
    },
  },
  unanswerable: {},
  usage: { input_tokens: 779, output_tokens: 91 },
  cost_usd: 0.000032718,
};

function answer(payload: unknown, name: string) {
  const view = readDecisionAnswers(payload);
  if (!view) throw new Error("payload did not read as decision_answers");
  const found = view.answers.find((a) => a.name === name);
  if (!found) throw new Error(`no answer named ${name}`);
  return found;
}

const pct = (value: number | null) =>
  value == null ? "—" : `${Math.round(value * 100)}%`;

describe("Yes/No — the percentage belongs to the answer, not to `true`", () => {
  it("reads a false answer at P(true) 0.3 as No 70%", () => {
    const isDefect = answer(JEV_BATTLE_TURN, "is_defect");
    expect(formatDecisionAnswer(isDefect)).toBe("No");
    expect(answerProbability(isDefect)).toBeCloseTo(0.7, 10);
    expect(pct(answerProbability(isDefect))).toBe("70%");
  });

  it("leaves a true answer alone", () => {
    const isDefect = answer(SONNET_BATTLE_TURN, "is_defect");
    expect(formatDecisionAnswer(isDefect)).toBe("Yes");
    expect(answerProbability(isDefect)).toBeCloseTo(0.96, 10);
  });

  it("keeps P(true) for the distribution bar and the author's threshold", () => {
    const isDefect = answer(JEV_BATTLE_TURN, "is_defect");
    expect(probabilityOfTrue(isDefect)).toBeCloseTo(0.3, 10);
    expect(
      isDefect.probabilities.map((e) => [e.label, Math.round(e.value * 100)]),
    ).toEqual([
      ["No", 70],
      ["Yes", 30],
    ]);
  });

  it("the contract's own example: false at 0.29 reads No 71%", () => {
    const view = readDecisionAnswers({
      __kind: "decision_answers",
      answers: {
        q: {
          __kind: "decision_answer",
          type: "noul",
          answer: false,
          confidence: 0.71,
          probability: 0.29,
        },
      },
    });
    const only = view!.answers[0];
    expect(
      `${formatDecisionAnswer(only)} ${pct(answerProbability(only))}`,
    ).toBe("No 71%");
  });

  it("compares two No answers as a small delta, not as their complements", () => {
    const jev = answer(
      {
        __kind: "decision_answers",
        answers: {
          q: {
            __kind: "decision_answer",
            type: "noul",
            answer: false,
            probability: 0.29,
          },
        },
      },
      "q",
    );
    const sonnet = answer(
      {
        __kind: "decision_answers",
        answers: {
          q: {
            __kind: "decision_answer",
            type: "noul",
            answer: false,
            probability: 0.32,
          },
        },
      },
      "q",
    );
    const probabilities = [jev, sonnet].map((a) => answerProbability(a)!);
    const spread = Math.max(...probabilities) - Math.min(...probabilities);
    expect(pct(spread)).toBe("3%");
  });

  it("an unreadable Yes/No stays unreadable rather than defaulting", () => {
    const view = readDecisionAnswers({
      __kind: "decision_answers",
      answers: { q: { __kind: "decision_answer", type: "noul" } },
    });
    const only = view!.answers[0];
    expect(formatDecisionAnswer(only)).toBe("unreadable");
    expect(answerProbability(only)).toBeNull();
  });
});

describe("Score — the weighted number, then the MOST LIKELY level and its probability", () => {
  // The headline used to take the label of the level NEAREST the weighted
  // score. On the Sonnet run of 2026-09-23 that printed
  // "urgency 2.9 — data or money at risk 16%" above bars led by
  // "a feature is blocked 46%" — a contradiction on one screen. The label is
  // now the distribution's peak, with the peak's own probability.

  it("1.87 reads as level 1 (the 49% peak), not level 2 at 27%", () => {
    const urgency = answer(JEV_BATTLE_TURN, "urgency");
    expect(formatDecisionAnswer(urgency)).toBe("1.9 — minor friction");
    expect(answerProbability(urgency)).toBeCloseTo(0.49, 10);
    expect(urgency.answerKey).toBe("1");
  });

  it("3.09 reads as level 4 (the 44% peak), not the nearest level 3 at 21%", () => {
    const urgency = answer(JEV_RUNNER_TURN, "urgency");
    expect(formatDecisionAnswer(urgency)).toBe("3.1 — down for someone");
    expect(answerProbability(urgency)).toBeCloseTo(0.44, 10);
  });

  it("3.12 reads as level 4 when level 4 holds most of the mass", () => {
    const urgency = answer(SONNET_BATTLE_TURN, "urgency");
    expect(formatDecisionAnswer(urgency)).toBe("3.1 — down for someone");
    expect(answerProbability(urgency)).toBeCloseTo(0.53, 10);
  });

  it("the peak is the first bar, so the headline and the bold row agree", () => {
    for (const payload of [
      JEV_BATTLE_TURN,
      JEV_RUNNER_TURN,
      SONNET_BATTLE_TURN,
    ]) {
      const urgency = answer(payload, "urgency");
      expect(urgency.probabilities[0].key).toBe(urgency.answerKey);
    }
  });

  it("reads a 1-based legend, as the contract example writes it; a tie goes to the level nearest the score", () => {
    const view = readDecisionAnswers({
      __kind: "decision_answers",
      answers: {
        urgency: {
          __kind: "decision_answer",
          type: "score",
          answer: 3.4,
          confidence: 0.4,
          probabilities: { "1": 0.02, "2": 0.1, "3": 0.4, "4": 0.4, "5": 0.08 },
          legend: {
            "1": "cosmetic",
            "2": "minor friction",
            "3": "a feature is blocked",
            "4": "data or money at risk",
            "5": "down for someone",
          },
        },
      },
    });
    const urgency = view!.answers[0];
    expect(formatDecisionAnswer(urgency)).toBe("3.4 — a feature is blocked");
    expect(answerProbability(urgency)).toBeCloseTo(0.4, 10);
  });

  it("the same weighted score with two different peaks reads two different labels", () => {
    const at = (probabilities: Record<string, number>) =>
      answer(
        {
          __kind: "decision_answers",
          answers: {
            s: {
              __kind: "decision_answer",
              type: "score",
              answer: 2.9,
              probabilities,
              legend: {
                "0": "cosmetic",
                "1": "minor friction",
                "2": "a feature is blocked",
                "3": "data or money at risk",
                "4": "down for someone",
              },
            },
          },
        },
        "s",
      );
    const blocked = at({ "0": 0.0, "1": 0.0, "2": 0.46, "3": 0.16, "4": 0.38 });
    const down = at({ "0": 0.0, "1": 0.1, "2": 0.2, "3": 0.2, "4": 0.5 });
    expect(formatDecisionAnswer(blocked)).toBe("2.9 — a feature is blocked");
    expect(answerProbability(blocked)).toBeCloseTo(0.46, 10);
    expect(formatDecisionAnswer(down)).toBe("2.9 — down for someone");
    expect(answerProbability(down)).toBeCloseTo(0.5, 10);
  });
});

describe("Choice — the chosen option's own probability", () => {
  it("reads frontend at 0.95, not the top of the sorted list by luck", () => {
    const surface = answer(JEV_BATTLE_TURN, "owning_surface");
    expect(formatDecisionAnswer(surface)).toBe("frontend");
    expect(answerProbability(surface)).toBeCloseTo(0.95, 10);
  });

  it("reads a chosen option that is NOT the model's most likely one", () => {
    const view = readDecisionAnswers({
      __kind: "decision_answers",
      answers: {
        owning_surface: {
          __kind: "decision_answer",
          type: "choice",
          answer: "server",
          probabilities: { frontend: 0.5, server: 0.28, data: 0.12 },
        },
      },
    });
    const only = view!.answers[0];
    expect(answerProbability(only)).toBeCloseTo(0.28, 10);
  });
});
