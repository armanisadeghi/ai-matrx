/**
 * ── THREE CONTROLS, ONE PLACE ────────────────────────────────────────────────
 *
 * 🚨 THE ORDER THIS GUARDS (Arman, 2026-09-08, verbatim):
 *
 *   "Overall, the UI is just horrible, highly repetitive and invents its own
 *    vocabulary … the horrible long paragraph explanations are just hiding the
 *    fact that it's a horrible ui. … You have a mandate and it has to be met
 *    by: 1) Workflow or Agent. 2) A specific ID 3) Is version or latest.
 *    That's it. 3 values are all that is needed and then the mapping of the
 *    inputs. … Where it says 'The system answer' you need 3 labels and 3
 *    inputs. That's it. not an entire paragraph of meaningless text and
 *    massive confusion by then repeating it in the bottom where it says
 *    'Assign the system holder' that's stupid. One place is all we need."
 *
 * Five guards, each RED against the tree as it shipped on v0.4.1728:
 *
 *  (a) the admin holder section renders EXACTLY one holder-type control, one
 *      assignment dropdown and one version control — and the class half: the
 *      whole mandate + bindings tree mounts a holder picker in ONE module, so
 *      a second chooser cannot be forked per host again;
 *  (b) a rung carrying `dropped_code` never renders as healthy (V-PARITY F2);
 *  (c) an org-homed mandate's scope sentence names the ORG and never claims
 *      the platform (V-PARITY F3);
 *  (d) the version control is ABSENT until a holder is chosen;
 *  (e) the section's rendered copy carries none of the invented nouns.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/agents/catalog/react", () => ({
  // Spread the REAL module: this entry also carries `SORT_OPTIONS`, which the
  // agents-hub surface manifest reads at module scope. Replacing the whole
  // entry with one stub component used to blow up an unrelated import chain.
  ...jest.requireActual("@ai-matrx/agents/catalog/react"),
  AgentListDropdown: ({ label }: { label?: string }) => (
    <button data-testid="agent-picker">{label}</button>
  ),
}));
jest.mock("@/lib/redux/hooks", () => ({
  // A FAITHFUL dispatch double — the real one returns a thunk promise.
  useAppDispatch: () => () => ({ unwrap: () => Promise.resolve([]) }),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/features/agents/redux/agent-definition/selectors", () => ({
  selectBuiltinAgents: () => [{ id: "system-agent-1" }],
}));
jest.mock("@/features/agents/redux/agent-definition/thunks", () => ({
  fetchAgentsListFull: () => ({ type: "noop" }),
  fetchAgentVersionHistory: () => ({ type: "noop" }),
}));
jest.mock("@/features/agent-shortcuts/components/ShortcutScopePicker", () => ({
  ShortcutScopePicker: () => <div data-testid="scope-picker" />,
}));
jest.mock("@/features/workflow-runtime/listings/WorkflowListDropdown", () => ({
  WorkflowListDropdown: () => <div data-testid="workflow-picker" />,
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name }: { name?: string }) => <span>{name ?? ""}</span>,
}));

import { ScopeHolderBar } from "@/features/bindings/ScopeHolderBar";
import {
  ladderRowIsBroken,
  ladderRowWords,
  type MandateLadderRow,
} from "../useMandateLadder";
import { homeScopePhrase, systemRungHealth } from "../system-rung-health";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

const JOB = {
  mandateKey: "research_client.output_slides",
  label: "Research Output: Slides",
  outputKind: "presentation_deck",
  offeredCount: 3,
  offerSourceLine: "Offered by the research report provision.",
  coverageLine: "Every input this holder needs is fed — all 3.",
};

function renderSystemBar(opts: {
  agentId?: string | null;
  kind?: "agent" | "workflow";
  healthNote?: {
    sentence: string;
    remedy: string | null;
    broken: boolean;
  } | null;
}): { container: HTMLElement; text: string; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ScopeHolderBar
        rung="system"
        organizationId={null}
        allowGlobal
        fixedRung={["system", "global"]}
        perspective="system"
        healthNote={opts.healthNote ?? null}
        onRungChange={() => undefined}
        holder={{
          kind: opts.kind ?? "agent",
          agentId: opts.agentId ?? null,
          agentVersionId: null,
          useLatest: true,
          workflowId: null,
        }}
        onHolderChange={() => undefined}
        holderName="Research → Slides Generator"
        job={JOB}
        ladderLine="ignored on this host"
      />,
    );
  });
  return { container, text: container.textContent ?? "", root };
}

/* ── (a) THREE CONTROLS, COUNTED ─────────────────────────────────────────── */

