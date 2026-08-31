/**
 * THE MANDATE INPUT SURFACE parser — and the ONE rule for the words
 * "user text only".
 *
 * The defect these hold (found live by Arman, 2026-08-31): a mandate authored
 * by a person — five described inputs, a goal, an output kind, an agent bound
 * and mapped — read "user text only" everywhere, because every reader derived
 * the input contract from the two things only CODE declares. The server now
 * serves the answer; this parser must never re-introduce a client-side guess,
 * and must never let a BROKEN surface (served nothing, but said why) be read
 * as "this job takes user text only".
 */

import {
  isUserTextOnly,
  parseMandateInputSurface,
} from "@/features/mandates/input-surface";

const described = {
  mandate_key: "mandate.goal_writer",
  provision_key: null,
  surface_source: "mandate_inputs",
  holder_name: "Agent Goal Writer",
  accepts_user_input: false,
  notes: [],
  inputs: [
    {
      name: "task_overview",
      kind: "text",
      sourcing: "require",
      label: "Task overview",
      help: "",
      origin: "mandate_input",
    },
    {
      name: "output",
      kind: "text",
      sourcing: "optional",
      label: "output",
      help: "Declared by Agent Goal Writer, the agent that fulfils this job.",
      origin: "holder",
    },
  ],
};

describe("parseMandateInputSurface", () => {
  it("keeps the described input's label — the description IS the ask", () => {
    const surface = parseMandateInputSurface(described, "mandate.goal_writer");
    expect(surface.inputs).toHaveLength(2);
    expect(surface.inputs[0].label).toBe("Task overview");
    expect(surface.inputs[0].sourcing).toBe("require");
  });

  it("carries each input's provenance so the reader can judge it", () => {
    const surface = parseMandateInputSurface(described, "mandate.goal_writer");
    expect(surface.inputs.map((i) => i.origin)).toEqual([
      "mandate_input",
      "holder",
    ]);
    expect(surface.holderName).toBe("Agent Goal Writer");
  });

  it("drops an entry with no name or no kind — an input nobody can address is not an input", () => {
    const surface = parseMandateInputSurface(
      { ...described, inputs: [{ name: "", kind: "text" }, { name: "x" }] },
      "k",
    );
    expect(surface.inputs).toHaveLength(0);
  });

  it("never reads as 'none' while it is serving inputs (version skew)", () => {
    const surface = parseMandateInputSurface(
      { ...described, surface_source: "none" },
      "k",
    );
    expect(surface.surfaceSource).not.toBe("none");
  });
});

describe("isUserTextOnly — the only license for the phrase", () => {
  it("is false when the surface served anything at all", () => {
    expect(isUserTextOnly(parseMandateInputSurface(described, "k"))).toBe(false);
  });

  it("is false when the surface served nothing but SAID why", () => {
    const broken = parseMandateInputSurface(
      {
        mandate_key: "k",
        surface_source: "none",
        inputs: [],
        notes: ["This mandate names Provision 'x' but no live row exists for it."],
      },
      "k",
    );
    expect(broken.inputs).toHaveLength(0);
    expect(isUserTextOnly(broken)).toBe(false);
  });

  it("is true only when nothing is declared anywhere and nothing failed", () => {
    const nothing = parseMandateInputSurface(
      { mandate_key: "k", surface_source: "none", inputs: [], notes: [] },
      "k",
    );
    expect(isUserTextOnly(nothing)).toBe(true);
  });
});
