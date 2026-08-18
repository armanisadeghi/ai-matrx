import type { TrustEnvelope } from "@/features/education/trust/types";
import { reconcileTurnTrust } from "./turnTrust";

const canonical = {
  sourceId: "chunk-real",
  sourceKind: "chunk" as const,
  title: "Biology chapter",
  locator: "p. 14",
  excerpt: "The exact retrieved passage.",
  fileId: "file-real",
  documentId: "doc-real",
  page: 14,
};

describe("reconcileTurnTrust", () => {
  test("replaces agent citation details with the canonical retrieved passage", () => {
    const claimed: TrustEnvelope = {
      confidence: "grounded",
      groundedIn: "student material",
      citations: [
        {
          sourceId: "chunk-real",
          sourceKind: "chunk",
          title: "Invented title",
          excerpt: "Invented excerpt",
        },
      ],
    };

    expect(reconcileTurnTrust(claimed, [canonical])).toEqual({
      ...claimed,
      citations: [canonical],
    });
  });

  test("refuses a grounded claim whose chunk id was not retrieved", () => {
    const claimed: TrustEnvelope = {
      confidence: "grounded",
      groundedIn: "student material",
      citations: [
        {
          sourceId: "chunk-fabricated",
          sourceKind: "chunk",
        },
      ],
    };

    expect(reconcileTurnTrust(claimed, [canonical])).toEqual({
      confidence: "not_in_material",
      groundedIn: "student material",
      citations: [],
    });
  });

  test("does not let seed or weak-card context authorize grounded", () => {
    const claimed: TrustEnvelope = {
      confidence: "grounded",
      groundedIn: "student material",
      citations: [{ sourceId: "card-1", sourceKind: "fc_card" }],
    };

    expect(
      reconcileTurnTrust(claimed, [
        {
          sourceId: "card-1",
          sourceKind: "fc_card",
          title: "Current card",
        },
      ]),
    ).toEqual({
      confidence: "not_in_material",
      groundedIn: "student material",
      citations: [],
    });
  });
});
