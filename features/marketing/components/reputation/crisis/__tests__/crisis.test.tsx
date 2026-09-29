/**
 * Crisis holding statement: the brand prefill, the intake wire shape, the
 * validity clock, the stop block with "Draft for counsel anyway", and the
 * watermarked set with its code-computed valid-until.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/crm/pitch-advisories/usePitchAdvisories", () => ({
  usePitchAdvisories: jest.fn(() => ({ report: null, loading: false, error: null, retry: jest.fn(), recordGoAhead: jest.fn() })),
}));
jest.mock("@/features/crm/pitch-advisories/PitchAdvisoryPanel", () => ({
  PitchAdvisoryPanel: ({ actionLabel }: { actionLabel: string }) => <div data-testid="advisory-panel">{actionLabel}</div>,
}));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), warning: jest.fn() } }));
jest.mock("@/features/marketing/monitor-setup/data", () => ({
  isSpokesperson: (f: { kind: string }) => f.kind === "spokesperson",
  factText: (f: { value: { name?: string; title?: string } }) =>
    f.value.title ? `${f.value.name} — ${f.value.title}` : String(f.value.name ?? ""),
}));

import { usePitchAdvisories } from "@/features/crm/pitch-advisories/usePitchAdvisories";
import type { CrisisHoldingResult } from "@/features/marketing/pr/media-desk/api";
import type { BusinessFact } from "@/features/marketing/types";
import { brandPrefill, emptyIntake, missingIntake, toWire, validity } from "../crisis-intake";
import { CrisisHoldingView } from "../CrisisHoldingView";

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

const fact = (kind: string, value: Record<string, string>) => ({ kind, value, deleted_at: null }) as unknown as BusinessFact;

describe("intake", () => {
  it("prefills the org name (legal name first), spokesperson and press contact from the brand", () => {
    const pre = brandPrefill("All Green", [
      fact("legal_name", { text: "All Green Electronics Recycling" }),
      fact("spokesperson", { name: "Armani Sadeghi", title: "CEO" }),
      fact("email", { text: "press@allgreenrecycling.com" }),
      fact("phone", { text: "949-000-0000" }),
    ]);
    expect(pre).toEqual({
      org_name: "All Green Electronics Recycling",
      spokesperson: "Armani Sadeghi — CEO",
      press_contact: "press@allgreenrecycling.com · 949-000-0000",
    });
    expect(brandPrefill("All Green", []).org_name).toBe("All Green");
  });

  it("names what is missing without blocking, and sends ISO time and only named people", () => {
    const form = emptyIntake(brandPrefill("All Green", []), new Date("2026-09-28T15:30:00"));
    expect(missingIntake(form)).toEqual(["what happened", "your role", "what is confirmed", "what is not yet known", "what has been done"]);
    const wire = toWire({
      ...form,
      incident_summary: " drive resold ",
      people_involved: [{ name: "", role: "", consented: false }, { name: "Pat", role: "driver", consented: false }],
    });
    expect(wire.incident_summary).toBe("drive resold");
    expect(wire.first_known_at).toBe(new Date("2026-09-28T15:30:00").toISOString());
    expect(wire.people_involved).toEqual([{ name: "Pat", role: "driver", consented: false }]);
    expect(wire.legal_status).toBe("no_counsel");
    expect(wire.actions_committed).toBeNull();
  });

  it("counts validity down and says do not reuse once expired", () => {
    const until = "2026-09-28T20:00:00Z";
    expect(validity(until, Date.parse("2026-09-28T16:02:00Z")).text).toBe("valid for 3h 58m more");
    const past = validity(until, Date.parse("2026-09-28T20:12:00Z"));
    expect(past.expired).toBe(true);
    expect(past.text).toContain("Do not reuse this draft.");
  });
});

const BASE: CrisisHoldingResult = {
  result_kind: "reputation.crisis_holding",
  org_name: "All Green Electronics Recycling",
  counsel_review_mode: false,
  legal_status: "no_counsel",
  gate: {
    fired: true,
    stopped: true,
    triggers: [
      { trigger: "incident type: Data security", field: "incident_type", source: "code" },
      { trigger: "the facts mention customer's data", field: "known_facts", source: "code" },
    ],
  },
  stop_block: {
    text: null,
    why: "A holding statement issued before counsel reviews can become an admission, a waiver, or evidence in a later action.",
    on_record_line: "We are aware of the situation and are reviewing. We'll have more to share shortly.",
    next_steps: ["Page counsel now.", 'Never say "no comment".'],
  },
  banner: null,
  cluster: null,
  strategy: null,
  short: null,
  medium: null,
  cautious: null,
  qa: [],
  do_not_say: [],
  decay: {
    issued_at: "2026-09-28T16:00:00+00:00",
    valid_until: "2026-09-28T20:00:00+00:00",
    rule: "default window (240 min)",
    rules_considered: ["default window (240 min)"],
    refresh_triggers: [],
  },
  refusals: [],
  checks: [],
};

describe("CrisisHoldingView", () => {
  it("shows the stop block by default when a trigger fires with no counsel, and Draft for counsel anyway calls back", () => {
    const onDraft = jest.fn();
    act(() => root.render(<CrisisHoldingView result={BASE} organizationId="org" onDraftAnyway={onDraft} drafting={false} />));
    const stop = container.querySelector('[data-testid="crisis-stop-block"]')!;
    expect(stop.textContent).toContain("Stop: page counsel before anything goes out");
    expect(stop.textContent).toContain("incident type: Data security");
    expect(stop.textContent).toContain("We are aware of the situation and are reviewing. We'll have more to share shortly.");
    expect(container.querySelector('[data-testid="crisis-statement-short"]')).toBeNull();
    act(() => (container.querySelector('[data-testid="draft-for-counsel"]') as HTMLButtonElement).click());
    expect(onDraft).toHaveBeenCalledTimes(1);
  });

  it("renders the watermarked set with word counts, what not to say, the valid-until and the send step's advisories", () => {
    const banner = "DRAFT - NOT FOR PUBLICATION - FOR COUNSEL REVIEW ONLY - 2026-09-28T16:00+00:00";
    const set: CrisisHoldingResult = {
      ...BASE,
      counsel_review_mode: true,
      gate: { ...BASE.gate, stopped: false },
      stop_block: null,
      banner,
      short: { text: "We are aware of a report about a drive we collected. We are reviewing it.", words: 15, notes: [] },
      medium: { text: "Medium text.", words: 2, notes: ["2 words; the target is 100 to 140."] },
      cautious: { text: "Cautious text.", words: 2, notes: [], deltas: ["appears to have"] },
      qa: [{ category: "facts", question: "Was the drive destroyed?", posture: "deflect", line: "We are confirming that now." }],
      do_not_say: [{ phrase: "isolated incident", reason: "Not known.", rewrite: "We are reviewing." }],
    };
    act(() => root.render(<CrisisHoldingView result={set} organizationId="org" onDraftAnyway={jest.fn()} drafting={false} />));
    expect(container.querySelectorAll('[data-testid="counsel-watermark"]')).toHaveLength(3);
    expect(container.querySelector('[data-testid="crisis-statement-short"]')?.textContent).toContain("15 words");
    expect(container.querySelector('[data-testid="crisis-statement-medium"]')?.textContent).toContain("the target is 100 to 140");
    expect(container.querySelector('[data-testid="crisis-do-not-say"]')?.textContent).toContain("isolated incident");
    expect(container.querySelector('[data-testid="crisis-qa"]')?.textContent).toContain("Was the drive destroyed?");
    expect(container.querySelector('[data-testid="crisis-valid-until"]')?.textContent).toBe(
      new Date("2026-09-28T20:00:00+00:00").toLocaleString(),
    );
    const send = Array.from(container.querySelectorAll('[data-testid="crisis-statement-short"] button')).find((b) =>
      b.textContent?.includes("Send to press"),
    ) as HTMLButtonElement;
    act(() => send.click());
    expect(container.querySelector('[data-testid="advisory-panel"]')?.textContent).toBe("sending this statement");
    expect(usePitchAdvisories).toHaveBeenLastCalledWith("org", expect.objectContaining({ surface: "crisis_publish", body: `${banner}\n\nWe are aware of a report about a drive we collected. We are reviewing it.` }));
  });
});