describe("the admin holder section is three controls and nothing else", () => {
  it("renders exactly one holder-type control, one assignment dropdown and one version control", () => {
    const { container, root } = renderSystemBar({ agentId: "system-agent-1" });
    for (const control of ["type", "assignment", "version"] as const) {
      expect(
        container.querySelectorAll(`[data-holder-control="${control}"]`).length,
      ).toBe(1);
    }
    // ONE agent dropdown in the whole subtree — not one per cell.
    expect(
      container.querySelectorAll('[data-testid="agent-picker"]').length,
    ).toBe(1);
    act(() => root.unmount());
  });

  it("uses Arman's own labels, verbatim", () => {
    const { container, text, root } = renderSystemBar({
      agentId: "system-agent-1",
    });
    expect(text).toContain("Holder Type");
    expect(text).toContain("Assigned Agent");
    expect(
      container.querySelector(
        '[data-holder-control="assignment"] [data-holder-control="version"]',
      ),
    ).not.toBeNull();
    act(() => root.unmount());
  });

  /**
   * 🚨 THE PICKER IS THE WHOLE CONTROL (Arman, 2026-09-08). The trigger names
   * the assigned agent; the raw uuid, the second copy of the name and the lone
   * "Open it" link that used to sit beside it are GONE — every one of them is
   * already inside the dropdown (detail card, peek, doors).
   *
   * RED before this ruling: the block printed the name twice plus a bare id.
   */
  it("names the agent ON THE PICKER, and prints no id or door beside it", () => {
    const { container, text, root } = renderSystemBar({
      agentId: "8f0bbfc2-85d9-4913-8cea-b09a50c62be6",
    });
    expect(
      container.querySelector('[data-testid="agent-picker"]')?.textContent,
    ).toBe("Research → Slides Generator");
    // Said ONCE — the picker's trigger, and nowhere else in the block.
    expect(text.split("Research → Slides Generator").length - 1).toBe(1);
    expect(text).not.toContain("8f0bbfc2-85d9-4913-8cea-b09a50c62be6");
    expect(
      container.querySelector('[data-testid="holder-agent-id"]'),
    ).toBeNull();
    expect(text).not.toContain("Open it");
    act(() => root.unmount());
  });

  it("says Assigned Workflow when the holder type is Workflow", () => {
    const { text, root } = renderSystemBar({ kind: "workflow" });
    expect(text).toContain("Assigned Workflow");
    expect(text).not.toContain("Assigned Agent");
    act(() => root.unmount());
  });

  it("drops the rung cell and the job cell — the page is one rung, and its heading is the job", () => {
    const { text, root } = renderSystemBar({ agentId: "system-agent-1" });
    expect(text).not.toContain("Who this is for, and what runs");
    expect(text).not.toContain(JOB.mandateKey);
    expect(text).not.toContain(JOB.offerSourceLine);
    act(() => root.unmount());
  });

  it("prints the door's verdict with its remedy, and nothing else", () => {
    const { text, root } = renderSystemBar({
      agentId: "system-agent-1",
      healthNote: {
        sentence: "The system default cannot run this job.",
        remedy: "Assign a holder that declares the output this job requires.",
        broken: true,
      },
    });
    expect(text).toContain("The system default cannot run this job.");
    expect(text).toContain(
      "Assign a holder that declares the output this job requires.",
    );
    act(() => root.unmount());
  });
});

/**
 * THE CLASS HALF — fix the class, do not fork per host. A holder is chosen by
 * ONE module in the two trees a mandate screen is made of.
 *
 * RED at v0.4.1731: `["features/bindings/ScopeHolderBar.tsx"]` — the picker and
 * the shared shortcut version picker were mounted inline in the bar, so any
 * host that wanted the three values had to mount that bar or grow its own copy.
 * Two more components on the same page described or nudged the same decision in
 * their own words (`SystemAnswerSection`, deleted; `MandateDetailPanel`'s "Who
 * fulfils this job" fold, deleted) — those are caught by the rendered-copy
 * guards in `admin/__tests__/admin-route-system-perspective.test.tsx`.
 */
