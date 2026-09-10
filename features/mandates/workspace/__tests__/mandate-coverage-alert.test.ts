/**
 * THE DETAIL PAGE'S COVERAGE BANNER — the rules, pinned.
 *
 * 🚨 THE DEFECT (2026-09-09). `mandate.definition` held three live Mandates
 * that resolve to NO holder — `shortcut.full_prompt_optimizer`,
 * `shortcut.simple_system_message_generator` and
 * `patrol.purpose_canary_20260829225707`. The LIST said so loudly. The DETAIL
 * page did not: it landed on the Definition tab, where the only trace was the
 * grey line "Declared by: Holder name unavailable". An admin who arrives by
 * link never passes the list, so the page told them nothing was wrong with a
 * job that errors on every call.
 *
 * These pin the four ways that could go wrong again:
 *   · green is silent (a banner on 382 healthy rows is noise, not information)
 *   · a FAILED report is never silent — silence there reads as "all clear"
 *   · red says the CONSEQUENCE, not just the status, and carries the server's
 *     own sentence verbatim rather than a second client-written one
 *   · orange NAMES the leader whose Holder is carrying it
 */
import {
  RED_TITLE,
  mandateCoverageAlertVerdict,
} from "@/features/mandates/workspace/MandateCoverageAlert";
import { RED_WORD } from "@/features/mandates/coverage";

const RED_ROW = {
  mandate_key: "shortcut.full_prompt_optimizer",
  state: "red" as const,
  leader_key: null,
  reason:
    "shortcut.full_prompt_optimizer: Holder missing — no Holder is assigned and it names no fallback, so every run of it errors. Bind a Holder on its page to fix it.",
};

describe("mandateCoverageAlertVerdict", () => {
  it("is silent while the one report is still in flight", () => {
    expect(
      mandateCoverageAlertVerdict({ row: undefined, loading: true, error: null })
        .kind,
    ).toBe("silent");
  });

  it("is silent for an assigned Mandate", () => {
    expect(
      mandateCoverageAlertVerdict({
        row: { ...RED_ROW, state: "green", reason: null },
        loading: false,
        error: null,
      }).kind,
    ).toBe("silent");
  });

  it("NEVER goes silent when the report failed — that would read as all clear", () => {
    const verdict = mandateCoverageAlertVerdict({
      row: undefined,
      loading: false,
      error: "503 from /mandates/coverage/states",
    });
    expect(verdict.kind).toBe("unknown");
    if (verdict.kind !== "unknown") throw new Error("unreachable");
    // The verbatim server failure rides along — never swallowed.
    expect(verdict.detail).toContain("503");
  });

  it("says the CONSEQUENCE for red, in the platform's one word, and offers the fix", () => {
    const verdict = mandateCoverageAlertVerdict({
      row: RED_ROW,
      loading: false,
      error: null,
    });
    expect(verdict.kind).toBe("state");
    if (verdict.kind !== "state") throw new Error("unreachable");
    expect(verdict.bucket).toBe("red");
    // ONE word for the state (FIX-R17) — imported, never re-spelled.
    expect(verdict.title).toBe(RED_TITLE);
    expect(verdict.title).toContain(RED_WORD);
    expect(verdict.title).toContain("nothing runs when this Mandate is called");
    // The SERVER's sentence, verbatim. A second client-written reason beside it
    // is the two-judges class this whole feature exists to avoid.
    expect(verdict.detail).toBe(RED_ROW.reason);
    expect(verdict.offerFix).toBe(true);
  });

  it("names the leader whose Holder is carrying an orange Mandate", () => {
    const verdict = mandateCoverageAlertVerdict({
      row: {
        mandate_key: "education.admin_guidance",
        state: "orange",
        leader_key: "education.creator_guidance",
        reason:
          "education.admin_guidance has no holder of its own — it runs on education.creator_guidance's holder.",
      },
      loading: false,
      error: null,
    });
    expect(verdict.kind).toBe("state");
    if (verdict.kind !== "state") throw new Error("unreachable");
    expect(verdict.bucket).toBe("orange");
    expect(verdict.title).toContain("education.creator_guidance");
  });
});
