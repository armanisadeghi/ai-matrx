/**
 * LANE PROOF-DEFECTS (D5) — THE ORGANIZATION'S TABLES PAGE READS THE RECORD STORE, AND KEEPS
 * WHAT THE APP KEEPS BEHIND "SHOW EVERYTHING".
 *
 * THE USE CASE. Harbor Dental Group's office manager opens the organization's Tables page. She
 * sees Hygiene Recall Schedule; she does not see "Insurance Carriers" (the choice list behind a
 * column) until she presses Show everything — the same as on /data. No workbench table is read.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG = "11f4e747-c13a-49c7-81a3-66e6391f8a9b";
const fromCalls: string[] = [];
const rpc = jest.fn(async () => ({
  data: {
    success: true,
    tables: [
      { id: "b00bde4d-1adc-4682-88eb-57453aabf014", store: "records", table_name: "Hygiene Recall Schedule", platform_owned: false, updated_at: "2026-09-26T22:23:55Z" },
      { id: "a1d011b4-a20f-4162-a0a5-f1251cf37c3b", store: "records", table_name: "Insurance Carriers", platform_owned: true, kept_for: "choices", updated_at: "2026-09-26T16:22:48Z" },
    ],
  },
  error: null,
}));
jest.mock("@/utils/supabase/client", () => {
  const client = {
    schema: (schema: string) => ({
      rpc,
      from: (table: string) => {
        fromCalls.push(`${schema}.${table}`);
        const q = { select: () => q, eq: () => q, is: () => q, in: () => q, order: async () => ({ data: [], error: null }), then: undefined };
        return q;
      },
    }),
    from: (table: string) => {
      fromCalls.push(table);
      return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
    },
  };
  return { supabase: client, createClient: () => client };
});
jest.mock("next/navigation", () => ({ useParams: () => ({ orgId: "harbor-dental-group" }) }));
jest.mock("@/features/organizations/hooks", () => ({
  useResolvedOrganization: () => ({ organization: { name: "Harbor Dental Group" }, organizationId: ORG, error: null, refresh: () => undefined }),
}));
jest.mock("../../OrgResourceLayout", () => ({ OrgResourceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock("@ai-matrx/records-ui", () => ({
  RecordsMount: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  WhereItLives: () => null,
  personActor: () => ({}),
  recordsDataSource: () => ({}),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "87a6e699-3622-4869-8843-d0867456c0dd" }));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/utils/permissions/orgResources", () => ({ listOrgSharedResources: async () => [] }));
jest.mock("@/features/organizations/peek/ResourcePeekHost", () => ({ ResourcePeekHost: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const OrgTablesPage = require("../page").default as () => React.ReactElement;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function settle() {
  for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

test("the page lists the organization's own tables and keeps the app's behind Show everything", async () => {
  act(() => root.render(<OrgTablesPage />));
  await settle();
  expect(host.textContent).toContain("Hygiene Recall Schedule");
  expect(host.textContent).not.toContain("Insurance Carriers");
  expect(host.textContent).toContain("1 table the app keeps for itself is not listed here.");
  expect(fromCalls.filter((c) => c.includes("workbench"))).toEqual([]);
  expect(rpc).toHaveBeenCalledWith("table_list_everywhere", { p_organization_id: ORG });

  const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "Show everything");
  expect(button).toBeDefined();
  act(() => button!.click());
  await settle();
  expect(host.textContent).toContain("Insurance Carriers");
  expect(host.textContent).toContain("Hide what the app keeps");
});
