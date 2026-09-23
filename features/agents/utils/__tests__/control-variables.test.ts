/**
 * Controls as first-class variables — the component a bound control renders with
 * is DERIVED from its catalog definition, the bind/unbind round trip never loses
 * the author's value, and every run form shows the bound controls as a Settings
 * group after the content inputs.
 */

import {
  bindControlToVariable,
  deriveControlComponent,
  isControlBindable,
  LANGUAGE_OPTIONS,
  orderVariablesForForm,
  readControlBindablePolicy,
  unbindControlVariable,
  DEFAULT_CONTROL_BINDABLE_POLICY,
} from "../control-variables";
import type { ControlDefinition } from "@/features/agents/hooks/useModelControls";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import reducer, {
  createInstanceFullPayloadForTest,
} from "@/features/agents/components/messages-display/user/__tests__/host-wired-values.harness";
import { initInstanceVariables } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { selectVisibleInputDefinitions } from "@/features/agents/redux/execution-system/instance-variable-values/bound-variable.selectors";
import { resolveVariablesForRequest } from "@/features/agents/redux/execution-system/instance-variable-values/resolve-variables-for-request";

// Real catalog shapes (gpt-image-2 / a TTS model / a chat model), as
// resolveModelControls normalizes them.
const ASPECT: ControlDefinition = {
  type: "enum",
  enum: ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2", "21:9"],
};
const QUALITY: ControlDefinition = {
  type: "enum",
  enum: ["auto", "low", "medium", "high"],
  default: "auto",
};
const VOICE: ControlDefinition = {
  type: "enum",
  enum: ["kore", "puck", "charon", "fenrir", "aoede"],
};
const TEMPERATURE: ControlDefinition = { type: "number", min: 0, max: 2, default: 1 };
const SPEED: ControlDefinition = { type: "number", min: 0.25, max: 4 };
const SEED: ControlDefinition = { type: "integer", min: 0 };
const WEB_SEARCH: ControlDefinition = { type: "boolean", default: false };

describe("deriveControlComponent", () => {
  it("aspect ratio → pill toggle carrying the catalog's allowed ratios", () => {
    expect(deriveControlComponent("aspect_ratio", ASPECT)).toEqual({
      type: "pill-toggle",
      options: ASPECT.enum,
    });
  });

  it("a four-value enum (quality) → select", () => {
    expect(deriveControlComponent("quality", QUALITY)).toEqual({
      type: "select",
      options: ["auto", "low", "medium", "high"],
    });
  });

  it("a tiny enum → pill toggle", () => {
    expect(
      deriveControlComponent("background", {
        type: "enum",
        enum: ["auto", "transparent", "opaque"],
      }).type,
    ).toBe("pill-toggle");
  });

  it("a voice control → select populated from the model's voices", () => {
    expect(deriveControlComponent("tts_voice", VOICE)).toEqual({
      type: "select",
      options: VOICE.enum,
    });
  });

  it("numeric with min and max → slider with a step that fits the range", () => {
    expect(deriveControlComponent("temperature", TEMPERATURE)).toEqual({
      type: "slider",
      min: 0,
      max: 2,
      step: 0.01,
    });
    expect(deriveControlComponent("speed", SPEED)).toMatchObject({
      type: "slider",
      step: 0.1,
    });
  });

  it("numeric without both bounds → number input", () => {
    expect(deriveControlComponent("seed", SEED)).toEqual({
      type: "number",
      min: 0,
      step: 1,
    });
  });

  it("boolean → toggle", () => {
    expect(deriveControlComponent("internal_web_search", WEB_SEARCH)).toEqual({
      type: "toggle",
      toggleValues: ["Off", "On"],
    });
  });

  it("a language control with no enum → select of languages", () => {
    const c = deriveControlComponent("target_language", { type: "string" });
    expect(c.type).toBe("select");
    expect(c.options).toEqual([...LANGUAGE_OPTIONS]);
  });

  it("free text → textarea", () => {
    expect(
      deriveControlComponent("negative_prompt", { type: "string" }).type,
    ).toBe("textarea");
  });
});