describe("exactly one module in the mandate screens mounts a holder picker", () => {
  const TREES = ["features/mandates", "features/bindings"] as const;

  function sourceFilesUnder(tree: string): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "__tests__" || entry === "node_modules") continue;
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
        out.push(full);
      }
    };
    walk(join(REPO_ROOT, tree));
    return out;
  }

  /**
   * The ONE agent dropdown on these screens that is not a holder assignment:
   * the test bench picks a CANDIDATE TO RUN against saved cases. It writes
   * nothing to the mandate — choosing what to try is a different decision from
   * choosing what answers, and collapsing them would be the opposite defect.
   */
  const NOT_A_HOLDER_CHOOSER = ["features/mandates/admin/MandateTestBench.tsx"];

  it("mounts <AgentListDropdown> and the version control in HolderAssignment alone", () => {
    const files = TREES.flatMap(sourceFilesUnder);
    // Anti-vacuity: a census that looked nowhere would pass trivially.
    expect(files.length).toBeGreaterThan(30);
    const mounts: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      // JSX MOUNTS only — an import or a comment is not a second chooser.
      const rel = relative(REPO_ROOT, file);
      if (NOT_A_HOLDER_CHOOSER.includes(rel)) continue;
      if (
        /<AgentListDropdown\b/.test(source) ||
        /<AgentVersionPicker\b/.test(source)
      ) {
        mounts.push(rel);
      }
    }
    expect(mounts).toEqual(["features/bindings/HolderAssignment.tsx"]);
  });
});

/* ── (d) THE VERSION QUESTION COMES AFTER THE INTELLIGENCE ───────────────── */

