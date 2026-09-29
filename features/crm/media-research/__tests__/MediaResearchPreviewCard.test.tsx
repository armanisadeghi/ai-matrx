/**
 * The media-list research preview: before anything is spent the person sees the
 * multiplier and why, the exact brief, the target and the maximum cost; over
 * the cap a strong warning offers the smaller runs — and "Run it" stays live.
 * Every expected string is typed by hand.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/crm/pitch-advisories/MandateOffer", () => ({
  MandateOffer: ({ offer }: { offer: { label: string } }) => <button type="button">{offer.label}</button>,
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { MediaResearchPreviewCard } from "../MediaResearchPreviewCard";
import type { MediaResearchPreview } from "../service";

const BRIEF =
  "Story: retired AI data-center hardware is a data-security problem\nWanted: 5 good fits (research pool 50). Every fit needs a dated article of theirs; never pad to the number.";

const NARROW: MediaResearchPreview = {
  list_id: "list-1",
  angle: "retired AI data-center hardware is a data-security problem",
  wanted_good_fits: 5,
  multiplier: 10,
  multiplier_reason: "10x because this is a narrow search (ITAD only): far fewer of the journalists we find will truly fit.",
  computed_target: 50,
  research_target: 50,
  cap: 200,
  over_cap: false,
  advisories: [],
  brief: BRIEF,
  brief_chars: BRIEF.length,
  brief_max_chars: 2000,
  queries: ["retired AI data-center hardware is a data-security problem"],
  first_wave_size: 8,
  cost: {
    searches: 1,
    article_reads: 8,
    candidates: 50,
    contact_lookups: 8,
    fit_checks: 8,
    max_cost_usd: 0.84,
    lines: ["1 news searches at up to $0.010 each"],
  },
  run_key: "mlr_abc",
  prior_run: null,
  says: "5 good fits x 10 = research 50 journalists, for at most $0.84. Nothing is spent until you press Run it.",
};

const OVER_CAP: MediaResearchPreview = {
  ...NARROW,
  wanted_good_fits: 300,
  multiplier: 5,
  multiplier_reason: "5x, the default: you asked for 300 good fits, and most researched journalists are cut.",
  computed_target: 1500,
  research_target: 1500,
  over_cap: true,
  cost: { ...NARROW.cost, candidates: 1500, max_cost_usd: 8.34 },
  advisories: [
    {
      rule: "E3",
      code: "research_target_strong_warn",
      severity: "strong",
      message:
        "You're asking to research 1500 journalists. That's mail merge, not outreach — past 200, one pitch fits almost none of them. Narrow the campaign rather than widening the list.",
      offer: { label: "Run at the cap (200)", action: "limit_to", detail: { count: 200 } },
      other_offers: [
        {
          label: "Split by beat into separate angles",
          action: "split_angles",
          detail: { angles: [{ angle: "recycling — e-waste", wanted_good_fits: 40 }] },
        },
      ],
      knob: "pr.recipients_strong_warn_at",
      evidence: {},
    },
  ],
};

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

function q(testId: string): HTMLElement {
  const el = container.querySelector(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`missing ${testId}`);
  return el as HTMLElement;
}

test("shows the multiplier and why, the brief, the target and the maximum cost before anything runs", () => {
  const onRun = jest.fn();
  act(() => root.render(<MediaResearchPreviewCard preview={NARROW} onRun={onRun} />));
  expect(q("media-research-multiplier").textContent).toBe("10x");
  expect(q("media-research-multiplier-reason").textContent).toBe(
    "10x because this is a narrow search (ITAD only): far fewer of the journalists we find will truly fit.",
  );
  expect(q("media-research-target").textContent).toBe("50");
  expect(q("media-research-max-cost").textContent).toBe("$0.84");
  expect(q("media-research-brief").textContent).toBe(BRIEF);
  expect(container.textContent).toContain("Nothing is spent until you press Run it.");
  expect(container.querySelector('[data-testid="pitch-advisories"]')).toBeNull();
  expect(onRun).not.toHaveBeenCalled();
  const run = q("media-research-run") as HTMLButtonElement;
  expect(run.textContent).toBe("Run it");
  act(() => run.click());
  expect(onRun).toHaveBeenCalledTimes(1);
});

test("over the cap: a strong warning with both smaller offers, and Run it still runs as asked", () => {
  const onRun = jest.fn();
  const onOffer = jest.fn();
  act(() => root.render(<MediaResearchPreviewCard preview={OVER_CAP} onRun={onRun} onOffer={onOffer} />));
  const warning = container.querySelector('[data-rule="E3"]');
  expect(warning?.getAttribute("data-severity")).toBe("strong");
  expect(warning?.textContent).toContain("You're asking to research 1500 journalists.");
  const buttons = Array.from(container.querySelectorAll("button")).map((b) => b.textContent);
  expect(buttons).toContain("Run at the cap (200)");
  expect(buttons).toContain("Split by beat into separate angles");
  const cap = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Run at the cap (200)")!;
  act(() => cap.click());
  expect(onOffer).toHaveBeenCalledWith(expect.objectContaining({ action: "limit_to", detail: { count: 200 } }));
  const run = q("media-research-run") as HTMLButtonElement;
  expect(run.disabled).toBe(false);
  expect(run.textContent).toBe("Run it at 1500 anyway");
  act(() => run.click());
  expect(onRun).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("None of these stop you");
});
