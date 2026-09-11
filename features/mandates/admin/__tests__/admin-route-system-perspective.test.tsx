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
  // A FAITHFUL dispatch double: the real one returns a thunk promise with
  // `.unwrap()`, and the version control calls it. A double that cannot hold
  // the shape the real framework holds is a false test.
  useAppDispatch: () => () => ({ unwrap: () => Promise.resolve([]) }),
  useAppSelector: () => "org-1",
  useAppStore: () => ({ getState: () => ({}), dispatch: () => undefined }),
}));

jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({
    organizations: [
      { id: "org-1", name: "Write Target Sandbox", role: "admin" },
    ],
  }),
}));

jest.mock("../../useMandate", () => ({
  useMandate: () => ({ mandate: null, loading: false, error: null }),
}));

/**
 * 🚨 THE DOOR, ANSWERING AS PRODUCTION ANSWERS (FIX-R9). `mandate.resolve`
 * returns `research_client.output_slides`' system rung with FIX-R7's 22nd
 * column set — the platform's own judgement that the floor cannot run. The
 * admin route reads THAT ROW and prints THOSE WORDS; it no longer walks the
 * holder's output schema itself.
 */
const OUTPUT_SLIDES_DROPPED_REASON =
  "The system default cannot run this job: its holder does not declare the structured output this job requires.";
let ladderRows: unknown[] = [];
let ladderOrganizationId: string | null = null;
jest.mock("../../workspace/useMandateLadder", () => {
  const actual = jest.requireActual("../../workspace/useMandateLadder");
  return {
    ...actual,
    useMandateLadder: (_key: string, organizationId: string | null) => {
      ladderOrganizationId = organizationId;
      return { rows: ladderRows, loading: false, error: null };
    },
  };
});

const copyAndOpen = jest.fn();
jest.mock("../../useCopyMandateAgent", () => ({
  useCopyMandateAgent: () => ({ copying: false, copyAndOpen }),
}));

