import { battleMarkdown, battleMarkdownForPeople, battleRows, type BattleSnapshot } from "../battleSnapshot";

function snapshot(overrides: Partial<BattleSnapshot> = {}): BattleSnapshot {
  return {
    mode: "model",
    mode_label: "Model battle",
    varies: "only the model",
    battle: { id: "set-1", name: "Refund policy: model battle", url: "/agents/battle/model/set-1" },
    agent: { id: "agent-1", name: "Support Agent", version: "current" },
    blind: { active: false, revealed: false },
    columns: [
      {
        label: "Claude Sonnet",
        variant: { model: "Claude Sonnet" },
        status: "ran",
        answer: "You can return the item within 30 days of purchase.",
        transcript: [
          { role: "user", text: "What is the return policy?" },
          { role: "assistant", text: "You can return the item within 30 days of purchase." },
        ],
        feedback: {
          rating: "up",
          overall: 5,
          rank: 1,
          scores: { accuracy: 5 },
          note: "Clear and correct.",
        },
        metrics: {
          rounds: 1,
          input_tokens: 120,
          output_tokens: 40,
          total_tokens: 160,
          cost_usd: 0.0032,
          server_seconds: 1.4,
          ttft_ms: 220,
        },
      },
      {
        label: "GPT-5",
        variant: { model: "GPT-5" },
        status: "ran",
        answer: "Returns are accepted within 14 days.",
        transcript: [
          { role: "user", text: "What is the return policy?" },
          { role: "assistant", text: "Returns are accepted within 14 days." },
        ],
        feedback: {
          rating: "down",
          overall: 2,
          rank: 2,
          scores: { accuracy: 2 },
          note: null,
        },
      },
    ],
    rubric: [{ id: "accuracy", label: "Accuracy", hint: "Is it correct?" }],
    ...overrides,
  };
}

describe("battleRows", () => {
  it("produces one row per column with rank/overall/rubric labels as keys", () => {
    const rows = battleRows(snapshot());

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      column: 1,
      label: "Claude Sonnet",
      status: "ran",
      rank: 1,
      overall: 5,
      thumbs: "up",
      Accuracy: 5,
      total_tokens: 160,
      cost_usd: 0.0032,
      server_seconds: 1.4,
      ttft_ms: 220,
      answer: "You can return the item within 30 days of purchase.",
    });
    expect(rows[1]).toMatchObject({
      column: 2,
      label: "GPT-5",
      rank: 2,
      overall: 2,
      thumbs: "down",
      Accuracy: 2,
    });
  });

  it("fills a column's missing rubric score with null rather than dropping the key", () => {
    const rows = battleRows(snapshot());
    // GPT-5 column has no `metrics`, so its metric keys must be absent, not zero.
    expect(rows[1]).not.toHaveProperty("total_tokens");
    // Both columns still carry the rubric key even though only one scored it.
    expect(Object.keys(rows[0])).toContain("Accuracy");
    expect(Object.keys(rows[1])).toContain("Accuracy");
  });
});

describe("battleMarkdown", () => {
  it("shows the blind notice for an unrevealed blind snapshot", () => {
    const snap = snapshot({ blind: { active: true, revealed: false } });
    const md = battleMarkdown(snap);
    expect(md).toContain(
      "_Blind comparison: column identities and metrics are hidden until revealed._",
    );
  });

  it("omits the blind notice when not blind", () => {
    const md = battleMarkdown(snapshot());
    expect(md).not.toContain("Blind comparison");
  });

  it("includes each column's answer by default", () => {
    const md = battleMarkdown(snapshot());
    expect(md).toContain("You can return the item within 30 days of purchase.");
    expect(md).toContain("Returns are accepted within 14 days.");
  });

  it("omits every answer when { answers: false }", () => {
    const md = battleMarkdown(snapshot(), { answers: false });
    expect(md).not.toContain("You can return the item within 30 days of purchase.");
    expect(md).not.toContain("Returns are accepted within 14 days.");
    // The rest of the report still renders.
    expect(md).toContain("Claude Sonnet");
    expect(md).toContain("GPT-5");
  });
});

describe("battleMarkdownForPeople — a kind answer never reaches a person as JSON", () => {
  const SET_JSON = JSON.stringify({
    __kind: "flashcard_set",
    title: "Return policy cards",
    cards: [{ __kind: "flashcard", front: "Window?", back: "30 days" }],
  });

  it("converts a column's kind answer to markdown; the scope markdown keeps the data", () => {
    const snap = snapshot();
    snap.columns[0] = { ...snap.columns[0], answer: SET_JSON };
    const forPeople: string = battleMarkdownForPeople(snap);
    expect(forPeople).not.toContain("__kind");
    expect(forPeople).toContain("30 days");
    expect(battleMarkdown(snap)).toContain("__kind");
  });

  it("leaves a kindless battle unchanged", () => {
    expect(battleMarkdownForPeople(snapshot())).toBe(battleMarkdown(snapshot()));
  });
});

describe("battleRows — CSV/sheet cells read a kind answer as markdown", () => {
  it("the answer cell holds the kind's markdown, never its JSON; kindless unchanged", () => {
    const snap = snapshot();
    snap.columns[0] = {
      ...snap.columns[0],
      answer: JSON.stringify({
        __kind: "flashcard_set",
        title: "Return policy cards",
        cards: [{ __kind: "flashcard", front: "Window?", back: "30 days" }],
      }),
    };
    const rows = battleRows(snap);
    expect(String(rows[0].answer)).not.toContain("__kind");
    expect(String(rows[0].answer)).toContain("30 days");
    expect(rows[1].answer).toBe(snapshot().columns[1].answer);
  });
});
