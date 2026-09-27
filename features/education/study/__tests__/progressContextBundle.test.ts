// The Progress page's agent context stays one compact XML overview inside the
// broad-page budget (~2,000-3,000 chars) and names topics as a person reads them.
import { buildProgressOverviewXml } from "../analytics/progressContextBundle";
import type { StudyAnalytics } from "../analytics/computeAnalytics";

const stat = { studied: 112, mastered: 17, learning: 4, struggling: 91, dueNow: 81, totalAttempts: 300, correctAttempts: 171, accuracyPct: 57, bestStreak: 9 };

const analytics = {
  overall: stat,
  byMode: [
    { ...stat, itemType: "fc_card", label: "Flashcards" },
    { ...stat, itemType: "assessment_item", label: "Quiz & test questions" },
    { ...stat, itemType: "graded_work", label: "Graded work" },
    { ...stat, itemType: "spoken", label: "Spoken practice" },
  ],
  weakTopics: Array.from({ length: 25 }, (_, i) => ({
    topic: i === 0 ? "Biology::Cell Structure" : `topic-number-${i}`,
    count: 2,
    masteryPct: i * 4,
    struggling: 1,
  })),
  totalMinutes: 127,
  sessions: 256,
  currentStreak: 5,
  trend: { direction: "improving", recentPct: 95, priorPct: 67, weeks: 4 },
  hasData: true,
} as unknown as StudyAnalytics;

describe("buildProgressOverviewXml", () => {
  const xml = buildProgressOverviewXml({
    analytics,
    narrative: {
      headline: "Recent accuracy jumped to 95%",
      insights: [],
      recommendations: Array.from({ length: 6 }, (_, i) => ({
        action: `Drill weak topic ${i}`,
        why: "It causes the most misses",
        targetKind: "weak_area",
        topic: `topic-number-${i}`,
      })),
    },
    gain: {
      pairs: [
        { subject: "bio", subjectLabel: "Biology", baseline: { score: 0.2 }, post: { score: 0.89 }, delta: 0.69, normalizedGain: 0.86 },
      ],
      overallDelta: 0.69,
      overallNormalizedGain: 0.86,
      contractPending: false,
      isSeed: false,
    },
    weekly: Array.from({ length: 8 }, (_, i) => ({
      week: `W${i}`,
      week_start: `2026-08-0${i + 1}`,
      graded_answers: i % 3 ? 0 : 12,
      accuracy_pct: i % 3 ? null : 70,
      minutes: i * 2,
    })),
  } as unknown as Parameters<typeof buildProgressOverviewXml>[0]);

  it("fits the broad-page budget", () => {
    expect(xml.length).toBeLessThanOrEqual(3000);
  });
  it("counts what it cut", () => {
    expect(xml).toMatch(/<flashcard_topics [^>]*total="25"/);
    expect(xml).not.toMatch(/<flashcard_topics [^>]*shown=/);
    expect(xml).toContain('<recommendations total="6" shown="3">');
  });
  it("shows topic names, keeping the raw key only when it differs", () => {
    expect(xml).toContain('n="Cell Structure" k="Biology::Cell Structure"');
  });
  it("carries the weekly series and each learning-gain subject", () => {
    expect(xml).toMatch(/<weeks [^>]*total="8">/);
    expect(xml).toContain('<subject name="Biology" pre_pct="20" post_pct="89" gain_pts="69"/>');
  });
});