describe("bind / unbind", () => {
  it("moves the literal into the variable's default and back, typed", () => {
    const settings = { aspect_ratio: "16:9", temperature: 0.7 };
    const bound = bindControlToVariable({
      key: "aspect_ratio",
      control: ASPECT,
      settings,
      variableDefinitions: [{ name: "subject", defaultValue: "" }],
    });
    expect(bound.settings).toEqual({ temperature: 0.7 });
    expect(bound.variable).toEqual({
      name: "aspect_ratio",
      defaultValue: "16:9",
      required: false,
      customComponent: { type: "pill-toggle", options: ASPECT.enum },
      control: { key: "aspect_ratio" },
    });

    const unbound = unbindControlVariable({
      key: "aspect_ratio",
      control: ASPECT,
      settings: bound.settings,
      variableDefinitions: bound.variableDefinitions,
    });
    expect(unbound.settings).toEqual({ temperature: 0.7, aspect_ratio: "16:9" });
    expect(unbound.variableDefinitions).toEqual([{ name: "subject", defaultValue: "" }]);
  });

  it("a numeric and a boolean control round-trip to typed literals", () => {
    const b1 = bindControlToVariable({
      key: "temperature",
      control: TEMPERATURE,
      settings: { temperature: 0.7 },
      variableDefinitions: [],
    });
    expect(b1.variable.defaultValue).toBe("0.7");
    expect(
      unbindControlVariable({
        key: "temperature",
        control: TEMPERATURE,
        settings: b1.settings,
        variableDefinitions: b1.variableDefinitions,
      }).settings,
    ).toEqual({ temperature: 0.7 });

    const b2 = bindControlToVariable({
      key: "internal_web_search",
      control: WEB_SEARCH,
      settings: { internal_web_search: true },
      variableDefinitions: [],
    });
    expect(b2.variable.defaultValue).toBe("On");
    expect(
      unbindControlVariable({
        key: "internal_web_search",
        control: WEB_SEARCH,
        settings: b2.settings,
        variableDefinitions: b2.variableDefinitions,
      }).settings,
    ).toEqual({ internal_web_search: true });
  });

  it("an unset literal prefills from the catalog default", () => {
    const b = bindControlToVariable({
      key: "quality",
      control: QUALITY,
      settings: {},
      variableDefinitions: [],
    });
    expect(b.variable.defaultValue).toBe("auto");
  });

  it("never collides with an existing variable name", () => {
    const b = bindControlToVariable({
      key: "style",
      control: { type: "enum", enum: ["vivid", "natural"] },
      settings: {},
      variableDefinitions: [{ name: "style", defaultValue: "watercolor" }],
    });
    expect(b.variable.name).toBe("style_2");
  });
});

describe("the organization's bindable-keys knob", () => {
  it("locks safety controls by default and opens everything else", () => {
    expect(isControlBindable("moderation", DEFAULT_CONTROL_BINDABLE_POLICY)).toBe(false);
    expect(isControlBindable("aspect_ratio", DEFAULT_CONTROL_BINDABLE_POLICY)).toBe(true);
  });

  it("deny wins over allow, and a malformed knob falls back to the default", () => {
    const policy = readControlBindablePolicy({ allow: ["*"], deny: ["temperature"] });
    expect(isControlBindable("temperature", policy)).toBe(false);
    expect(readControlBindablePolicy("nonsense")).toBe(DEFAULT_CONTROL_BINDABLE_POLICY);
  });
});

describe("the run form groups bound controls after the content inputs", () => {
  const CONVERSATION = "conv-controls";
  const DEFINITIONS: VariableDefinition[] = [
    {
      name: "aspect_ratio",
      defaultValue: "1:1",
      customComponent: { type: "pill-toggle", options: ["1:1", "16:9"] },
      control: { key: "aspect_ratio" },
    },
    { name: "subject", defaultValue: "" },
    {
      name: "quality",
      defaultValue: "high",
      customComponent: { type: "select", options: ["low", "medium", "high"] },
      control: { key: "quality" },
    },
    { name: "style", defaultValue: "studio photo" },
  ];

  it("orders content first, settings after, stably", () => {
    expect(orderVariablesForForm(DEFINITIONS).map((d) => d.name)).toEqual([
      "subject",
      "style",
      "aspect_ratio",
      "quality",
    ]);
    const already = orderVariablesForForm(DEFINITIONS);
    expect(orderVariablesForForm(already)).toBe(already);
  });

  it("every form style's selector hands out the grouped order", () => {
    let state = reducer(undefined, createInstanceFullPayloadForTest(CONVERSATION));
    state = reducer(
      state,
      initInstanceVariables({ conversationId: CONVERSATION, definitions: DEFINITIONS }),
    );
    const root = {
      instanceVariableValues: state,
      contextItems: { ids: [], entities: {} },
    } as unknown as Parameters<ReturnType<typeof selectVisibleInputDefinitions>>[0];
    expect(
      selectVisibleInputDefinitions(CONVERSATION)(root).map((d) => d.name),
    ).toEqual(["subject", "style", "aspect_ratio", "quality"]);
  });

  it("bound controls ride the same variables payload as text variables", () => {
    expect(
      resolveVariablesForRequest({
        definitions: DEFINITIONS,
        userValues: { subject: "ceramic mug", aspect_ratio: "16:9" },
        scopeValues: {},
      }),
    ).toEqual({
      aspect_ratio: "16:9",
      subject: "ceramic mug",
      quality: "high",
      style: "studio photo",
    });
  });
});
