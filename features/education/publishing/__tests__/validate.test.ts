import {
  parseSectionsJson,
  validateAuthoredSections,
  validateSectionsValue,
} from "../validate";

describe("learn-doc section validation", () => {
  it("rejects the blank-rendering FAQ shape before save", () => {
    const malformed = [
      {
        kind: "faq",
        items: [{ question: "What is mitosis?", answer: "Cell division." }],
      },
    ];

    expect(validateSectionsValue(malformed).ok).toBe(true);
    const result = validateAuthoredSections(malformed);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('needs a text "q" field');
    expect(result.error).toContain('"question"');
    expect(result.error).toContain('"answer"');
  });

  it("accepts every renderer-supported section kind", () => {
    const result = validateAuthoredSections([
      { kind: "prose", heading: "Overview", body: "A clear explanation." },
      {
        kind: "feature-grid",
        heading: "Concepts",
        columns: 2,
        items: [
          {
            title: "Cell",
            description: "The basic unit of life.",
            href: "/education",
          },
        ],
      },
      {
        kind: "steps",
        steps: [
          {
            number: "01",
            title: "Read",
            description: "Start with the source.",
          },
        ],
      },
      {
        kind: "status-cards",
        cards: [
          {
            title: "Ready",
            description: "Available now.",
            status: "live",
            bullets: ["Grounded"],
          },
        ],
      },
      { kind: "stat-bar", stats: [{ value: "3", label: "Core ideas" }] },
      {
        kind: "faq",
        items: [{ q: "Why?", a: "Because evidence supports it." }],
      },
      {
        kind: "cta",
        heading: "Practice now",
        primary: { label: "Open flashcards", href: "/education/flashcards" },
        secondary: { label: "Read more", href: "/education/learn" },
      },
    ]);

    expect(result.ok).toBe(true);
    expect(result.sections).toHaveLength(7);
  });

  it("rejects renderer fields with the wrong runtime type", () => {
    expect(
      validateAuthoredSections([
        { kind: "prose", body: { text: "not renderable" } },
      ]),
    ).toMatchObject({ ok: false });
    expect(
      validateAuthoredSections([
        { kind: "cta", heading: "Go", primary: { label: "Open", href: 42 } },
      ]),
    ).toMatchObject({ ok: false });
  });

  it("keeps JSON parsing separate from the strict save gate", () => {
    const parsed = parseSectionsJson(
      '[{"kind":"faq","items":[{"question":"Q","answer":"A"}]}]',
    );
    expect(parsed.ok).toBe(true);
    expect(validateAuthoredSections(parsed.sections ?? []).ok).toBe(false);
  });
});
