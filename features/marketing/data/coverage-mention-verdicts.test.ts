/**
 * False "stories about you" (acceptance 2026-09-29, tracker 03dddca8 — All Green Recycling).
 *
 * The rows below are the REAL stored rows as they were before the fix: the analyst had already
 * called them wrong_entity / junk / uncertain (or not judged them yet), but the coverage view
 * ignored the verdict, so it showed "33 stories about you", share of voice 100%, and sentences
 * like "You get a passing mention on inkl.com" for a Giorgio Armani story.
 *
 * Breaks these tests name: a not-a-mention verdict counted in share of voice or the tiles; a
 * wrong-entity / junk row phrased as a mention of you.
 */

import {
  shareOfVoice,
  summarize,
} from "@/features/marketing/data/coverage-queries";
import {
  COUNTS_AS_MENTION_FILTER,
  countsAsMention,
  type CoverageMentionRow,
} from "@/features/marketing/data/coverage-types";
import { coverageVerdict } from "@/features/marketing/components/backlinks/lib/coverage";

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/utils/supabase/webDb", () => ({
  requireAuthenticatedSupabaseSession: jest.fn(),
}));

type Live = Partial<CoverageMentionRow> &
  Pick<CoverageMentionRow, "id" | "domain" | "title" | "verdict">;

function row(live: Live): CoverageMentionRow {
  return {
    is_competitor: false,
    competitor_key: null,
    links_to_site: false,
    capture_status: "captured",
    analyzed_at: "2026-09-28T23:10:09Z",
    prominence: "passing",
    sentiment: "neutral",
    hit_score: 25,
    hit_reason: "Scored 25 of 100 because it is in the passing, the tone toward you is neutral.",
    outcome_event_id: null,
    author_name: null,
    verdict_reason: null,
    ...live,
  } as CoverageMentionRow;
}

const LIVE: CoverageMentionRow[] = [
  row({
    id: "d4072535-4ae5-4601-8bf9-065815518d6e",
    domain: "inkl.com",
    title: "Giorgio Armani's Heirs Must Sell 15% of His Empire…",
    verdict: "wrong_entity",
    verdict_reason:
      "The page is about fashion designer Giorgio Armani's estate rather than the electronics recycler.",
  }),
  row({
    id: "ff5eca22-e13a-42bf-9172-af177a372598",
    domain: "mmasucka.com",
    title: "Tony Ferguson Claims Teaching Arman Tsarukyan… | MMA Sucka",
    verdict: "wrong_entity",
    verdict_reason: "The article is about MMA fighter Arman Tsarukyan rather than the electronics recycler.",
  }),
  row({
    id: "0b74bb72-f3b2-42da-881c-d7bbdcece672",
    domain: "alcircle.com",
    title: "Aluminium cans take recycling lead at 76%: How far is industry’s 80% aim by 2030?",
    verdict: "wrong_entity",
    verdict_reason: "The article focuses entirely on aluminium beverage container recycling rates.",
  }),
  row({
    id: "685ccdc1-2b27-4ee2-a7de-c95e741fc96d",
    domain: "mdpi.com",
    title: "Access Denied",
    verdict: "junk",
    verdict_reason:
      "blocked_page: the site answered HTTP 403, so what we captured is its error or access page, not the article",
  }),
  row({
    id: "a002ef51-a507-417b-b1c8-32f732453777",
    domain: "forbes.com",
    title: "Justin Gaethje on Ilia Topuria Quit Narrative and Arman Tsarukyan Next",
    verdict: "uncertain",
    verdict_reason: "capture_unavailable",
    capture_status: "failed",
    analyzed_at: null,
    prominence: null,
    sentiment: null,
    hit_score: null,
  }),
];

describe("coverage counts only real mentions", () => {
  it("never counts a wrong-entity, junk or unconfirmed row in share of voice", () => {
    const share = shareOfVoice(LIVE, "all-green-recycling");
    expect(share.totalMentions).toBe(0);
    expect(share.brandSharePct).toBe(0);
  });

  it("counts a real mention beside them, and a rival's unread row", () => {
    const real = row({
      id: "real",
      domain: "example.com",
      title: "All Green Recycling opens a new plant",
      verdict: "passing_mention",
    });
    const rival = row({
      id: "rival",
      domain: "rival.example",
      title: "Rival news",
      verdict: null,
      is_competitor: true,
      competitor_key: "rival",
    });
    const share = shareOfVoice([...LIVE, real, rival], "all-green-recycling");
    expect(share.totalMentions).toBe(2);
    expect(share.brandSharePct).toBe(50);
  });

  it("the Stories-about-you tile counts nothing false and says how many were not about you", () => {
    const summary = summarize(LIVE);
    expect(summary.brandMentions).toBe(0);
    expect(summary.notAboutYou).toBe(4);
    expect(summary.unconfirmed).toBe(1);
    expect(summary.avgHitScore).toBeNull();
  });

  it("uses one definition for the database filter and the in-memory predicate", () => {
    expect(COUNTS_AS_MENTION_FILTER).toBe(
      "verdict.is.null,verdict.not.in.(wrong_entity,junk,uncertain)",
    );
    expect(LIVE.filter(countsAsMention)).toHaveLength(0);
  });
});

describe("a row that is not about you never reads as a mention of you", () => {
  it.each(LIVE.map((r) => [r.title, r] as const))("%s", (_title, r) => {
    const verdict = coverageVerdict(r);
    expect(verdict.headline).not.toMatch(/passing mention|You are|wrote about you/);
    expect(verdict.headline).toMatch(/^(Not about you|Not a story|Not confirmed)/);
    expect(verdict.tone).toBe("default");
  });

  it("states the reason as a sentence, without the rule code", () => {
    const junk = coverageVerdict(LIVE[3]);
    expect(junk.detail).toContain("The site answered HTTP 403");
    expect(junk.detail).not.toContain("blocked_page:");
  });
});
