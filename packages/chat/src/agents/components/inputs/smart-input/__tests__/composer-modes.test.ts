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

describe("THE ONE TABLE — what each mode shows (A1, amended 2026-09-27)", () => {
  const PLUS = [
    "plus.attach",
    "plus.templates",
    "plus.memory",
    "plus.enterSends",
    "plus.skills",
    "plus.tools",
    "plus.connectors",
    "plus.previewContext",
    "plus.documents",
    "plus.environment",
    "plus.model",
  ] as const;

  it("no mode has less capability: the + menu is the same in Chat, Work and Advanced", () => {
    for (const mode of ["chat", "work", "advanced"] as const) {
      for (const control of PLUS) expect(composerShows(mode, control)).toBe(true);
    }
  });

  it("the modes differ only in chrome", () => {
    expect(composerShows("chat", "agent.presets")).toBe(true);
    expect(composerShows("chat", "agent.panel")).toBe(false);
    expect(composerShows("chat", "chips.row")).toBe(false);
    expect(composerShows("chat", "meta.effort")).toBe(false);
    expect(composerShows("work", "agent.panel")).toBe(true);
    expect(composerShows("work", "chips.row")).toBe(true);
    expect(composerShows("work", "meta.effort")).toBe(true);
    // A1 ruling: repos are Advanced-only.
    expect(composerShows("work", "chips.repos")).toBe(false);
    expect(composerShows("advanced", "chips.repos")).toBe(true);
    // Agents first (2026-09-28): only Chat names the model and lists chat agents;
    // Work and Advanced open the agent picker straight from the pill.
    expect(composerShows("work", "agent.presets")).toBe(false);
    expect(composerShows("advanced", "agent.presets")).toBe(false);
    expect(composerShows("advanced", "agent.panel")).toBe(true);
  });

  it("at compact width Scope and Output leave the meta row for the + menu (A5)", () => {
    expect(metaRowHoldsScopeAndOutput("compact")).toBe(false);
    expect(metaRowHoldsScopeAndOutput("page")).toBe(true);
    expect(metaRowHoldsScopeAndOutput("splash")).toBe(true);
  });

  it("phones get every sheet tab in every mode", () => {
    for (const mode of ["chat", "work", "advanced"] as const) {
      for (const tab of ["attach", "tools", "sandbox", "settings", "quickset", "memory"] as const) {
        expect(mobileSheetShowsTab(mode, tab)).toBe(true);
      }
    }
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
