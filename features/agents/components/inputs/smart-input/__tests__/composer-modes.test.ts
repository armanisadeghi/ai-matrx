/**
 * The composer's three modes (Amendment 1, A1) and how the mode is chosen
 * (A1/A7). Both are pure tables/functions so the rule — not a rendering — is
 * pinned: if someone moves Skills into Chat, drops Environment from Advanced,
 * or lets a stored cookie win when "remember last mode" is off, this fails.
 */

import {
  composerShows,
  metaRowHoldsScopeAndOutput,
  mobileSheetShowsTab,
} from "../composer/composer-mode-visibility";
import { modeAfterKnobs, parseComposerModeCookie } from "../composer/composer-mode-cookie";

describe("THE ONE TABLE — what each mode shows (A1)", () => {
  it("Chat is attach-only: presets, no panel, no chips, no effort, no tools", () => {
    expect(composerShows("chat", "agent.presets")).toBe(true);
    expect(composerShows("chat", "agent.panel")).toBe(false);
    expect(composerShows("chat", "plus.attach")).toBe(true);
    expect(composerShows("chat", "plus.memory")).toBe(true);
    expect(composerShows("chat", "plus.templates")).toBe(true);
    for (const hidden of [
      "plus.skills",
      "plus.tools",
      "plus.connectors",
      "plus.previewContext",
      "plus.documents",
      "plus.environment",
      "chips.row",
      "chips.repos",
      "meta.effort",
    ] as const) {
      expect(composerShows("chat", hidden)).toBe(false);
    }
  });

  it("Work adds the agent panel, the working + rows, the chips row and Effort — never repos or Environment", () => {
    for (const shown of [
      "agent.panel",
      "plus.skills",
      "plus.tools",
      "plus.connectors",
      "plus.previewContext",
      "plus.documents",
      "chips.row",
      "meta.effort",
    ] as const) {
      expect(composerShows("work", shown)).toBe(true);
    }
    expect(composerShows("work", "agent.presets")).toBe(false);
    expect(composerShows("work", "agent.overrides")).toBe(false);
    // A1 ruling: repos are Advanced-only.
    expect(composerShows("work", "chips.repos")).toBe(false);
    expect(composerShows("work", "plus.environment")).toBe(false);
  });

  it("Advanced shows everything Work does, plus Overrides, Environment and repos", () => {
    for (const control of [
      "agent.panel",
      "agent.overrides",
      "plus.skills",
      "plus.tools",
      "plus.connectors",
      "plus.environment",
      "chips.row",
      "chips.repos",
      "meta.effort",
    ] as const) {
      expect(composerShows("advanced", control)).toBe(true);
    }
  });

  it("at compact width Scope and Output leave the meta row for the + menu (A5)", () => {
    expect(metaRowHoldsScopeAndOutput("compact")).toBe(false);
    expect(metaRowHoldsScopeAndOutput("page")).toBe(true);
    expect(metaRowHoldsScopeAndOutput("splash")).toBe(true);
  });

  it("phones follow the same modes in the bottom sheet", () => {
    expect(mobileSheetShowsTab("chat", "attach")).toBe(true);
    expect(mobileSheetShowsTab("chat", "tools")).toBe(false);
    expect(mobileSheetShowsTab("work", "tools")).toBe(true);
    expect(mobileSheetShowsTab("work", "sandbox")).toBe(false);
    expect(mobileSheetShowsTab("advanced", "sandbox")).toBe(true);
  });
});

describe("how the mode is chosen (A1/A7)", () => {
  it("a stored cookie survives only while remembering", () => {
    expect(modeAfterKnobs({ cookieMode: "work", rememberKnob: true, defaultModeKnob: "chat" })).toEqual({
      apply: null,
      clearCookie: false,
    });
    expect(modeAfterKnobs({ cookieMode: "work", rememberKnob: false, defaultModeKnob: "chat" })).toEqual({
      apply: "chat",
      clearCookie: true,
    });
  });

  it("with no cookie the default-mode knob decides; an unknown default is Chat", () => {
    expect(modeAfterKnobs({ cookieMode: null, rememberKnob: true, defaultModeKnob: "advanced" })).toEqual({
      apply: "advanced",
      clearCookie: false,
    });
    expect(modeAfterKnobs({ cookieMode: null, rememberKnob: true, defaultModeKnob: "turbo" })).toEqual({
      apply: "chat",
      clearCookie: false,
    });
  });

  it("a mode the person picked before the knobs answered is never snapped back", () => {
    expect(
      modeAfterKnobs({ cookieMode: "advanced", rememberKnob: false, defaultModeKnob: "chat", choseThisTab: true }),
    ).toEqual({ apply: null, clearCookie: true });
    expect(
      modeAfterKnobs({ cookieMode: "work", rememberKnob: true, defaultModeKnob: "chat", choseThisTab: true }),
    ).toEqual({ apply: null, clearCookie: false });
  });

  it("the cookie parser admits only real modes", () => {
    expect(parseComposerModeCookie("work")).toBe("work");
    expect(parseComposerModeCookie("Work")).toBeNull();
    expect(parseComposerModeCookie(undefined)).toBeNull();
  });
});
