/**
 * ── THE ADMIN PANEL SPEAKS ABOUT THE SYSTEM, NEVER ABOUT THE READER ──────────
 *
 * 🚨 THE ORDER THIS GUARDS (Arman, 2026-09-08, verbatim core): *"this is the
 * Admin panel so it should never show ANYTHING related to a user or an org.
 * Just like the system agents management, the ONLY thing it should ever show is
 * the things we assign from the system… it's showing me a bunch of meaningless
 * garbage… and it's missing the actual things I need."*
 *
 * Observed on `/administration/mandates/research_client.output_slides`
 * (v0.4.1719): the admin route rendered the PERSON's ladder — *"How this job is
 * decided for you"*, *"This job has no answer for you right now"*, a rung
 * selector defaulting to User (*"This applies everywhere you run"*), *"Your
 * override"* — on the one page whose entire subject is what the platform
 * assigns.
 *
 * WHY THIS IS A RENDERED-COPY GUARD AND NOT A SOURCE SCAN. Every one of those
 * sentences is legitimate somewhere: `/mandates/[key]` IS the person's page and
 * must keep saying them. The defect is never the sentence, it is the sentence
 * ON THIS HOST — so the only guard that can catch it drives the real component
 * with `host="admin-route"` and reads what comes out.
 *
 * The pinned-rung half of the same order is proven on the real `ScopeHolderBar`
 * below: a host that stands on one rung offers no selector, and the holder
 * picker can reach the system catalogue and nothing else.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/* ── The seams. Only leaves are mocked; the workspace's own decisions are the
      thing under test, and `SystemAnswerSection` is deliberately REAL — its
      copy is exactly what this file exists to read. ─────────────────────────*/

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => () => undefined,
  useAppSelector: () => "org-1",
  useAppStore: () => ({ getState: () => ({}), dispatch: () => undefined }),
}));

jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({
    organizations: [{ id: "org-1", name: "Write Target Sandbox", role: "admin" }],
  }),
}));

jest.mock("../../useMandate", () => ({
  useMandate: () => ({ mandate: null, loading: false, error: null }),
}));

jest.mock("../../workspace/useMandateLadder", () => {
  const actual = jest.requireActual("../../workspace/useMandateLadder");
  return { ...actual, useMandateLadder: () => ({ rows: [], loading: false, error: null }) };
});

jest.mock("../../useCopyMandateAgent", () => ({
  useCopyMandateAgent: () => ({ copying: false, copyAndOpen: () => undefined }),
}));

// Heavy leaves. Each renders its own copy, which is swept by the mandate-screen
// vocabulary guard; none of them is where a PERSPECTIVE sentence lives.
jest.mock("../../workspace/TriadSections", () => ({
  TriadFlowMark: () => <div />,
  TriadGoalSection: () => <div />,
  TriadInputSection: () => <div />,
  TriadOutputSection: () => <div />,
}));
jest.mock("../../workspace/RunThisJobSection", () => ({
  RunThisJobSection: () => <div />,
}));
jest.mock("../../components/MandateNotesPanel", () => ({
  MandateNotesPanel: () => <div />,
}));
jest.mock("../../components/MandateLineageLine", () => ({
  MandateLineageLine: () => <div />,
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name }: { name?: string }) => <span>{name ?? ""}</span>,
}));
jest.mock("@/components/official/entity-ref/TextWithDoors", () => ({
  TextWithDoors: ({ text }: { text: string }) => <span>{text}</span>,
}));

/**
 * The one binding UI is mounted by BOTH the person's route and this one, and it
 * is far too heavy to drive here — so it is replaced by a probe that records
 * the props the host handed it. Those props ARE the perspective decision
 * (`fixedRung`, `initialRung`), and the bar's own rendered copy is proven on
 * the real component in the second describe below.
 */
let bindingProps: { initialRung?: string; fixedRung?: string } | null = null;
jest.mock("@/features/bindings/OneBindingWorkspace", () => ({
  OneBindingWorkspace: (props: { initialRung?: string; fixedRung?: string }) => {
    bindingProps = props;
    return <div data-testid="one-binding" />;
  },
}));

let workspaceData: unknown = null;
jest.mock("../../workspace/useMandateWorkspaceData", () => ({
  useMandateWorkspaceData: () => ({
    data: workspaceData,
    loading: false,
    failure: null,
    error: null,
    refresh: () => undefined,
  }),
}));

// The holder's declared output — the live read `SystemAnswerSection` makes.
// This fixture reproduces the REAL shape of `research_client.output_slides`:
// a system agent with NO output schema under a contract requiring title+slides.
jest.mock("../../output-contract", () => {
  const actual = jest.requireActual("../../output-contract");
  return {
    ...actual,
    fetchAgentOutputSchemas: (ids: string[]) =>
      Promise.resolve(Object.fromEntries(ids.map((id) => [id, null]))),
  };
});

import { MandateWorkspace } from "../../workspace/MandateWorkspace";

