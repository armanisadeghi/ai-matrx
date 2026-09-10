import { inheritedModelOverrides } from "../inherited-model-overrides";
import type { MandateLadderRow } from "@/features/mandates/workspace/useMandateLadder";

type Layer = Pick<
  MandateLadderRow,
  "rung" | "is_enabled" | "config_overrides" | "dropped_code"
>;

// Expectations follow service.py::_apply_layer and UnifiedConfig.apply_overrides,
// independently of the editor's merge implementation.
const layers: Layer[] = [
  { rung: "system", is_enabled: true, config_overrides: null },
  {
    rung: "global",
    is_enabled: true,
    config_overrides: {
      temperature: 0.3,
      reasoning_effort: "low",
      model: "system-model",
    },
  },
  { rung: "org", is_enabled: true, config_overrides: { temperature: 0.8 } },
  { rung: "user", is_enabled: true, config_overrides: { temperature: 1.1 } },
];

it("org editing inherits system binding settings, never its local or personal settings", () => {
  expect(inheritedModelOverrides(layers, "org")).toEqual({
    values: {
      temperature: 0.3,
      reasoning_effort: "low",
      model: "system-model",
    },
    sources: {
      temperature: "System",
      reasoning_effort: "System",
      model: "System",
    },
  });
});

it("personal editing uses organization precedence and excludes existing personal deltas", () => {
  expect(inheritedModelOverrides(layers, "user")).toEqual({
    values: {
      temperature: 0.8,
      reasoning_effort: "low",
      model: "system-model",
    },
    sources: {
      temperature: "Organization",
      reasoning_effort: "System",
      model: "System",
    },
  });
});

it("system and global editing have no inherited binding parameters", () => {
  expect(inheritedModelOverrides(layers, "system").values).toEqual({});
  expect(inheritedModelOverrides(layers, "global").values).toEqual({});
});

it("disabled layers do not contribute", () => {
  const disabled = layers.map((row) =>
    row.rung === "org" ? { ...row, is_enabled: false } : row,
  );
  expect(inheritedModelOverrides(disabled, "user").values.temperature).toBe(
    0.3,
  );
});

it("an enabled layer contributes parameters even when its holder is dropped", () => {
  const dropped = layers.map((row) => ({
    ...row,
    dropped_code: "holder_unreachable",
  }));
  expect(inheritedModelOverrides(dropped, "user").values.temperature).toBe(0.8);
});

it("final null cancels an earlier override and restores authored holder settings", () => {
  const cleared: Layer[] = [
    layers[0],
    layers[1],
    {
      rung: "org",
      is_enabled: true,
      config_overrides: { temperature: null, model: null },
    },
  ];
  const inherited = inheritedModelOverrides(cleared, "user");
  expect({
    temperature: 0.5,
    model: "holder-model",
    ...inherited.values,
  }).toEqual({
    temperature: 0.5,
    model: "holder-model",
    reasoning_effort: "low",
  });
  expect(inherited.sources.temperature).toBe("Organization · Holder default");
});

it("complex values replace as a whole rather than recursively merging", () => {
  const complex: Layer[] = [
    {
      rung: "global",
      is_enabled: true,
      config_overrides: {
        response_format: {
          type: "json_schema",
          json_schema: { name: "lower" },
        },
      },
    },
    {
      rung: "org",
      is_enabled: true,
      config_overrides: { response_format: { type: "text" } },
    },
  ];
  expect(
    inheritedModelOverrides(complex, "user").values.response_format,
  ).toEqual({ type: "text" });
});

it("does not silently accept malformed inherited settings", () => {
  expect(() =>
    inheritedModelOverrides(
      [{ rung: "global", is_enabled: true, config_overrides: [] }],
      "org",
    ),
  ).toThrow("System model overrides must be an object");
});
