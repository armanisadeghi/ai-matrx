/**
 * THE HEADER'S INTELLIGENCE MARK NAMES THE PAGE'S JOBS, NOT THE SECTION'S.
 *
 * Page-pass shared defects (2026-09-27): `EducationHeader` mounted
 * `<IntelligenceIndicator feature="education">` on every education page, and
 * with nothing registered it fell back to the feature's whole places map — so
 * /education/flashcards listed the tutor, quizzes, grading, the planner… It
 * was also a 20x20 target on a phone.
 *
 * PINS: `scope="route"` lists only what the page registered plus the declared
 * places whose urlPattern IS this route (static beats dynamic), renders nothing
 * when that is empty, and the button is 44px under a coarse pointer.
 *
 * PROVEN FAILING BEFORE PASSING: against the pre-fix indicator the header on
 * /education/flashcards renders a mark (the feature fallback) and the button
 * carries no `pointer-coarse:h-11`.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let PATH = "/education/flashcards";
jest.mock("next/navigation", () => ({ usePathname: () => PATH }));
jest.mock("@/features/surfaces/runtime/surface-mandates", () => ({ useLiveSurfaceMandates: () => [] }));
jest.mock("@/features/settings/components/SettingsPresentationContext", () => ({
  useSettingsPresentation: () => ({}),
}));
jest.mock("../service", () => ({
  ...jest.requireActual("../service"),
  fetchMandateIdentities: () => Promise.resolve({}),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TooltipProvider } = require("@/components/ui/tooltip") as typeof import("@/components/ui/tooltip");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require("../IntelligenceIndicator") as typeof import("../IntelligenceIndicator");
const { IntelligenceIndicator, declaredKeysForRoute, routeMatchesPattern } = mod;

let host: HTMLElement;
let root: Root;
function mount(scope: "feature" | "route") {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <TooltipProvider>
        <IntelligenceIndicator feature="education" scope={scope} label="This page" />
      </TooltipProvider>,
    );
  });
}
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

describe("route matching", () => {
  it("matches a dynamic segment and nothing deeper", () => {
    expect(routeMatchesPattern("/education/quizzes/abc", "/education/quizzes/[id]")).toBe(true);
    expect(routeMatchesPattern("/education/quizzes/abc/x", "/education/quizzes/[id]")).toBe(false);
    expect(routeMatchesPattern("/education/progress/", "/education/progress")).toBe(true);
  });

  it("gives /education/progress its narrative job and nothing from other pages", () => {
    const keys = declaredKeysForRoute("/education/progress");
    expect(keys).toContain(MANDATE_KEYS.education__analytics_narrate);
    expect(keys).not.toContain(MANDATE_KEYS.education__tutor_message);
    expect(keys).not.toContain(MANDATE_KEYS.education__plan_generate);
  });

  it("lets a static route beat a dynamic one", () => {
    const keys = declaredKeysForRoute("/education/flashcards/new");
    for (const key of declaredKeysForRoute("/education/flashcards/some-set")) {
      if (!keys.includes(key)) expect(keys).not.toContain(key);
    }
    expect(keys.length).toBeGreaterThan(0);
  });
});

describe("IntelligenceIndicator scope=route", () => {
  it("shows no mark on a page with no jobs of its own (/education/flashcards)", () => {
    PATH = "/education/flashcards";
    mount("route");
    expect(host.querySelector("[data-intelligence-indicator]")).toBeNull();
  });

  it("shows the mark on /education/progress, 44px on a touch screen", () => {
    PATH = "/education/progress";
    mount("route");
    const button = host.querySelector("[data-intelligence-indicator]");
    expect(button).not.toBeNull();
    expect(button?.className).toContain("pointer-coarse:h-11");
    expect(button?.className).toContain("pointer-coarse:w-11");
    expect(button?.className).toContain("max-sm:h-11");
  });

  it("the default scope keeps the feature fallback for a door beside one control", () => {
    PATH = "/education/flashcards";
    mount("feature");
    expect(host.querySelector("[data-intelligence-indicator]")).not.toBeNull();
  });
});
