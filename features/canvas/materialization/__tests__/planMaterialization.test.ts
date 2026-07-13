/**
 * planMaterialization — structured (kind-IR) detection + invariants (Track 2B).
 *
 * PURE module (no I/O), so it runs directly: fixtures go through the real
 * splitter (which attaches metadata.__ir envelopes for complete JSON regions
 * under the dev/test flag) and the plan is asserted structurally.
 */

import { KIND_KEY } from "@/features/content-ir/core/kind-schema.types";
import type { CxContentBlock } from "@/features/public-chat/types/cx-tables";
import { planMaterialization } from "../planMaterialization";

const textBlock = (text: string): CxContentBlock =>
  ({ type: "text", text }) as CxContentBlock;

const KIND_SET = {
  [KIND_KEY]: "flashcard_set",
  title: "Cell Biology",
  cards: [
    { [KIND_KEY]: "flashcard", front: "Q1", back: "A1", tags: ["bio"] },
    { [KIND_KEY]: "flashcard", front: "Q2", back: "A2" },
  ],
};

describe("planMaterialization — structured kind detection", () => {
  it("plans a fenced JSON flashcard_set as a STRUCTURED flashcards artifact", () => {
    const json = JSON.stringify(KIND_SET, null, 2);
    const plan = planMaterialization([
      textBlock(`Here are your cards:\n\n\`\`\`json\n${json}\n\`\`\`\n\nEnjoy!`),
    ]);

    expect(plan.hasChanges).toBe(true);
    expect(plan.artifacts).toHaveLength(1);
    const [a] = plan.artifacts;
    if (!a) throw new Error("expected one planned artifact");
    expect(a.canvasType).toBe("flashcards");
    expect(a.title).toBe("Cell Biology");
    expect(a.metadata).toEqual({ kind: "flashcard_set" });
    // Structured value carries the kind discriminator + all cards (zero loss).
    expect(a.structured?.[KIND_KEY]).toBe("flashcard_set");
    expect(Array.isArray(a.structured?.cards)).toBe(true);
    expect((a.structured?.cards as unknown[]).length).toBe(2);
    expect(
      (a.structured?.cards as Array<Record<string, unknown>>)[0]?.tags,
    ).toEqual(["bio"]);
    // Wire body = compact canonical JSON, parseable back to the same value.
    expect(JSON.parse(a.content)).toEqual(a.structured);
  });

  it("detects via the JSON.parse fallback when no envelope attaches (brace-heuristic miss)", () => {
    // A '{' inside a string defeats the splitter's balanced-brace envelope
    // guard — the parse fallback must still find the kind.
    const set = {
      [KIND_KEY]: "flashcard_set",
      title: "JS Syntax",
      cards: [
        { [KIND_KEY]: "flashcard", front: "What does { open in JS?", back: "A block" },
      ],
    };
    const plan = planMaterialization([
      textBlock("```json\n" + JSON.stringify(set) + "\n```"),
    ]);

    expect(plan.artifacts).toHaveLength(1);
    expect(plan.artifacts[0]?.canvasType).toBe("flashcards");
    expect(plan.artifacts[0]?.structured?.title).toBe("JS Syntax");
  });

  it("leaves JSON with an UNREGISTERED kind inline (no artifact)", () => {
    const plan = planMaterialization([
      textBlock(
        "```json\n" +
          JSON.stringify({ [KIND_KEY]: "unregistered_thing", value: 1 }) +
          "\n```",
      ),
    ]);
    expect(plan.hasChanges).toBe(false);
    expect(plan.artifacts).toHaveLength(0);
  });

  it("leaves plain (kind-less) JSON code blocks inline", () => {
    const plan = planMaterialization([
      textBlock('```json\n{"just": "data", "n": 2}\n```'),
    ]);
    expect(plan.hasChanges).toBe(false);
  });

  it("is idempotent: a materialized <artifact id=UUID> passes through untouched", () => {
    const uuid = "123e4567-e89b-42d3-a456-426614174000";
    const wire = `<artifact type="flashcards" id="${uuid}" version="1" title="Cell Biology">\n${JSON.stringify(
      KIND_SET,
    )}\n</artifact>`;
    const plan = planMaterialization([textBlock(wire)]);
    expect(plan.hasChanges).toBe(false);
    expect(plan.artifacts).toHaveLength(0);
  });

  it("converges a markdown flashcards fence to the canonical flashcard_set kind", () => {
    // The FENCE finalize hook makes a completed ```flashcards fence resolve
    // through the surface registry to flashcard_set — the fence twin of the
    // <flashcards> XML surface. planMaterialization then persists the converged
    // value as `structured` (content.data) instead of re-parsing on read.
    const plan = planMaterialization([
      textBlock("```flashcards\nFront: Q1\nBack: A1\n```"),
    ]);
    expect(plan.artifacts).toHaveLength(1);
    const [a] = plan.artifacts;
    if (!a) throw new Error("expected one planned artifact");
    expect(a.canvasType).toBe("flashcards");
    expect(a.structured).toMatchObject({
      __kind: "flashcard_set",
      cards: [{ __kind: "flashcard", front: "Q1", back: "A1" }],
    });
    // Regression pin: `</flashcards>` is the parser's completion sentinel, not
    // content — it must NEVER be glued onto the last card's answer.
    expect(JSON.stringify(a.structured)).not.toContain("</flashcards>");
  });
});