// Heavy leaves. Each renders its own copy, which is swept by the mandate-screen
// vocabulary guard; none of them is where a PERSPECTIVE sentence lives.
jest.mock("../../workspace/TriadSections", () => ({
  TriadFlowMark: () => <div />,
  TriadGoalSection: () => <div />,
  TriadInputSection: () => <div />,
  TriadOutputSection: () => <div />,
}));
// Coverage performs its own definition/registry reads; this suite exercises
// workspace perspective and scope decisions at the existing data-hook boundary.
jest.mock(
  "@/features/shell/components/header/templates/CrumbTrailHeader",
  () => ({
    CrumbTrailHeader: () => null,
  }),
);
jest.mock("../../workspace/MandateCoverageAlert", () => ({
  MandateCoverageAlert: () => null,
}));
jest.mock("../../workspace/MandateProvenancePanel", () => ({
  MandateProvenancePanel: () => null,
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
type BindingProbe = {
  initialRung?: string;
  initialOrganizationId?: string | null;
  fixedRung?: string | readonly string[];
  perspective?: string;
  healthNote?: {
    sentence: string;
    remedy: string | null;
    broken: boolean;
  } | null;
};
let bindingProps: BindingProbe | null = null;
jest.mock("@/features/bindings/OneBindingWorkspace", () => ({
  OneBindingWorkspace: (props: BindingProbe) => {
    bindingProps = props;
    const [draft, setDraft] = React.useState("");
    return (
      <div data-testid="one-binding">
        <input
          aria-label="Binding draft probe"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
    );
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
  principal?: { kind: "org"; orgId: string },
): Promise<{ text: string; root: Root; container: HTMLDivElement }> {
  workspaceData = OUTPUT_SLIDES;
  ladderRows = [
    {
      rung: "system",
      binding_id: null,
      organization_id: "39c38960-d30c-4840-b0c1-c9960de95582",
      subject_user_id: null,
      is_enabled: true,
      holder_type: "agent",
      holder_id: "8f0bbfc2-85d9-4913-8cea-b09a50c62be6",
      holder_version_id: null,
      holder_live: true,
      version_live: null,
      chose_holder: true,
      config_overrides: null,
      consumption_map: null,
      auto_run: null,
      definition_id: "59325dc2-4df9-4eb1-8d77-d4dd0d93a160",
      definition_enabled: true,
      fallback_mandate_key: null,
      dropped_code: "output_contract_unmet",
      dropped_reason: OUTPUT_SLIDES_DROPPED_REASON,
    },
  ];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MandateWorkspace mandateKeyOrId="x" host={host} principal={principal} />,
    );
  });
  // Let the holder's output-schema read settle before reading the copy.
  await act(async () => {
    await Promise.resolve();
  });
  return { text: container.textContent ?? "", root, container };
}

afterEach(() => {
  bindingProps = null;
  copyAndOpen.mockClear();
});

describe("the admin route renders the SYSTEM's answer and only that", () => {
  it("says nothing about the reader's own answer", async () => {
    const { text, root } = await renderWorkspace("admin-route");
    // Anti-vacuity: a render that produced nothing would pass trivially. The
    // page IS much smaller than it was — the whole "system answer" section is
    // gone — so this floor is the job's identity, not the old prose.
    expect(text).toContain("Research Output: Slides");
    expect(text).not.toContain("research_client.output_slides");
    expect(text).toContain("Holder");
    expect(offendingSentences(text)).toEqual([]);
    act(() => root.unmount());
  });

  it("carries the DOOR's own defect sentence and a remedy, to the one place the holder is set", async () => {
    const { text, root } = await renderWorkspace("admin-route");
    // 🚨 FIX-R9 + V-PARITY/UX F2: the verdict is the database's, verbatim, and
    // it travels WITH the three controls instead of standing in a section of
    // its own ten lines above them.
    expect(bindingProps?.perspective).toBe("system");
    expect(bindingProps?.healthNote?.sentence).toBe(
      OUTPUT_SLIDES_DROPPED_REASON,
    );
    expect(bindingProps?.healthNote?.broken).toBe(true);
    expect(bindingProps?.healthNote?.remedy).toContain(
      "Assign a holder that declares the output this job requires",
    );
    // …and the page no longer writes a SECOND verdict of its own beside it.
    expect(text).not.toContain("declares no structured output");
    expect(text).not.toContain("No Holder fulfils this job yet");
    // The duplicated section is gone with it.
    expect(text).not.toContain("The system answer");
    expect(text).not.toContain("Assign the system holder");
    act(() => root.unmount());
  });

  it("a HEALTHY system rung names the scope the mandate's HOME gives it, never the platform (F3)", async () => {
    // `research_client.output_slides` is SYSTEM-homed, so the platform-wide
    // sentence is the true one here. The org-homed direction is proven in
    // `workspace/__tests__/holder-assignment.test.tsx`, which drives the same
    // pure function with an org home.
    ladderRows = [];
    workspaceData = OUTPUT_SLIDES;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<MandateWorkspace mandateKeyOrId="x" host="admin-route" />);
    });
    // No system row came back at all — that is unreadable, never "healthy".
    expect(bindingProps?.healthNote?.sentence).toBe(
      "Whether this assignment can run could not be read just now.",
    );
    act(() => root.unmount());
  });

  it("pins the binding UI to the two rungs that decide for everybody, and to nothing else", async () => {
    const { root } = await renderWorkspace("admin-route");
    // `research_client.output_slides` has NO platform-wide binding, so the job's
    // own default is what answers — and it is where the page opens.
    expect(bindingProps?.fixedRung).toEqual(["system", "global"]);
    // Never a person's or an organization's rung.
    expect(bindingProps?.fixedRung).not.toContain("user");
    expect(bindingProps?.fixedRung).not.toContain("org");
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

describe("organization scope remains distinct from the viewing administrator", () => {
  it("locks editing to the route organization", async () => {
    const { root } = await renderWorkspace("route", {
      kind: "org",
      orgId: "org-2",
    });
    expect(bindingProps?.perspective).toBe("organization");
    expect(bindingProps?.fixedRung).toEqual(["org"]);
    expect(bindingProps?.initialRung).toBe("org");
    expect(bindingProps?.initialOrganizationId).toBe("org-2");
    expect(ladderOrganizationId).toBe("org-2");
    act(() => root.unmount());
  });

  it("lists global and organization configuration without the viewing user's row or an effective verdict", async () => {
    const principal = { kind: "org" as const, orgId: "org-1" };
    const { root, container } = await renderWorkspace("route", principal);
    const system = ladderRows[0] as Record<string, unknown>;
    ladderRows = [
      system,
      {
        ...system,
        rung: "global",
        binding_id: "global-row",
        dropped_code: null,
        dropped_reason: null,
      },
      {
        ...system,
        rung: "org",
        binding_id: "org-row",
        organization_id: "org-1",
        holder_id: null,
        holder_version_id: "version-pin",
        version_live: true,
        holder_live: null,
        chose_holder: false,
        dropped_code: null,
        dropped_reason: null,
      },
      {
        ...system,
        rung: "user",
        binding_id: "personal-row",
        dropped_code: null,
        dropped_reason: null,
      },
    ];
    await act(async () =>
      root.render(
        <MandateWorkspace
          mandateKeyOrId="x"
          host="route"
          principal={principal}
        />,
      ),
    );
    const holder = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ].find((tab) => tab.textContent === "Holder");
    expect(holder).toBeDefined();
    act(() => holder!.click());
    const table = container.querySelector(
      'table[aria-label="Configured holders"]',
    );
    expect(table).not.toBeNull();
    expect(table?.textContent).toContain("Global binding");
    expect(table?.textContent).toContain("Write Target Sandbox");
    expect(table?.textContent).not.toContain("Your own binding");
    expect(table?.textContent).toContain("Pinned holder");
    const duplicate = container.querySelector<HTMLButtonElement>(
      '[aria-label="Duplicate Write Target Sandbox holder"]',
    );
    expect(duplicate).not.toBeNull();
    act(() => duplicate!.click());
    expect(copyAndOpen).toHaveBeenCalledWith({
      defaultAgentId: null,
      defaultAgentVersionId: "version-pin",
    });
    expect(container.textContent).not.toContain("Effective holder");
    act(() => root.unmount());
  });

  it("remounts scope-local draft state when the same mandate moves to another organization", async () => {
    const { root, container } = await renderWorkspace("route", {
      kind: "org",
      orgId: "org-1",
    });
    const previousInput = container.querySelector(
      'input[aria-label="Binding draft probe"]',
    );
    expect(previousInput).not.toBeNull();
    await act(async () =>
      root.render(
        <MandateWorkspace
          mandateKeyOrId="x"
          host="route"
          principal={{ kind: "org", orgId: "org-2" }}
        />,
      ),
    );
    expect(
      container.querySelector('input[aria-label="Binding draft probe"]'),
    ).not.toBe(previousInput);
    expect(bindingProps?.initialOrganizationId).toBe("org-2");
    expect(ladderOrganizationId).toBe("org-2");
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
