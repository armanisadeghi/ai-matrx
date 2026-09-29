/**
 * media_list_ranking_result / media_candidate_verdict — the media list ranker's kinds (Brief 3).
 *
 * The board must route to its compiled block, render status and why_them for every candidate the
 * moment it parses (streaming), and never crash on a half-arrived candidate.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BLOCK_DISPATCH_CLASSIFICATION,
  resolveBlockDispatch,
} from "@/components/mardown-display/chat-markdown/block-registry/block-dispatch";
import {
  MediaCandidateVerdictBlock,
  MediaListRankingBlock,
} from "@/components/mardown-display/blocks/media-list/media-list-blocks";

import {
  MEDIA_CANDIDATE_VERDICT_KIND,
  MEDIA_LIST_RANKING_KIND,
  mediaListRankingMarkdownFromValue,
} from "../kinds/media-list";
import { SYSTEM_KIND_DEFINITIONS } from "../registry/system-kinds";

const FIT = {
  __kind: "media_candidate_verdict",
  id: "c1",
  status: "fit",
  rank: 1,
  anchor: { title: "BAN paper says AI e-scrap estimates are low", url: "https://example.com/a", published_at: "2026-09-17" },
  why_them: "Wrote that AI hardware retirements are undercounted.",
  pitch_note: "Lead with his undercount story.",
  cut_reason: null,
  contact_state: "verified",
  reachability: "confirmed",
  concerns: [],
};

const CUT = {
  __kind: "media_candidate_verdict",
  id: "c4",
  status: "cut",
  rank: 0,
  anchor: null,
  why_them: "Consumer gadget reviewer.",
  pitch_note: null,
  cut_reason: "wrong_beat",
  contact_state: "quarantined",
  reachability: "candidate_only",
  concerns: ["Wrong beat."],
};

describe("media list kinds — registration", () => {
  it("are compiled in and route to their blocks as shapes", () => {
    for (const kind of [MEDIA_LIST_RANKING_KIND, MEDIA_CANDIDATE_VERDICT_KIND]) {
      const def = SYSTEM_KIND_DEFINITIONS.find((d) => d.kind === kind);
      expect(def?.legacyBlockType).toBe(kind);
      expect(resolveBlockDispatch(kind)).not.toBeNull();
      expect(BLOCK_DISPATCH_CLASSIFICATION.shape).toContain(kind);
    }
  });
});

const html = (node: React.ReactElement) => renderToStaticMarkup(node).replace(/<[^>]+>/g, "\u0001");
const has = (markup: string, textValue: string) => markup.split("\u0001").some((t) => t.includes(textValue));

describe("media list kinds — rendering", () => {
  it("shows every kept candidate's status and why_them, and hides cuts behind a toggle", () => {
    const m = html(
      <MediaListRankingBlock
        serverData={{
          value: {
            results: [FIT, CUT],
            summary: { requested: 3, research_target: 9, resolved: 2, first_wave: 1, gaps: [] },
          },
          isComplete: true,
        }}
      />,
    );
    expect(has(m, "Fit")).toBe(true);
    expect(has(m, FIT.why_them)).toBe(true);
    expect(has(m, "BAN paper says AI e-scrap estimates are low")).toBe(true);
    expect(has(m, CUT.why_them)).toBe(false);
    expect(has(m, "cut")).toBe(true);
  });

  it("renders a half-arrived candidate mid-stream without crashing", () => {
    const m = html(
      <MediaListRankingBlock
        serverData={{ value: { results: [FIT, { __kind: "media_candidate_verdict", id: "c2" }] }, isComplete: false }}
      />,
    );
    expect(has(m, FIT.why_them)).toBe(true);
    expect(has(m, "c2")).toBe(true);
  });

  it("renders the item kind on its own", () => {
    const m = html(<MediaCandidateVerdictBlock serverData={CUT} />);
    expect(has(m, CUT.why_them)).toBe(true);
    expect(has(m, "wrong beat")).toBe(true);
  });

  it("writes readable markdown with no field names", () => {
    const md = mediaListRankingMarkdownFromValue({ results: [FIT], summary: { requested: 3 } });
    expect(md).toContain("**c1** · Fit");
    expect(md).not.toContain("why_them");
  });
});
