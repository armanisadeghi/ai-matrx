/**
 * THE AUTO-RUN INVERSION — the offer, the payload, the launch gate.
 *
 * Every case here is a promise about law 7 ("a referenced, fully-mapped
 * binding runs with no user input; prompting is the flexibility option") that
 * a future edit must not quietly break.
 */

import {
  evaluateBindingAutoRun,
  resolveEffectiveAutoRun,
  unresolvedRequiredVariables,
} from "@/features/surfaces/utils/binding-auto-run";
import { buildSurfaceBindingPayload } from "@/features/surfaces/services/bind-agent-to-surface.service";
import { mergeValueMappingLayers } from "@/features/surfaces/utils/merge-value-mappings";
import type { ValueMappingMap } from "@/features/surfaces/types";

describe("evaluateBindingAutoRun — when auto-run may be offered", () => {
  it("is eligible when every required target is mapped", () => {
    const mappings: ValueMappingMap = {
      transcript: { mapType: "surface_value", target: "page_text" },
      tone: { mapType: "direct_value", target: "brief" },
    };
    expect(
      evaluateBindingAutoRun(
        [
          { name: "transcript", required: true },
          { name: "tone", required: true },
        ],
        mappings,
      ),
    ).toEqual({ eligible: true, blockers: [], reason: "complete" });
  });

  it("is eligible for an agent with nothing to ask", () => {
    expect(evaluateBindingAutoRun([], {}).eligible).toBe(true);
  });

  it("ignores unmapped OPTIONAL targets — the agent's default answers them", () => {
    expect(
      evaluateBindingAutoRun(
        [{ name: "transcript", required: true }, { name: "tone" }],
        { transcript: { mapType: "surface_value", target: "page_text" } },
      ).eligible,
    ).toBe(true);
  });

  it("refuses when a required target has no mapping", () => {
    const result = evaluateBindingAutoRun(
      [
        { name: "transcript", required: true },
        { name: "topic", required: true },
      ],
      { transcript: { mapType: "surface_value", target: "page_text" } },
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("missing_required");
    expect(result.blockers).toEqual(["topic"]);
  });

  it("refuses when a required target is explicitly `unmapped`", () => {
    expect(
      evaluateBindingAutoRun([{ name: "topic", required: true }], {
        topic: { mapType: "unmapped" },
      }).eligible,
    ).toBe(false);
  });

  it("refuses when ANY target prompts the user — a prompt IS the stop", () => {
    const result = evaluateBindingAutoRun(
      [{ name: "transcript", required: true }, { name: "tone" }],
      {
        transcript: { mapType: "surface_value", target: "page_text" },
        // optional, yet still a stop
        tone: { mapType: "prompt_user", prompt: "Which tone?" },
      },
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("prompts_user");
    expect(result.blockers).toEqual(["tone"]);
  });
});

describe("buildSurfaceBindingPayload — the stored v3 shape", () => {
  it("omits auto_run entirely when off, so an untouched binding stores no decision", () => {
    expect(
      buildSurfaceBindingPayload({ valueMappings: {}, autoRun: false }),
    ).toEqual({ value_mappings: {} });
    expect(buildSurfaceBindingPayload({ valueMappings: {} })).toEqual({
      value_mappings: {},
    });
  });

  it("writes auto_run: true when on, alongside mappings and policies", () => {
    const valueMappings: ValueMappingMap = {
      topic: { mapType: "direct_value", target: "x" },
    };
    expect(
      buildSurfaceBindingPayload({
        valueMappings,
        writePolicies: { page_meta_tags: "ask" },
        autoRun: true,
      }),
    ).toEqual({
      value_mappings: valueMappings,
      write_policies: { page_meta_tags: "ask" },
      auto_run: true,
    });
  });

  it("still omits an empty write_policies map", () => {
    expect(
      buildSurfaceBindingPayload({ valueMappings: {}, writePolicies: {} }),
    ).toEqual({ value_mappings: {} });
  });
});

describe("mergeValueMappingLayers — auto-run is one answer, not a per-key merge", () => {
  it("reports null when no layer has an opinion", () => {
    const merged = mergeValueMappingLayers([
      { name: "shortcut", mappings: { a: { mapType: "unmapped" } } },
    ]);
    expect(merged.autoRun).toBeNull();
    expect(merged.autoRunProvenance).toBeNull();
  });

  it("lets the strongest declaring layer win outright — user OFF beats org ON", () => {
    const merged = mergeValueMappingLayers([
      { name: "binding:org:5dc930e9", mappings: {}, autoRun: true },
      { name: "binding:user", mappings: {}, autoRun: false },
    ]);
    expect(merged.autoRun).toBe(false);
    expect(merged.autoRunProvenance).toBe("binding:user");
  });

  it("does not let a non-declaring shortcut layer clobber the binding's answer", () => {
    const merged = mergeValueMappingLayers([
      { name: "binding:user", mappings: {}, autoRun: true },
      { name: "shortcut", mappings: { a: { mapType: "unmapped" } } },
    ]);
    expect(merged.autoRun).toBe(true);
    expect(merged.autoRunProvenance).toBe("binding:user");
  });

  it("does not call a layer inert when its auto-run answer won", () => {
    const merged = mergeValueMappingLayers([
      {
        name: "binding:global",
        mappings: { a: { mapType: "direct_value", target: 1 } },
        autoRun: true,
      },
      {
        name: "binding:user",
        mappings: { a: { mapType: "direct_value", target: 2 } },
      },
    ]);
    expect(merged.inertLayers).toEqual([]);
  });
});

describe("the launch gate — intent is never a bypass", () => {
  it("names exactly the required variables the mapping failed to deliver", () => {
    expect(
      unresolvedRequiredVariables(
        [
          { name: "transcript", required: true },
          { name: "topic", required: true },
          { name: "tone" },
        ],
        { transcript: "hello" },
      ),
    ).toEqual(["topic"]);
  });

  it("treats an empty string as a gap", () => {
    expect(
      unresolvedRequiredVariables([{ name: "topic", required: true }], {
        topic: "",
      }),
    ).toEqual(["topic"]);
  });

  it("is satisfied by the agent's own defaultValue", () => {
    expect(
      unresolvedRequiredVariables(
        [{ name: "topic", required: true, defaultValue: "general" }],
        {},
      ),
    ).toEqual([]);
  });

  it("has no opinion about optional variables", () => {
    expect(unresolvedRequiredVariables([{ name: "tone" }], {})).toEqual([]);
  });
});

describe("resolveEffectiveAutoRun — the precedence that fixes the inversion", () => {
  it("lets the binding decide over the hard-default seed (the whole point)", () => {
    expect(
      resolveEffectiveAutoRun({
        callerAutoRun: undefined,
        bindingAutoRun: true,
        seededAutoRun: false,
      }),
    ).toBe(true);
  });

  it("still lets an explicit caller literal win over the binding", () => {
    expect(
      resolveEffectiveAutoRun({
        callerAutoRun: false,
        bindingAutoRun: true,
        seededAutoRun: false,
      }),
    ).toBe(false);
  });

  it("falls through to a shortcut's seeded answer when no binding declared one", () => {
    expect(
      resolveEffectiveAutoRun({
        callerAutoRun: undefined,
        bindingAutoRun: null,
        seededAutoRun: true,
      }),
    ).toBe(true);
  });

  it("defaults to false — today's behavior for every pre-v3 binding", () => {
    expect(
      resolveEffectiveAutoRun({
        callerAutoRun: undefined,
        bindingAutoRun: null,
        seededAutoRun: undefined,
      }),
    ).toBe(false);
  });
});
