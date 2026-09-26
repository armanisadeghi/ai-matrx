/**
 * The settings document round-trips: build → parse is the identity, and every
 * edit lands in exactly one place (settings OR a bound variable), never both,
 * and a `$var` marker never becomes a stored setting.
 */

import {
  buildSettingsDocument,
  describeSetting,
  parseSettingsDocument,
} from "../settings-document";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import type { ControlDefinition } from "@/features/agents/hooks/useModelControls";

const QUALITY: ControlDefinition = {
  type: "enum",
  enum: ["auto", "low", "medium", "high"],
  default: "auto",
};
const COUNT: ControlDefinition = { type: "integer", min: 1, max: 10 };
const controls: Record<string, ControlDefinition> = { quality: QUALITY, count: COUNT };
const getControl = (k: string) => controls[k];

const vars: VariableDefinition[] = [
  { name: "subject", defaultValue: "", required: true },
  { name: "aspect_ratio", control: { key: "aspect_ratio" }, defaultValue: "1:1" },
  { name: "quality", control: { key: "quality" }, defaultValue: "medium" },
];
const settings = { moderation: "low", count: 2 };

test("the document holds identity, literals, and each binding as a marker", () => {
  expect(
    buildSettingsDocument({
      modelId: "gpt-image-2",
      tools: ["t1"],
      settings: { ...settings, model_id: "stale", tools: [] },
      variableDefinitions: vars,
    }),
  ).toEqual({
    model_id: "gpt-image-2",
    tools: ["t1"],
    moderation: "low",
    count: 2,
    aspect_ratio: { $var: "aspect_ratio", default: "1:1" },
    quality: { $var: "quality", default: "medium" },
  });
});

test("a binding wins over a stale literal for the same key (the server applies it last)", () => {
  const doc = buildSettingsDocument({
    modelId: "m",
    settings: { quality: "low" },
    variableDefinitions: vars,
  });
  expect(doc.quality).toEqual({ $var: "quality", default: "medium" });
});

test("build → parse is the identity", () => {
  const doc = buildSettingsDocument({ modelId: "m", settings, variableDefinitions: vars });
  const parsed = parseSettingsDocument(doc, { settings, variableDefinitions: vars }, getControl);
  expect(parsed.errors).toEqual([]);
  expect(parsed.bindingsChanged).toBe(false);
  expect(parsed.settings).toEqual(settings);
  expect(parsed.variableDefinitions).toBe(vars);
});

test("legacy identity keys stored in settings are carried through untouched", () => {
  const stored = { model_id: "legacy", moderation: "low" };
  const doc = buildSettingsDocument({ modelId: "m", settings: stored, variableDefinitions: [] });
  const parsed = parseSettingsDocument(doc, { settings: stored, variableDefinitions: [] });
  expect(parsed.settings).toEqual(stored);
});

test("marker default edit updates the variable only", () => {
  const doc = buildSettingsDocument({ modelId: "m", settings, variableDefinitions: vars });
  const parsed = parseSettingsDocument(
    { ...doc, quality: { $var: "quality", default: "high" } },
    { settings, variableDefinitions: vars },
    getControl,
  );
  expect(parsed.settings).toEqual(settings);
  expect(parsed.variableDefinitions.find((d) => d.name === "quality")?.defaultValue).toBe("high");
});

test("a literal on a bound key unbinds it; removing the key unbinds and unsets", () => {
  const doc = buildSettingsDocument({ modelId: "m", settings, variableDefinitions: vars });
  const { aspect_ratio: _gone, ...withoutAspect } = doc;
  const parsed = parseSettingsDocument(
    { ...withoutAspect, quality: "high" },
    { settings, variableDefinitions: vars },
    getControl,
  );
  expect(parsed.settings).toEqual({ ...settings, quality: "high" });
  expect(parsed.variableDefinitions.map((d) => d.name)).toEqual(["subject"]);
});

test("a marker on an unbound key makes it a run input with the derived component", () => {
  const doc = buildSettingsDocument({ modelId: "m", settings, variableDefinitions: vars });
  const parsed = parseSettingsDocument(
    { ...doc, count: { $var: "count", default: "3" } },
    { settings, variableDefinitions: vars },
    getControl,
  );
  expect(parsed.settings).toEqual({ moderation: "low" });
  const count = parsed.variableDefinitions.find((d) => d.control?.key === "count");
  expect(count).toMatchObject({ name: "count", defaultValue: "3", control: { key: "count" } });
  expect(count?.customComponent?.type).toBe("slider");
});

test("nothing marker-shaped is ever returned as a setting", () => {
  const parsed = parseSettingsDocument(
    { moderation: "low", bad: { $var: "x", extra: 1 } },
    { settings: {}, variableDefinitions: [] },
  );
  expect(parsed.settings).toEqual({ moderation: "low" });
  expect(parsed.errors).toHaveLength(1);
});

test("renaming a run input or colliding with a variable name is refused with a reason", () => {
  const doc = buildSettingsDocument({ modelId: "m", settings, variableDefinitions: vars });
  expect(
    parseSettingsDocument(
      { ...doc, quality: { $var: "renamed", default: "medium" } },
      { settings, variableDefinitions: vars },
    ).errors[0],
  ).toMatch(/rename it in Variables/);
  expect(
    parseSettingsDocument(
      { ...doc, count: { $var: "subject", default: "3" } },
      { settings, variableDefinitions: vars },
    ).errors[0],
  ).toMatch(/already exists/);
});

test("describeSetting agrees with the document for every key", () => {
  const source = { settings, variableDefinitions: vars };
  const doc = buildSettingsDocument({ modelId: "m", ...source });
  for (const key of ["moderation", "count", "quality", "aspect_ratio", "background"]) {
    const view = describeSetting(key, source, controls[key]);
    if (view.state === "bound") {
      expect(doc[key]).toEqual({ $var: view.variableName, default: view.value });
    } else if (view.state === "set") {
      expect(doc[key]).toEqual(view.value);
    } else {
      expect(doc).not.toHaveProperty(key);
    }
  }
  expect(describeSetting("background", source, { type: "enum", enum: ["auto"] })).toEqual({
    state: "unset",
  });
  expect(describeSetting("quality", { settings: {}, variableDefinitions: [] }, QUALITY)).toEqual({
    state: "default",
    value: "auto",
  });
});
