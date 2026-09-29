/**
 * Media desk screens: the clip view (clean, imperfect, client absent), the
 * headline view (pick per format, over-limit subject lines), the progress words
 * and the gallery's narrowing of stored result documents.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
jest.mock("@ai-matrx/media/react", () => ({
  InlineMediaRef: ({ alt }: { alt?: string }) => <img alt={alt} />,
}));
jest.mock("@/components/agent-copy/CopyButtons", () => ({ CopyButtons: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => jest.fn() }));
jest.mock("@/lib/api/call-api", () => ({ callApi: jest.fn() }));

import { stageLabel, type HeadlinesResult, type MakeClipResult } from "../api";
import { ClipView } from "../ClipView";
import { readFinishedClip } from "../clips-data";
import { HeadlinesResultView } from "../HeadlinesDialog";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (node: React.ReactNode) => act(() => root.render(node));

const CLIP = {
  pdf_file_id: "pdf-1",
  preview_file_id: "pv-1",
  page_raster_file_ids: ["r1", "r2"],
  logo_source: "article_masthead",
  logo_url: "https://www.indianchemicalnews.com/assets/img/icn-logo-new.svg",
  outlet_name: "indianchemicalnews.com",
  headline: "ERI and Ecoreco join forces to launch ERI India",
  byline: "ICN Bureau",
  published_at: "September 02, 2026",
  source_url: "https://www.indianchemicalnews.com/recycling/eri-31721",
  client_found_in_text: true,
};

const finished = (imperfections: string[]): MakeClipResult => ({
  result_kind: "press.clip.make",
  status: "finished",
  source_url: CLIP.source_url,
  client_name: "ERI",
  coverage_mention_id: null,
  rounds: [{ round: 1, render: CLIP, review: { verdict: "clean" }, applied_drop: [], applied_root: null, applied_logo_url: null }],
  max_rounds: 3,
  clip: CLIP,
  imperfections,
  message: "Clip finished clean.",
});

describe("stageLabel", () => {
  it("names each clip milestone with its round", () => {
    expect(stageLabel({ kind: "seo.press_clip_rendering", round: 2 })).toBe("Rendering the article in a clean browser (round 2)");
    expect(stageLabel({ kind: "seo.press_clip_reviewed", round: 1, verdict: "has_junk", next: "rerender" })).toBe(
      "Reviewed (round 1): has junk — re-rendering with the fixes",
    );
    expect(stageLabel({ kind: "seo.something_new" })).toBeNull();
  });
});

describe("readFinishedClip", () => {
  it("keeps only finished press.clip.make documents with a PDF", () => {
    expect(readFinishedClip(finished([]))?.clip?.pdf_file_id).toBe("pdf-1");
    expect(readFinishedClip({ ...finished([]), status: "client_absent", clip: null })).toBeNull();
    expect(readFinishedClip({ result_kind: "press.headlines" })).toBeNull();
    expect(readFinishedClip(null)).toBeNull();
  });
});

describe("ClipView", () => {
  it("shows a clean clip with its PDF door and rounds", () => {
    render(<ClipView result={finished([])} />);
    expect(container.textContent).toContain("ERI and Ecoreco join forces to launch ERI India");
    expect(container.textContent).toContain("Clean: the reviewer found nothing left to fix.");
    expect(container.textContent).toContain("1 of 3 rounds");
    expect(container.querySelector('a[href="/files/f/pdf-1"]')?.textContent).toContain("Open the PDF");
  });

  it("never shows an imperfect clip as clean", () => {
    render(<ClipView result={finished(["Reviewer's note: could not open the live page."])} />);
    expect(container.querySelector('[data-testid="clip-imperfections"]')?.textContent).toContain(
      "Reviewer's note: could not open the live page.",
    );
    expect(container.textContent).not.toContain("Clean: the reviewer found nothing left to fix.");
  });

  it("says no clip was made when the client is not in the article", () => {
    render(
      <ClipView
        result={{ ...finished([]), status: "client_absent", clip: null, message: "All Green is not in this article, so no clip was made." }}
      />,
    );
    expect(container.querySelector('[data-testid="clip-client-absent"]')?.textContent).toContain(
      "All Green is not in this article, so no clip was made.",
    );
    expect(container.querySelector('a[href^="/files/f/"]')).toBeNull();
  });
});

describe("HeadlinesResultView", () => {
  const result: HeadlinesResult = {
    result_kind: "press.headlines",
    angle_id: "a1",
    formats: ["news", "subject_line"],
    facts: [{ statement: "Mobile trucks shred drives on site.", source: "page:https://allgreenrecycling.com/" }],
    groups: [
      {
        format: "news",
        candidates: [{ text: "Shredding trucks come to the parking lot", move: "picture", charge: "scale", char_count: 40, over_limit: false }],
        pick: { text: "Shredding trucks come to the parking lot", why: "The picture carries it.", char_count: 40, over_limit: false },
        limit: null,
      },
      {
        format: "subject_line",
        candidates: [
          { text: "On-site hard drive shredding", move: "consequence", charge: "promise", char_count: 28, over_limit: false },
          { text: "x".repeat(64), move: "number", charge: "scale", char_count: 64, over_limit: true },
        ],
        pick: { text: "On-site hard drive shredding", why: "Short, concrete.", char_count: 28, over_limit: false },
        limit: 60,
      },
    ],
    materials_used: [],
    next_step: "Fact check before any number ships.",
    subject_line_max_chars: 60,
    checks: ["Subject line \"xxx\" is 64 characters; the limit is 60."],
  };

  it("shows the pick per format, the counts against the limit and the next step", () => {
    const used: string[] = [];
    render(<HeadlinesResultView result={result} onUse={(text) => used.push(text)} />);
    const subject = container.querySelector('[data-testid="headline-group-subject_line"]')!;
    expect(subject.textContent).toContain("Pitch subject line");
    expect(subject.textContent).toContain("60 characters or fewer");
    expect(subject.textContent).toContain("Pick");
    expect(subject.textContent).toContain("64");
    expect(container.querySelector('[data-testid="headline-group-news"]')?.textContent).toContain("The picture carries it.");
    expect(container.textContent).toContain("is 64 characters; the limit is 60.");
    expect(container.textContent).toContain("Fact check before any number ships.");
    const useButton = Array.from(subject.querySelectorAll("button")).find((b) => b.textContent?.includes("Use this"))!;
    act(() => useButton.click());
    expect(used).toEqual(["On-site hard drive shredding"]);
  });
});
