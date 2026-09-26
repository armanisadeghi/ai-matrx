/**
 * The scopes-context organizations index (lane SCOPE-ADMIN-INDEX): the missing door onto the
 * per-organization scope console (`/administration/scopes-context/organizations/[orgId]`,
 * lane SCOPE-ADMIN-2), which before this page was reachable only by typing the URL. Proves the
 * list renders every organization with its member count and a link into its console, that a
 * search narrows it, and that a failed directory load says so instead of hanging blank.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("next/navigation", () => ({ usePathname: () => "/administration/scopes-context/organizations" }));
jest.mock("@/hooks/useDebugContext", () => ({
  useDebugContext: () => ({ publish: jest.fn(), publishKey: jest.fn(), isActive: false }),
}));

import { ScopesContextOrganizationsIndex } from "./ScopesContextOrganizationsIndex";
import type { AdminOrganizationDirectory } from "@/features/admin/users/types";
import type { OrganizationScopeSummary } from "./ScopesContextOrganizationsIndex";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG_A = { id: "org-a", name: "All Green Recycling", slug: "all-green-recycling" };
const ORG_B = { id: "org-b", name: "Data Destruction Inc", slug: "data-destruction-inc" };

function directoryOf(rows: { id: string; name: string; slug: string; member_count?: number }[]): AdminOrganizationDirectory {
  return {
    organizations: rows.map((r) => ({
      id: r.id,
      name: r.name,
      abbreviation: r.name.slice(0, 3).toUpperCase(),
      slug: r.slug,
      description: null,
      website: null,
      created_at: null,
      created_by: null,
      is_personal: false,
      is_system: false,
      archived_at: null,
      member_count: r.member_count ?? 0,
      owner_count: 1,
      admin_count: 1,
    })),
    memberships: [],
  };
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function render(
  directory: AdminOrganizationDirectory,
  summary: (id: string) => Promise<OrganizationScopeSummary> = async () => ({
    scopeTypeCount: 0,
    lastScopeChange: null,
  }),
) {
  await act(async () => {
    root.render(
      <ScopesContextOrganizationsIndex loadDirectory={async () => directory} loadScopeSummary={summary} />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ScopesContextOrganizationsIndex", () => {
  it("lists every organization with its member count and a link to its console", async () => {
    await render(directoryOf([{ ...ORG_A, member_count: 4 }, { ...ORG_B, member_count: 1 }]));

    const text = host.textContent ?? "";
    expect(text).toContain("All Green Recycling");
    expect(text).toContain("Data Destruction Inc");
    expect(text).toContain("4");

    const links = Array.from(host.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(links).toContain("/administration/scopes-context/organizations/org-a");
    expect(links).toContain("/administration/scopes-context/organizations/org-b");
  });

  it("shows the scope-type count and last-change timestamp once the per-organization summary lands", async () => {
    await render(
      directoryOf([{ ...ORG_A, member_count: 4 }]),
      async () => ({ scopeTypeCount: 3, lastScopeChange: "2026-09-24T12:00:00.000Z" }),
    );
    const text = host.textContent ?? "";
    expect(text).toContain("3");
    expect(text).toMatch(/2026/);
  });

  it("narrows the list to organizations matching the search", async () => {
    await render(directoryOf([ORG_A, ORG_B]));

    const input = host.querySelector("input") as HTMLInputElement;
    await act(async () => {
      input.dispatchEvent(new Event("focus", { bubbles: true }));
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Data Destruction");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const text = host.textContent ?? "";
    expect(text).toContain("Data Destruction Inc");
    expect(text).not.toContain("All Green Recycling");
  });

  it("says so when the directory fails to load, instead of hanging blank", async () => {
    await act(async () => {
      root.render(
        <ScopesContextOrganizationsIndex
          loadDirectory={async () => {
            throw new Error("Failed to load organizations");
          }}
          loadScopeSummary={async () => ({ scopeTypeCount: 0, lastScopeChange: null })}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.textContent ?? "").toContain("Failed to load organizations");
  });

  it("renders no organizations without hanging", async () => {
    await render(directoryOf([]));
    expect(host.textContent ?? "").toContain("No organizations yet.");
  });
});
