// The pure halves of the settings change log (lib/scoped-config/history.ts):
// the configuration diff behind "Compare", and the door words on every History entry.
// The DB halves (one row per write per door, revert, export replay) are proven live by
// `pnpm check:settings-history`.

import { diffConfigurations, doorLabel, type ConfigurationKnob } from "../history";

jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));

function knob(key: string, effective: unknown, origin: "organization" | "platform" = "platform"): ConfigurationKnob {
  return {
    key,
    feature: key.split(".").slice(0, -1).join("."),
    name: key.split(".").pop()!,
    label: key,
    value_type: "integer",
    platform_value: effective,
    organization_value: origin === "organization" ? effective : null,
    effective_value: effective,
    origin,
  };
}

test("only keys whose value in effect differs are reported, sorted by key", () => {
  const left = { knobs: [knob("b.x", 8), knob("a.y", true), knob("c.z", "pages")] };
  const right = { knobs: [knob("b.x", 11, "organization"), knob("a.y", true), knob("c.z", "scroll")] };
  const rows = diffConfigurations(left, right);
  expect(rows.map((r) => r.key)).toEqual(["b.x", "c.z"]);
  expect(rows[0]).toMatchObject({ left: 8, right: 11, leftOrigin: "platform", rightOrigin: "organization" });
});

test("a key on one side only is a difference, with the missing side undefined", () => {
  const rows = diffConfigurations({ knobs: [knob("a.y", 1)] }, { knobs: [] });
  expect(rows).toEqual([expect.objectContaining({ key: "a.y", left: 1, right: undefined })]);
});

test("structured values compare by content, not identity", () => {
  expect(diffConfigurations({ knobs: [knob("j.k", { a: 1 })] }, { knobs: [knob("j.k", { a: 1 })] })).toEqual([]);
});

test("every door is said in words; an unrecorded door says so", () => {
  expect(doorLabel("ui")).toBe("in the app");
  expect(doorLabel("api")).toBe("through the API");
  expect(doorLabel("migration")).toBe("by a platform update");
  expect(doorLabel("server")).toBe("by the server");
  expect(doorLabel(null)).toBe("door not recorded");
  expect(doorLabel("webhook")).toBe("via webhook");
});
