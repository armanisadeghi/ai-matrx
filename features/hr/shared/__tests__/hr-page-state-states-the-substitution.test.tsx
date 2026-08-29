// features/hr/shared/__tests__/hr-page-state-states-the-substitution.test.tsx
//
// The RENDER half of `useHrContext` law B — no employer is ever substituted in
// silence. `employer-resolution-never-swaps-silently.test.tsx` proves the resolver
// REPORTS the substitution; this proves a page SAYS it, and says it once.
//
// Why `HrPageState` and not `HrShell`: the shell was the only renderer until
// 2026-08-29, and thirteen `/hr` routes never mount it — including
// `/hr/tasks/[instanceId]`, the landing every HR notification deep-links to. The
// disclosure now hangs off the state machine every HR surface runs through, so the
// two things that can break are (1) it stops rendering and (2) it renders twice
// because a chrome above already stated it. Both are asserted here.

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

import type { HrContextValue, HrEmployerSubstitution } from "../useHrContext";

const SUBSTITUTION: HrEmployerSubstitution = {
  askedName: "Castellano & Reyes, LLP",
  askedRef: "castellano-reyes",
  reason: "unavailable",
  openedName: "admin's Workspace",
};

let mockContext: HrContextValue;

jest.mock("../useHrContext", () => ({
  useHrContext: () => mockContext,
  isHrModuleOff: () => false,
  needsHrActivation: () => false,
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/hr/tasks",
}));

import { HrDisclosureClaimed, HrPageState } from "../HrStates";

function baseContext(
  substitution: HrEmployerSubstitution | null,
): HrContextValue {
  return {
    employers: [],
    active: {
      organization_id: "11111111-1111-4111-8111-111111111111",
      module_enabled: true,
      is_activated: true,
      org_role: "owner",
      persona: "hr_admin",
      capabilities: [],
    } as unknown as HrContextValue["active"],
    persona: "hr_admin",
    capabilities: [],
    orgRef: "admin",
    substitution,
    isLoading: false,
    error: null,
    refresh: () => {},
    asOf: "2026-08-29",
  };
}

async function render(node: React.ReactNode): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(node as React.ReactElement);
  });
  return container;
}

function notices(container: HTMLElement): number {
  return container.querySelectorAll("[data-hr-employer-substitution]").length;
}

describe("HrPageState states which employer opened", () => {
  it("says it — with the asked-for employer named and a way back", async () => {
    mockContext = baseContext(SUBSTITUTION);
    const container = await render(
      <HrPageState>
        <p>the page</p>
      </HrPageState>,
    );

    expect(notices(container)).toBe(1);
    // The sentence must name what actually opened, or it discloses nothing.
    expect(container.textContent).toContain("admin's Workspace");
    // The way back is a real door, not just a lament.
    expect(
      container.querySelector('a[href="/hr?org=castellano-reyes"]'),
    ).not.toBeNull();
    // And it never swallows the page it is qualifying.
    expect(container.textContent).toContain("the page");
  });

  it("stays silent when the employer that opened is the one that was asked for", async () => {
    mockContext = baseContext(null);
    const container = await render(
      <HrPageState>
        <p>the page</p>
      </HrPageState>,
    );

    // SPEC-UI-IA rule 3: nothing was overridden, so nothing is announced. This also
    // pins the zero-DOM promise the fix rests on — a page in the ordinary case must
    // lay out exactly as it did before the disclosure was added here.
    expect(notices(container)).toBe(0);
    expect(container.textContent).toBe("the page");
  });

  it("says it ONCE when a chrome above already claimed the disclosure", async () => {
    mockContext = baseContext(SUBSTITUTION);
    const container = await render(
      <HrDisclosureClaimed>
        <HrPageState>
          <p>the page</p>
        </HrPageState>
      </HrDisclosureClaimed>,
    );

    // `HrShell`, `HrTaskInbox` and `HrDecisionPanel` state it above the page and
    // claim it. Two amber bars saying the same thing reads as two substitutions.
    expect(notices(container)).toBe(0);
  });

  it("does not stack when HrPageState is nested inside HrPageState", async () => {
    mockContext = baseContext(SUBSTITUTION);
    const container = await render(
      <HrPageState>
        <HrPageState>
          <p>the page</p>
        </HrPageState>
      </HrPageState>,
    );

    // Real shape: `HrComplianceShell` runs the state machine, and the surface it
    // hosts runs it again. The outermost one owns the sentence.
    expect(notices(container)).toBe(1);
  });
});