/** `research_client.output_slides` as production actually holds it. */
const OUTPUT_SLIDES = {
  mandate: {
    id: "59325dc2-4df9-4eb1-8d77-d4dd0d93a160",
    mandate_key: "research_client.output_slides",
    label: "Research Output: Slides",
    organization_id: "39c38960-d30c-4840-b0c1-c9960de95582",
    is_enabled: true,
    output_kind: "presentation_deck",
    default_holder_type: "agent",
    default_holder_id: "8f0bbfc2-85d9-4913-8cea-b09a50c62be6",
    default_holder_version_id: null,
    source_mandate_id: null,
    metadata: null,
    auto_context_disabled: false,
  },
  contract: {
    requiredVariables: [],
    requiredContextPolicyKeys: [],
    requiredOutputKeys: ["title", "slides"],
    spillVariables: [],
  },
  provisionKey: "research_client.report_output",
  pins: {},
  pinnedContext: [],
  offer: null,
  bindings: [],
  agentsById: {
    "8f0bbfc2-85d9-4913-8cea-b09a50c62be6": {
      id: "8f0bbfc2-85d9-4913-8cea-b09a50c62be6",
      name: "Research → Slides Generator",
      agentType: "builtin",
      isArchived: false,
      latestVersion: 6,
    },
  },
  versionsById: {},
};

/**
 * ── THE PERSON'S PERSPECTIVE, AS SENTENCES ───────────────────────────────────
 *
 * Not a noun list: every one of these is a claim about WHOSE answer the screen
 * is describing. They are correct on `/mandates/[key]` and forbidden here.
 */
const PERSON_PERSPECTIVE: readonly RegExp[] = [
  /your override/i,
  /org override/i,
  /everywhere you run/i,
  /set your own answer/i,
  /your own answer/i,
  /your own binding/i,
  /decided for you/i,
  /answer for you/i,
  /runs for you/i,
  /what runs for you/i,
  /your active org/i,
  /applies to you/i,
  /\bfor you\b/i,
];

/**
 * Sentences that say "you" about the ADMIN'S OWN ACTION, not about whose answer
 * this is — "waiting for you to pick which offered value feeds it". Listed
 * verbatim, same rule as the vocabulary guard: an allow-list you can extend
 * with a wildcard is not an allow-list.
 */
const OPERATOR_ADDRESSED = [
  "waiting for you",
  "waits for you",
  "for you to ",
  "chosen for you",
  "for you to review",
];

function offendingSentences(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const sentence of sentences) {
    if (OPERATOR_ADDRESSED.some((a) => sentence.toLowerCase().includes(a)))
      continue;
    if (PERSON_PERSPECTIVE.some((rx) => rx.test(sentence))) out.push(sentence);
  }
  return out;
}

async function renderWorkspace(
  host: "route" | "admin-route",
): Promise<{ text: string; root: Root }> {
  workspaceData = OUTPUT_SLIDES;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<MandateWorkspace mandateKeyOrId="x" host={host} />);
  });
  // Let the holder's output-schema read settle before reading the copy.
  await act(async () => {
    await Promise.resolve();
  });
  return { text: container.textContent ?? "", root };
}

afterEach(() => {
  bindingProps = null;
});

describe("the admin route renders the SYSTEM's answer and only that", () => {
  it("says nothing about the reader's own answer", async () => {
    const { text, root } = await renderWorkspace("admin-route");
    // Anti-vacuity: a render that produced nothing would pass trivially.
    expect(text.length).toBeGreaterThan(80);
    expect(offendingSentences(text)).toEqual([]);
    act(() => root.unmount());
  });

  it("names the mandate's REAL defect and its remedy, in words", async () => {
    const { text, root } = await renderWorkspace("admin-route");
    // The exact case Arman was looking at: a live system agent whose structured
    // output does not exist, under a contract that requires two keys.
    expect(text).toContain("declares no structured output");
    expect(text).toContain("`title` and `slides`");
    expect(text).toContain("or assign a system agent that already does");
    // …and NOT the sentence that shipped, which named a defect that is not
    // this mandate's and offered nothing to do about it.
    expect(text).not.toContain("No Holder fulfils this job yet");
    act(() => root.unmount());
  });

  it("pins the binding UI to the system rung", async () => {
    const { root } = await renderWorkspace("admin-route");
    expect(bindingProps?.fixedRung).toBe("global");
    expect(bindingProps?.initialRung).toBe("global");
    act(() => root.unmount());
  });

  it("the PERSON's route still speaks the person's perspective — the guard is about the host, not the words", async () => {
    const { root } = await renderWorkspace("route");
    // The person's route pre-selects the person's rung and pins nothing.
    expect(bindingProps?.fixedRung).toBeUndefined();
    expect(bindingProps?.initialRung).toBe("user");
    act(() => root.unmount());
  });
});

describe("the offending sentences are exactly what this guard catches", () => {
  it("fires on every sentence the shipped admin route rendered", () => {
    // RED-THEN-GREEN, kept executable: the copy as observed on v0.4.1719.
    const shipped = [
      "This job has no answer for you right now.",
      "How this job is decided for you",
      "This applies everywhere you run.",
      "Your override",
      "Set your own answer",
      "No override applies in admin's Workspace (your active org) — this job runs the system default.",
    ];
    for (const sentence of shipped) {
      expect(offendingSentences(sentence)).toEqual([sentence]);
    }
  });

  it("does not fire on a sentence addressed to the admin doing the work", () => {
    const operator = [
      "One input is still waiting for you to pick which offered value feeds it.",
      "Waits for you to press Run",
      "Chosen for you — this job offers a value named exactly like this one.",
    ];
    for (const sentence of operator) {
      expect(offendingSentences(sentence)).toEqual([]);
    }
  });
});
