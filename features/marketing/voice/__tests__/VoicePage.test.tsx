/**
 * The Voice page: pick samples → measure → triage → confirm the high-risk fields →
 * Fix voice shows the loop's outcome, including the failure header. Every expected
 * string is typed by hand.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
jest.mock("@/features/sources/api/sourcesApi", () => ({
  sourceHref: (id: string) => `/sources/${id}`,
}));

const listFingerprints = jest.fn();
const searchSources = jest.fn();
const measureVoice = jest.fn();
const confirmVoice = jest.fn();
const fixVoice = jest.fn();

jest.mock("../service", () => {
  const actual = jest.requireActual("../service");
  return {
    ...actual,
    listFingerprints: (...a: unknown[]) => listFingerprints(...a),
    searchSources: (...a: unknown[]) => searchSources(...a),
    measureVoice: (...a: unknown[]) => measureVoice(...a),
    confirmVoice: (...a: unknown[]) => confirmVoice(...a),
    fixVoice: (...a: unknown[]) => fixVoice(...a),
  };
});
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/api/typed-client", () => ({ apiPost: jest.fn(), buildPath: jest.fn() }));

import { VoicePage } from "../VoicePage";

const SOURCES = Array.from({ length: 6 }, (_, i) => ({
  id: `s${i}`,
  name: `Email ${i + 1}`,
  created_at: "2026-09-20T00:00:00Z",
}));

const DRAFT_ROW = {
  id: "fp-draft",
  label: "brand-1c71e366",
  status: "draft",
  confidence: "low",
  register_label: "professional",
  sample_count: 6,
  sample_word_count: 1480,
  last_extracted_at: "2026-09-28T10:00:00Z",
  refresh_due_at: "2026-12-27T10:00:00Z",
  confirmed_at: null,
  fingerprint: {
    mechanics: { em_dash_usage: "never" },
    openers: { observed: ["Quick one:"] },
    closers: { observed: ["Want a look?"] },
    idioms: { signature_phrases: ["ship it"], signature_words: [] },
    global_words_in_samples: ["robust"],
    register_label: "professional",
  },
};
const CONFIRMED_ROW = { ...DRAFT_ROW, id: "fp-ok", status: "confirmed", confirmed_at: "2026-09-28T11:00:00Z" };

let container: HTMLDivElement;
let root: Root;

async function flush(ms = 300) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function text(): string {
  return container.textContent ?? "";
}

function byLabel(label: string): HTMLElement {
  const el = container.querySelector(`[aria-label="${label}"]`);
  if (!el) throw new Error(`no element labelled ${label}`);
  return el as HTMLElement;
}

function button(name: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(name));
  if (!found) throw new Error(`no button ${name}`);
  return found as HTMLButtonElement;
}

function setValue(el: HTMLElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLTextAreaElement ? "input" : "change", { bubbles: true }));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  searchSources.mockResolvedValue(SOURCES);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

test("measuring needs five samples, then shows the triage and the confirm step", async () => {
  listFingerprints.mockResolvedValueOnce([]).mockResolvedValue([DRAFT_ROW]);
  measureVoice.mockResolvedValue({
    action: "extract",
    fingerprint_id: "fp-draft",
    triage: {
      sample_count: 6,
      total_words: 1480,
      ai_tell_share: 0.5,
      register_split: false,
      confidence: "low",
      warnings: ["More than 30% of the samples show AI tells; extracting at low confidence."],
    },
  });
  await act(async () => {
    root.render(<VoicePage scope="brand" ownerId="b1" ownerName="Factory Playground" organizationId="org1" />);
  });
  await flush();
  expect(text()).toContain("No voice measured yet.");
  expect(button("Measure voice").disabled).toBe(true);

  for (const s of SOURCES.slice(0, 4)) {
    await act(async () => byLabel(`Use ${s.name}`).click());
  }
  expect(text()).toContain("4 of 5–20 picked — pick 1 more to measure");
  expect(button("Measure voice").disabled).toBe(true);
  await act(async () => byLabel("Use Email 5").click());
  await act(async () => setValue(byLabel("Kind of Email 5"), "email"));
  expect(button("Measure voice").disabled).toBe(false);

  await act(async () => button("Measure voice").click());
  await flush();
  expect(measureVoice).toHaveBeenCalledWith("org1", "brand", "b1", [
    { source_id: "s0", source: "other" },
    { source_id: "s1", source: "other" },
    { source_id: "s2", source: "other" },
    { source_id: "s3", source: "other" },
    { source_id: "s4", source: "email" },
  ]);
  const triage = container.querySelector('[data-testid="voice-triage"]')!.textContent!;
  expect(triage).toContain("Samples6");
  expect(triage).toContain("Words1,480");
  expect(triage).toContain("AI-edited share50%");
  expect(triage).toContain("RegisterOne register");
  expect(triage).toContain("Confidencelow");
  expect(triage).toContain("More than 30% of the samples show AI tells");
  expect(text()).toContain("Needs your confirmation");
  expect(text()).toContain("Refresh due Dec 27, 2026");
  expect(text()).toContain("Confirm before it is used");
});

test("confirming sends the person's choices and shows the brand's new voice line", async () => {
  listFingerprints.mockResolvedValueOnce([DRAFT_ROW]).mockResolvedValue([CONFIRMED_ROW, DRAFT_ROW]);
  confirmVoice.mockResolvedValue({
    fingerprint_id: "fp-draft",
    status: "confirmed",
    summary_line: "Professional voice; mixed sentence lengths of about 14 words per sentence (5 to 26).",
    block: "<voice_fingerprint>",
    voice_tone_updated: true,
  });
  await act(async () => {
    root.render(<VoicePage scope="brand" ownerId="b1" ownerName="Factory Playground" organizationId="org1" />);
  });
  await flush();
  await act(async () => setValue(byLabel("Em dashes"), "rare"));
  expect(text()).toContain("The samples never use one; allowing them is the most common way a draft reads as AI.");
  const robust = Array.from(container.querySelectorAll("label")).find((l) => l.textContent === "robust")!;
  await act(async () => (robust.querySelector("input") as HTMLInputElement).click());
  await act(async () => button("Save voice").click());
  await flush();
  expect(confirmVoice).toHaveBeenCalledWith("org1", "fp-draft", {
    em_dash_usage: "rare",
    openers: ["Quick one:"],
    closers: ["Want a look?"],
    signature_phrases: [],
    banned_words_allowed: ["robust"],
    register_label: "professional",
  });
  expect(container.querySelector('[data-testid="voice-saved"]')!.textContent).toBe(
    "Saved. The brand's voice line now reads: Professional voice; mixed sentence lengths of about 14 words per sentence (5 to 26).",
  );
  // The older draft under the newer confirmed voice is history, not a second question.
  expect(text()).not.toContain("Confirm before it is used");
  expect(text()).toContain("Fix a draft's voice");
});

test("Fix voice shows a fixed draft and a draft returned with the failure header", async () => {
  listFingerprints.mockResolvedValue([CONFIRMED_ROW]);
  await act(async () => {
    root.render(<VoicePage scope="brand" ownerId="b1" ownerName="Factory Playground" organizationId="org1" />);
  });
  await flush();
  expect(text()).toContain("Confirmed");
  expect(button("Fix voice").disabled).toBe(true);
  expect(text()).toContain("Paste a draft to check it.");

  fixVoice.mockResolvedValueOnce({
    field: "",
    status: "fixed",
    retries: 1,
    initial_tells: ["furthermore-moreover-additionally"],
    tells: [],
    header: null,
    text: "Every drive was wiped on site.",
    rounds: [{ attempt: 1, tells_before: ["furthermore-moreover-additionally"], changes: [{ rule_id: "x" }], unfixable: [], error: null }],
  });
  await act(async () => setValue(byLabel("Draft"), "Additionally, every drive was wiped on site."));
  await act(async () => button("Fix voice").click());
  await flush();
  expect(fixVoice).toHaveBeenCalledWith("org1", "fp-ok", "Additionally, every drive was wiped on site.", "pitch");
  let outcome = container.querySelector('[data-testid="voice-outcome"]')!.textContent!;
  expect(outcome).toContain("Fixed in 1 rewrite.");
  expect(outcome).toContain("Tells found: furthermore-moreover-additionally");
  expect(outcome).toContain("Rewrite 1: 1 change(s)");
  expect(outcome).toContain("Every drive was wiped on site.");

  const header =
    "Voice check failed after 2 retries. Tells: stray-placeholder. Returning draft anyway; review before send.";
  fixVoice.mockResolvedValueOnce({
    field: "",
    status: "failed",
    retries: 2,
    initial_tells: ["stray-placeholder"],
    tells: ["stray-placeholder"],
    header,
    text: `${header}\n\nOur spokesperson [Spokesperson Name] can talk.`,
    rounds: [
      { attempt: 1, tells_before: ["stray-placeholder"], changes: [], unfixable: [{ rule_id: "stray-placeholder", why: "needs the name" }], error: null },
      { attempt: 2, tells_before: ["stray-placeholder"], changes: [], unfixable: [{ rule_id: "stray-placeholder", why: "needs the name" }], error: null },
    ],
  });
  await act(async () => setValue(byLabel("Draft"), "Our spokesperson [Spokesperson Name] can talk."));
  await act(async () => button("Fix voice").click());
  await flush();
  outcome = container.querySelector('[data-testid="voice-outcome"]')!.textContent!;
  expect(outcome).toContain("Still fails after the allowed rewrites; returned anyway for you to review.");
  expect(outcome).toContain("Rewrite 2: 0 change(s); could not fix stray-placeholder");
  expect(outcome).toContain(header);
});
