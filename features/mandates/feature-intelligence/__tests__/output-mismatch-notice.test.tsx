/**
 * ── A WARNED CHOICE RUNS — AND THE CARD SAYS SO ──────────────────────────────
 *
 * Validation offers, never blocks (common-docs/policies/validation-offers-
 * never-blocks.md; aidream 1363). A person's or organization's chosen agent
 * whose declared output lacks keys the job expects is NEVER set aside: it
 * decides and it runs, and the ladder row carries `output_warning`. The card
 * used to look for `dropped_code = 'output_contract_unmet'` and say "… is set
 * aside — X runs instead." — a sentence that is now false.
 *
 * RED on the old tree: `outputMismatchRung` / `OutputMismatchNotice` did not
 * exist (`setAsideRung` keyed on the dropped code, which the door no longer
 * emits), and `ContractMismatchNotice` painted a saved-and-running output
 * mismatch red.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { MandateLadderRow } from "@/features/mandates/workspace/useMandateLadder";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/utils/supabase/client", () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: { name: "Quiz Maker", output_schema: null }, error: null }),
  };
  return { createClient: () => ({ schema: () => ({ from: () => chain }) }) };
});

const announce = jest.fn();
jest.mock("@/lib/coming-soon/announce", () => ({
  announceComingSoon: (key: string) => announce(key),
}));

jest.mock("../job-card-parts", () => ({
  RUNG_LABEL: { system: "System", org: "Organization", user: "You" },
}));

import { OutputMismatchNotice, outputMismatchRung } from "../OutputMismatchNotice";
import { ContractMismatchNotice } from "@/features/mandates/components/ContractMismatchNotice";
import { parseContractCheck } from "@/features/mandates/contract-check";

const WARNING =
  "The agent chosen here does not declare the output key(s) cards this job expects. It runs anyway, as chosen, but its output may not fit: if an answer comes back without that key, the job stops with a plain error instead of saving half an answer. Give that agent an output schema declaring it, or pick one that already does.";

function rung(overrides: Partial<MandateLadderRow>): MandateLadderRow {
  return {
    rung: "user",
    binding_id: "b-1",
    organization_id: null,
    subject_user_id: "u-1",
    is_enabled: true,
    holder_type: "agent",
    holder_id: "agent-quiz",
    holder_version_id: null,
    holder_live: true,
    version_live: null,
    chose_holder: true,
    config_overrides: null,
    consumption_map: null,
    auto_run: null,
    definition_id: "def-1",
    definition_enabled: true,
    fallback_mandate_key: null,
    dropped_code: null,
    dropped_reason: null,
    ...overrides,
  };
}

const SYSTEM = rung({ rung: "system", binding_id: null, subject_user_id: null, holder_id: "agent-default" });

describe("outputMismatchRung — the choice that DECIDES and carries a warning", () => {
  it("finds a person's warned choice", () => {
    const mine = rung({ output_warning: WARNING, output_missing_keys: ["cards"] });
    expect(outputMismatchRung([SYSTEM, mine])).toBe(mine);
  });

  it("finds an organization's warned choice when no person's choice decides", () => {
    const org = rung({ rung: "org", organization_id: "org-1", subject_user_id: null, output_missing_keys: ["cards"] });
    expect(outputMismatchRung([SYSTEM, org])).toBe(org);
  });

  it("never picks a DROPPED rung — a dropped rung does not run", () => {
    const dropped = rung({
      dropped_code: "holder_unreachable",
      dropped_reason: "You cannot open this agent.",
      output_warning: WARNING,
    });
    expect(outputMismatchRung([SYSTEM, dropped])).toBeNull();
    // …and the retired code no longer means anything here either.
    const legacy = rung({ dropped_code: "output_contract_unmet" });
    expect(outputMismatchRung([SYSTEM, legacy])).toBeNull();
  });

  it("stays quiet when the deciding choice is clean, even if a lower one warns", () => {
    const org = rung({ rung: "org", organization_id: "org-1", subject_user_id: null, output_warning: WARNING });
    const mine = rung({});
    expect(outputMismatchRung([SYSTEM, org, mine])).toBeNull();
  });

  it("does not speak for the system default", () => {
    expect(outputMismatchRung([{ ...SYSTEM, output_warning: WARNING }])).toBeNull();
  });
});

async function render(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return { container, root };
}

describe("OutputMismatchNotice — runs anyway, amber, both remedies", () => {
  it("says the choice runs anyway and its output may not fit — never 'set aside'", async () => {
    const onPick = jest.fn();
    const { container, root } = await render(
      <OutputMismatchNotice
        rung={rung({ output_warning: WARNING, output_missing_keys: ["cards"] })}
        expects="flashcards"
        onPickAnother={onPick}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Your choice runs anyway; its output may not fit.");
    expect(text).toContain("Quiz Maker returns plain text; this job expects flashcards.");
    expect(text).not.toMatch(/set aside|runs instead/i);

    const notice = container.querySelector("[data-output-mismatch-notice]");
    expect(notice?.className).toContain("amber");
    expect(notice?.className).not.toMatch(/destructive|rose|red/);

    const buttons = Array.from(container.querySelectorAll("button"));
    const pick = buttons.find((b) => b.textContent?.includes("Pick another"));
    const fix = buttons.find((b) => b.textContent?.includes("Fix with AI"));
    expect(pick).toBeTruthy();
    expect(fix?.textContent).toContain("Soon");
    act(() => pick!.click());
    expect(onPick).toHaveBeenCalled();
    act(() => fix!.click());
    expect(announce).toHaveBeenCalledWith("mandates.fix-output-mismatch-with-ai");
    act(() => root.unmount());
  });

  it("names the organization's choice for an org rung", async () => {
    const { container, root } = await render(
      <OutputMismatchNotice
        rung={rung({ rung: "org", organization_id: "org-1", output_warning: WARNING })}
        expects="flashcards"
        onPickAnother={() => undefined}
      />,
    );
    expect(container.textContent).toContain("Your organization's choice runs anyway; its output may not fit.");
    act(() => root.unmount());
  });
});

describe("ContractMismatchNotice — a saved check that still runs is amber", () => {
  const base = {
    state: "unmet",
    problems: ["its structured output does not declare 'cards'"],
    required_output_keys: ["cards"],
    holder_type: "agent",
    holder_name: "Quiz Maker",
    holder_output_keys: [],
    summary:
      "Saved anyway — it runs as chosen, but its output may not fit: an answer missing a required key stops the job with a plain error instead of saving half of it.",
    checked_at: "2026-09-27T00:00:00+00:00",
  };

  it("output mismatch (not set aside at run) → amber, runs anyway", async () => {
    const check = parseContractCheck({ ...base, set_aside_at_run: false });
    const { container, root } = await render(<ContractMismatchNotice check={check} />);
    const notice = container.querySelector('[data-testid="contract-mismatch-notice"]');
    expect(notice?.getAttribute("data-runs-anyway")).toBe("true");
    expect(notice?.className).toContain("amber");
    expect(notice?.className).not.toContain("destructive");
    act(() => root.unmount());
  });

  it("an input problem that IS set aside at run stays red", async () => {
    const check = parseContractCheck({ ...base, set_aside_at_run: true });
    const { container, root } = await render(<ContractMismatchNotice check={check} />);
    const notice = container.querySelector('[data-testid="contract-mismatch-notice"]');
    expect(notice?.getAttribute("data-runs-anyway")).toBeNull();
    expect(notice?.className).toContain("destructive");
    act(() => root.unmount());
  });
});
