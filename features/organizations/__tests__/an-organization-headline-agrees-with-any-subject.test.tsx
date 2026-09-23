/**
 * AN ORGANIZATION HEADLINE READS RIGHT FOR ANY SUBJECT — cold walk 22.
 *
 * The dashboard's first sentence for a session with no organization read
 * "Your agenda need an organization". The headline was `${what} need an
 * organization`, right only for plural subjects; the census found singular
 * callers across the repo ("This meeting", "Scanner health", "a new education
 * note"). This renders the real notice with the dashboard's own subject and
 * then runs EVERY literal `what="…"` passed to the org notices in the source
 * tree through the headline builder.
 *
 * RED before the fix: the render printed "Your agenda need an organization".
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "fs";
import { execSync } from "child_process";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/organizations/components/OrganizationPickerPanel", () => ({
  OrganizationPickerPanel: () => null,
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => null,
  useAppDispatch: () => jest.fn(),
}));

import * as Notice from "@/features/organizations/components/OrganizationRequiredNotice";

function renderHeadline(what: string): string {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<Notice.OrganizationRequiredNotice what={what} />));
  const text = host.querySelector("h3")?.textContent ?? "";
  act(() => root.unmount());
  return text;
}

describe("the organization-required headline", () => {
  it("the dashboard's agenda: never 'Your agenda need an organization'", () => {
    const headline = renderHeadline("Your agenda");
    expect(headline).not.toMatch(/\bneed an organization/);
    expect(headline).toBe("An organization is needed for your agenda");
  });

  it("every subject passed anywhere in the repo reads without a number clash", () => {
    const files = execSync(
      "git grep -l -e 'OrganizationRequiredNotice' -e 'OrganizationContextNotice' -- '*.tsx'",
      { cwd: process.cwd(), encoding: "utf8" },
    )
      .split("\n")
      .filter((f) => f && !f.includes("__tests__") && !f.endsWith(".test.tsx"));
    const subjects = new Set<string>();
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\bwhat="([^"]+)"/g)) subjects.add(m[1]);
    }
    expect(subjects.size).toBeGreaterThan(10);
    for (const what of subjects) {
      const headline = renderHeadline(what);
      expect(headline).not.toMatch(/\bneeds? an organization/);
      expect(headline.startsWith("An organization is needed for ")).toBe(true);
    }
  });
});
