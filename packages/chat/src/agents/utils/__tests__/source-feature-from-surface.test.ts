import { sourceFeatureFromSurfaceName } from "@/features/agents/utils/source-feature-from-surface";

describe.each([
  ["header launcher", "matrx-user/legal-ca-wc", "legal"],
  ["role launcher", "matrx-user/barcode-preview", "print"],
  ["binding-suggestion launcher", "matrx-user/markdown-pdf", "print"],
  [
    "flashcard-set surface",
    "matrx-user/education-flashcard-set",
    "education-flashcards",
  ],
  [
    "model battle surface",
    "matrx-user/agent-comparison-model",
    "agent-comparison",
  ],
] as const)(
  "sourceFeatureFromSurfaceName for the %s",
  (_consumer, surfaceName, expected) => {
    it(`attributes ${surfaceName} to ${expected}`, () => {
      expect(sourceFeatureFromSurfaceName(surfaceName)).toBe(expected);
    });
  },
);
