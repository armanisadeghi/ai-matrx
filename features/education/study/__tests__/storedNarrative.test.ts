// A saved AI reading must come back exactly as it was shown. The dashboard
// saves the COERCED report (camelCase `targetKind`); reading it back through
// the wire coercer (snake_case `target_kind`) used to null every step's type,
// so after a reload every step read "General" and the quick actions vanished.
import {
  coerceNarrative,
  narrativeFingerprint,
  readStoredNarrative,
} from "../analytics/narrative";
import type { StudyAnalytics } from "../analytics/computeAnalytics";

const wire = {
  headline: "Accuracy jumped to 95%",
  insights: [{ title: "Streak", detail: "5 days", severity: "good" }],
  recommendations: [
    { action: "Review due cards", why: "32 are due", target_kind: "review", topic: null },
    { action: "Drill Krebs Cycle", why: "0% mastery", target_kind: "weak_area", topic: "Krebs Cycle" },
  ],
};

describe("stored narrative round trip", () => {
  it("keeps every step's type after save and reload", () => {
    const shown = coerceNarrative(wire);
    const saved = JSON.parse(JSON.stringify(shown));
    const reloaded = readStoredNarrative(saved);
    expect(reloaded?.recommendations.map((r) => r.targetKind)).toEqual([
      "review",
      "weak_area",
    ]);
    expect(reloaded).toEqual(shown);
  });
});

describe("narrativeFingerprint", () => {
  const base = {
    overall: { studied: 112, mastered: 17, learning: 4, struggling: 91, dueNow: 81, totalAttempts: 300, correctAttempts: 171, accuracyPct: 57, bestStreak: 9 },
    sessions: 256,
    currentStreak: 5,
    totalMinutes: 127,
  } as unknown as StudyAnalytics;

  it("does not change when an empty session is opened", () => {
    const withEmptySession = { ...base, sessions: 257, totalMinutes: 128 } as StudyAnalytics;
    expect(narrativeFingerprint(withEmptySession)).toBe(narrativeFingerprint(base));
  });
  it("changes when an answer is recorded", () => {
    const answered = {
      ...base,
      overall: { ...base.overall, totalAttempts: 301, correctAttempts: 172 },
    } as StudyAnalytics;
    expect(narrativeFingerprint(answered)).not.toBe(narrativeFingerprint(base));
  });
});
