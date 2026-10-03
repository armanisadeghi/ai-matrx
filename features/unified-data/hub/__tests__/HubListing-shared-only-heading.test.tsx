// features/unified-data/hub/__tests__/HubListing-shared-only-heading.test.tsx
//
// THE HEADING SAYS WHAT THE COUNT COUNTS (ACTIVE-ORG-PAGES, VERIFIER-17 H3).
//
// Alex Hart is a member of admin's Workspace. Her hub read "Tables 1 — Everything this organization keeps records in" while the
// organization keeps 26: the count was hers, the sentence was the organization's. This suite runs
// the REAL `HUB_CAPABILITIES` Tables declaration through the real `HubListing`, so it fails the
// moment the sentence beside her count claims the whole organization again.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { HubListing } from "../HubListing";
import { HUB_CAPABILITIES } from "../capabilities";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const FOUND = HUB_CAPABILITIES.find((c) => c.id === "tables");
if (!FOUND) throw new Error("the hub no longer declares Tables");
const TABLES = FOUND;

const ONE_SHARED_TABLE = {
  phase: "read" as const,
  items: [
    {
      id: "t-1",
      title: "Parts Used",
      tableId: "t-1",
      tableName: "Parts Used",
      lane: null,
      facts: ["6 columns"],
      href: "/data-v2/t-1",
      changedAt: null,
      changedBy: null,
    },
  ],
};

let container: HTMLDivElement;
let root: Root;

async function render(): Promise<string> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <HubListing
        capability={TABLES}
        state={ONE_SHARED_TABLE}
        open={false}
        onOpenChange={() => undefined}
      />,
    );
  });
  const heading = container.querySelector('[data-hub-listing-toggle="tables"]')?.textContent ?? "";
  await act(async () => root.unmount());
  container.remove();
  return heading;
}

describe("the Tables heading says what the count counts", () => {
  it("never tells a member her count is everything the organization keeps", async () => {
    const heading = await render();
    expect(heading).not.toMatch(/everything this organization/i);
    expect(heading).toMatch(/you can open/i);
  });

  // ACCESS LADDER (custom data adoption, 2026-10-03): every member opens every Organization-level
  // table, so no organization "shows each member only what is shared" any more — the heading never
  // says so (the retired custom/member_default_visibility setting).
  it("never claims the organization shows a member only what is shared", async () => {
    const heading = await render();
    expect(heading).not.toMatch(/only what is shared/i);
  });
});
