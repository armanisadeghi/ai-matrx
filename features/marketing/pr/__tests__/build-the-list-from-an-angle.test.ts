/**
 * "BUILD THE LIST" FROM A STORY ANGLE (outside-skill-packs, 2026-10-05).
 *
 * The media-list research dialog opened only from the outreach lists page, so a PR person
 * looking at a ready angle had to leave it, make a list, and retype the angle. The angle row
 * now offers "Build the list", which opens that SAME dialog prefilled from the angle.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  defaultListName,
  prefillFromAngle,
  PRESS_LIST_CHANNEL_KNOB,
  pressListKind,
} from "../components/BuildMediaListFromAngle";

const WORKSPACE = join(__dirname, "..", "PressRoomWorkspace.tsx");

test("the Press Room's angle row offers Build the list", () => {
  expect(readFileSync(WORKSPACE, "utf8")).toMatch(/<BuildMediaListFromAngle angle=\{angle\} \/>/);
});

test("the research form is prefilled from the angle", () => {
  const prefill = prefillFromAngle({
    headline: "Shredders miss 1 in 5 drives",
    summary: "Our audit of 400 decommissioned drives found recoverable data on 81.",
    target_beat: "data security",
    target_outlet_kind: "trade",
    endowment: "data",
    facts: [{ statement: "400 drives audited in Q3" }],
  });
  expect(prefill.angle).toBe(
    "Shredders miss 1 in 5 drives\n\nOur audit of 400 decommissioned drives found recoverable data on 81.",
  );
  expect(prefill.reporterShape).toBe("Beat: data security · Outlet: Trade press");
  expect(prefill.standing).toBe("Data: Numbers only you hold; 400 drives audited in Q3");
  expect(prefill.sourceLabel).toContain("Shredders miss 1 in 5 drives");
});

test("an angle with nothing but a headline still prefills the angle", () => {
  const prefill = prefillFromAngle({
    headline: "A quiet milestone",
    summary: "",
    target_beat: null,
    target_outlet_kind: null,
    endowment: "unknown",
    facts: [],
  });
  expect(prefill.angle).toBe("A quiet milestone");
  expect(prefill.reporterShape).toBeUndefined();
  expect(prefill.standing).toBeUndefined();
});

test("a new list is named after the angle", () => {
  expect(defaultListName("Shredders miss 1 in 5 drives")).toBe("Media list — Shredders miss 1 in 5 drives");
  expect(defaultListName("x".repeat(80)).length).toBeLessThanOrEqual(73);
});

describe("a new press list's channel is the knob pr.new_press_list_channel", () => {
  const SOURCE = readFileSync(join(__dirname, "..", "components", "BuildMediaListFromAngle.tsx"), "utf8");

  test("the door reads the knob, never a hard-coded email", () => {
    expect(PRESS_LIST_CHANNEL_KNOB).toEqual({ feature: "pr", key: "new_press_list_channel" });
    expect(SOURCE).not.toMatch(/kind:\s*"email"/);
    expect(SOURCE).toMatch(/ensureEffectiveKnob\(/);
  });

  test("each register choice becomes that list kind; anything else is a named failure", () => {
    expect(pressListKind("email")).toBe("email");
    expect(pressListKind("call")).toBe("call");
    expect(pressListKind("mixed")).toBe("mixed");
    expect(() => pressListKind(undefined)).toThrow(/pr\.new_press_list_channel/);
  });
});