describe("the version selector exposes unavailable states", () => {
  it("is disabled with no agent chosen", () => {
    const { container, text, root } = renderSystemBar({ agentId: null });
    expect(
      container.querySelectorAll('[data-holder-control="version"]').length,
    ).toBe(1);
    expect(
      container
        .querySelector('[aria-label="Version"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
    expect(text).not.toContain("Version");
    // …and the two controls that CAN mean something are still there.
    expect(text).toContain("Holder Type");
    expect(text).toContain("Assigned Agent");
    act(() => root.unmount());
  });

  it("is disabled for a workflow holder, which pins no agent version", () => {
    const { container, root } = renderSystemBar({ kind: "workflow" });
    expect(
      container.querySelectorAll('[data-holder-control="version"]').length,
    ).toBe(1);
    expect(
      container
        .querySelector('[aria-label="Version"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
    act(() => root.unmount());
  });
});

/* ── (b) A DROPPED RUNG IS NEVER HEALTHY (V-PARITY/UX F2) ────────────────── */

/** The exact shape production served: holder LIVE, rung dropped anyway. */
const OUTPUT_CONTRACT_DROP: MandateLadderRow = {
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
  dropped_reason:
    "The system default cannot run this job: its holder does not declare the structured output this job requires.",
};

describe("a rung the database dropped is never rendered as a working rung", () => {
  it("is BROKEN even though its holder and its version are both live", () => {
    expect(OUTPUT_CONTRACT_DROP.holder_live).toBe(true);
    expect(OUTPUT_CONTRACT_DROP.version_live).toBeNull();
    // RED before FIX-R9: `ladderRowIsBroken` keyed on those two columns only.
    expect(ladderRowIsBroken(OUTPUT_CONTRACT_DROP)).toBe(true);
  });

  it("prints the database's own sentence, not the client's cheerful one", () => {
    const words = ladderRowWords(OUTPUT_CONTRACT_DROP, null);
    expect(words.detail).toBe(OUTPUT_CONTRACT_DROP.dropped_reason);
    // The exact sentence a walker read on production above a dropped floor.
    expect(words.detail).not.toBe(
      "Names an agent, running its latest version.",
    );
  });

  it("still says the honest thing on a database that has no such column", () => {
    const older = { ...OUTPUT_CONTRACT_DROP };
    delete (older as { dropped_code?: string | null }).dropped_code;
    delete (older as { dropped_reason?: string | null }).dropped_reason;
    expect(ladderRowIsBroken(older)).toBe(false);
    expect(ladderRowWords(older, null).detail).toBe(
      "Names an agent, running its latest version.",
    );
  });

  it("the system rung's verdict is the door's words and a remedy for its code", () => {
    const health = systemRungHealth({
      status: "read",
      droppedCode: OUTPUT_CONTRACT_DROP.dropped_code ?? null,
      droppedReason: OUTPUT_CONTRACT_DROP.dropped_reason ?? null,
      holderName: "Research → Slides Generator",
      holderIsWorkflow: false,
      holderSet: true,
      home: { systemHomed: true, organizationName: null },
    });
    expect(health.sentence).toBe(OUTPUT_CONTRACT_DROP.dropped_reason);
    expect(health.broken).toBe(true);
    expect(health.remedy).toContain(
      "Assign a holder that declares the output this job requires",
    );
  });
});

/* ── (c) THE SCOPE COMES FROM THE HOME (V-PARITY/UX F3) ──────────────────── */

describe("an org-homed job's scope sentence names its organization", () => {
  const orgHomed = {
    status: "read" as const,
    droppedCode: null,
    droppedReason: null,
    holderName: "Agent Goal Writer",
    holderIsWorkflow: false,
    holderSet: true,
  };

  it("never claims the platform for an organization's job", () => {
    const health = systemRungHealth({
      ...orgHomed,
      home: { systemHomed: false, organizationName: "Write Target Sandbox" },
    });
    // RED before FIX-R9, verbatim from production v0.4.1728:
    //   "Agent Goal Writer answers this job for every user on the platform."
    expect(health.sentence).toBe(
      "Agent Goal Writer answers this job for every member of Write Target Sandbox.",
    );
    expect(health.sentence).not.toContain("every user on the platform");
  });

  it("keeps the platform sentence where it is TRUE — a system-homed job", () => {
    const health = systemRungHealth({
      ...orgHomed,
      home: { systemHomed: true, organizationName: null },
    });
    expect(health.sentence).toBe(
      "Agent Goal Writer answers this job for every user on the platform.",
    );
  });

  it("an unread organization name says so — never an id, never the platform", () => {
    expect(
      homeScopePhrase({ systemHomed: false, organizationName: null }),
    ).toBe("every member of the organization that homes this job");
    expect(
      homeScopePhrase({ systemHomed: false, organizationName: null }),
    ).not.toContain("every user on the platform");
  });

  it("nothing assigned is stated as nothing assigned, with the remedy", () => {
    const health = systemRungHealth({
      ...orgHomed,
      holderName: null,
      holderSet: false,
      home: { systemHomed: true, organizationName: null },
    });
    expect(health.sentence).toBe(
      "Nothing is assigned for every user on the platform, so the Mandate resolver refuses this job.",
    );
    expect(health.remedy).toBe("Choose an agent or a workflow above.");
    expect(health.broken).toBe(true);
  });
});

/* ── (e) THE VOCABULARY OF THIS SECTION ──────────────────────────────────── */

/**
 * Nouns this section invented for itself. Every one of them was on the admin
 * page on v0.4.1728, and none is in the campaign's approved vocabulary (rung ·
 * home · holder · binding · provision).
 */
const INVENTED_NOUNS: readonly RegExp[] = [
  /the system answer/i,
  /assign the system holder/i,
  /assign a different system agent/i,
  /platform-wide binding, which sits above/i,
  /required output:/i,
  /fulfilled by/i,
];

describe("the holder section speaks the approved vocabulary only", () => {
  it("renders none of the nouns this section invented", () => {
    const { text, root } = renderSystemBar({
      agentId: "system-agent-1",
      healthNote: {
        sentence:
          "Research → Slides Generator answers this job for every user on the platform.",
        remedy: null,
        broken: false,
      },
    });
    expect(text.length).toBeGreaterThan(30);
    const found = INVENTED_NOUNS.filter((rx) => rx.test(text)).map(String);
    expect(found).toEqual([]);
    act(() => root.unmount());
  });

  it("would catch the copy as it shipped — kept executable", () => {
    // The admin page's own words on v0.4.1728, section headings included.
    const shipped = [
      "The system answer",
      "Assigned by a platform-wide binding, which sits above this job's own default.",
      "Assign a different system agent",
      "Assign the system holder",
      "Required output: title, slides.",
    ].join(" ");
    expect(INVENTED_NOUNS.some((rx) => rx.test(shipped))).toBe(true);
    expect(INVENTED_NOUNS.filter((rx) => rx.test(shipped)).length).toBe(5);
  });
});
