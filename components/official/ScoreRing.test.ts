import {
  scoreAccentBgClasses,
  scoreRingColorClasses,
} from "@/components/official/ScoreRing";

describe("ScoreRing thresholds", () => {
  it("accepts domain-specific threshold tiers", () => {
    const lighthouse = { good: 90, warning: 50 };
    expect(scoreRingColorClasses(90, lighthouse)).toBe("text-green-500");
    expect(scoreRingColorClasses(89, lighthouse)).toBe("text-orange-500");
    expect(scoreAccentBgClasses(49, lighthouse)).toBe("bg-red-500");
  });
});
