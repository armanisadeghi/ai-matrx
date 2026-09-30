// the-table-picker-lists-every-organization.test.tsx — LANE ORG-FILTER-CLASS
//
// THE USE CASE (Arman, 2026-09-30). The owner of Harbor Dental Group also keeps the books for
// Rincon Plumbing Co, and Ojai Valley Home Services shared its "Backflow test schedule" with her.
// Working in Rincon Plumbing, she opens an agent's "Edit variables → Fill automatically → From my
// data" to bind a variable to her "Patient recall list" (Harbor Dental). The picker listed only
// the ACTIVE organization's tables (Rincon's), so the table she wanted was not there — while the
// data home under All Orgs lists all three. "The two lists aren't identical."
//
// The ruling:
//   1. the picker lists the data home's own rows (custom.data_home_tables) — every table she can
//      see across ALL her organizations, a table shared in from outside included, each naming
//      its organization; one flat list, never grouped by organization;
//   2. the organization filter sits on the Table row, starts on All Orgs, is honoured in the door
//      (the door is asked for the one organization chosen) and is saved to her account;
//   3. the active organization is not an input: switching it changes nothing here.
//
// RED on HEAD: the picker read `useTables()` of a provider bound to the active organization.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HARBOR = "11f4e747-0000-4000-8000-000000000001";
const RINCON = "884d1ce8-0000-4000-8000-000000000002";
const OJAI = "5b0e2a11-0000-4000-8000-000000000003";

function row(id: string, name: string, org: string, orgName: string, extra: Record<string, unknown> = {}) {
  return {
    table_id: id,
    table_name: name,
    organization_id: org,
    organization_name: orgName,
    member: org !== OJAI,
    visibility: "internal",
    updated_at: "2026-09-27T15:40:00Z",
    mine: false,
    shared_with_me: org === OJAI,
    kept_by_the_app: false,
    kind: "table",
    ...extra,
  };
}

const EVERY_ROW = [
  row("a1000000-0000-4000-8000-000000000001", "Patient recall list", HARBOR, "Harbor Dental Group", { mine: true }),
  row("a1000000-0000-4000-8000-000000000002", "Service calls", RINCON, "Rincon Plumbing Co"),
  row("a1000000-0000-4000-8000-000000000003", "Backflow test schedule", OJAI, "Ojai Valley Home Services"),
  row("a1000000-0000-4000-8000-000000000004", "Status choices", RINCON, "Rincon Plumbing Co", {
    kept_by_the_app: true,
    kind: "list",
  }),
];

/** Which organization each call to custom.data_home_tables named (null = every organization). */
const doorAskedFor: Array<string | null> = [];
const saved: unknown[] = [];
let savedPick: string | null = null;

jest.mock("@/features/unified-data/hub/doors", () => ({
  dataHomeTables: jest.fn(async (_ds: unknown, org: string | null = null) => {
    doorAskedFor.push(org);
    return { ok: true, data: org ? EVERY_ROW.filter((r) => r.organization_id === org) : EVERY_ROW };
  }),
}));

// The ACTIVE organization is Rincon. On HEAD the picker's provider was bound to it, so its
// `useTables()` answered Rincon's tables only — exactly what this stand-in answers.
jest.mock("@ai-matrx/records/react", () => ({
  useTables: () => ({
    loading: false,
    error: null,
    data: EVERY_ROW.filter((r) => r.organization_id === RINCON).map((r) => ({
      id: r.table_id,
      name: r.table_name,
      organization_id: RINCON,
      ...(r.kept_by_the_app ? { kept_by_the_app: true } : {}),
    })),
    reload: () => {},
  }),
  useTable: () => ({ loading: false, error: null, data: null }),
  useFields: () => ({ loading: false, error: null, data: [] }),
  useRecords: () => ({ loading: false, error: null, data: { rows: [], total: 0 } }),
  isEntityReferenceConfig: () => false,
  RecordsProvider: ({ children }: { children: unknown }) => children,
}));
jest.mock("@ai-matrx/records-ui", () => ({
  fieldName: (f: { key: string }) => f.key,
  rowNameIn: () => "",
  tableName: (t: { name: string }) => t.name,
  keptByTheApp: (t: { kept_by_the_app?: boolean }) => t.kept_by_the_app === true,
  recordsDataSource: () => ({ rpc: jest.fn() }),
  personActor: () => ({}),
}));
jest.mock("@ai-matrx/design-system", () => ({
  Input: () => null,
  Textarea: () => null,
}));
jest.mock("@/components/ui/creatable-picker", () => ({
  CreatablePicker: ({
    options,
    footerActions,
  }: {
    options: Array<{ value: string; label: string; hint?: string }>;
    footerActions?: Array<{ label: string; onSelect: () => void }>;
  }) => (
    <div>
      <ul data-options>
        {options.map((o) => (
          <li key={o.value} data-option={o.value}>
            {o.label} — {o.hint}
          </li>
        ))}
      </ul>
      {(footerActions ?? []).map((a) => (
        <button key={a.label} type="button" data-footer onClick={a.onSelect}>
          {a.label}
        </button>
      ))}
    </div>
  ),
}));
// The shadcn primitives are not what this suite is about; plain stand-ins keep it to the list.
jest.mock("@/components/ui/label", () => ({
  Label: ({ children }: { children?: unknown }) => <span>{children as never}</span>,
}));
jest.mock("@/components/ui/select", () => {
  const Pass = ({ children }: { children?: unknown }) => <>{children as never}</>;
  return { Select: Pass, SelectContent: Pass, SelectItem: Pass, SelectTrigger: Pass, SelectValue: () => null };
});
jest.mock("../CustomDataBindingPreview", () => ({ CustomDataBindingPreview: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: () => unknown) => selector(),
  useAppDispatch: () => (action: unknown) => {
    saved.push(action);
  },
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "87a6e699-3622-4869-8843-d0867456c0dd" }));
jest.mock("@/lib/redux/preferences/userPreferenceSelectors", () => ({
  selectDataHomeOrganizationPick: () => savedPick,
  selectPreferencesLoadStatus: () => "loaded",
}));
jest.mock("@/lib/redux/preferences/userPreferencesSlice", () => ({
  setModulePreferences: (payload: unknown) => ({ type: "setModulePreferences", payload }),
}));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({ useEffectiveKnob: () => "all" }));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({
    loading: false,
    organizations: [
      { id: HARBOR, name: "Harbor Dental Group" },
      { id: RINCON, name: "Rincon Plumbing Co" },
    ],
  }),
}));
jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => ({ organizationId: RINCON, organizationState: "ready" }),
}));
jest.mock("@/features/unified-data/objectOrganization", () => ({
  useObjectOrganization: () => ({ state: "resolving", retry: () => {} }),
}));

import { CustomDataBindingPicker } from "../CustomDataBindingPicker";

const UNBOUND = {
  kind: "merge_field" as const,
  source: "record" as const,
  semantic_type: "collection" as const,
  table_id: "",
  missing: "absent" as const,
  override_policy: "shown_locked" as const,
};

let host: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(<CustomDataBindingPicker binding={UNBOUND} onChange={() => {}} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function offered(): string[] {
  return [...host.querySelectorAll("[data-option]")].map((li) => li.textContent ?? "");
}

beforeEach(() => {
  doorAskedFor.length = 0;
  saved.length = 0;
  savedPick = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("lists every table she can see in EVERY organization — not the active organization's alone", async () => {
  await render();
  const names = offered().join("\n");
  expect(names).toContain("Patient recall list"); // Harbor Dental, not the active organization
  expect(names).toContain("Service calls"); // Rincon, the active organization
  expect(names).toContain("Backflow test schedule"); // shared in from an organization she is not in
  expect(doorAskedFor).toEqual([null]); // All Orgs: the door is asked for every organization
});

it("names each row's organization — one flat list, never grouped", async () => {
  await render();
  expect(offered()).toEqual(
    expect.arrayContaining([
      expect.stringContaining("Patient recall list — Harbor Dental Group"),
      expect.stringContaining("Backflow test schedule — Ojai Valley Home Services"),
    ]),
  );
});

it("keeps the old picker's fold for tables the app keeps, counted across every organization", async () => {
  await render();
  expect(offered().join("\n")).not.toContain("Status choices");
  const fold = host.querySelector<HTMLButtonElement>("[data-footer]");
  expect(fold?.textContent).toBe("Show 1 table the app keeps");
  await act(async () => fold!.click());
  expect(offered().join("\n")).toContain("Status choices — Rincon Plumbing Co · list · kept by the app");
});

it("shows the organization filter on the Table row, starting on All Orgs, and saves a pick", async () => {
  await render();
  const filter = host.querySelector<HTMLSelectElement>("select[aria-label='Organization']");
  expect(filter).not.toBeNull();
  expect(filter!.value).toBe("all");
  expect([...filter!.options].map((o) => o.textContent)).toEqual([
    "All Orgs",
    "Harbor Dental Group",
    "Rincon Plumbing Co",
  ]);
  await act(async () => {
    filter!.value = HARBOR;
    filter!.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(saved).toEqual([
    { type: "setModulePreferences", payload: { module: "lists", preferences: { dataHomeOrganizationId: HARBOR } } },
  ]);
});

it("honours a saved pick IN THE DOOR — only that organization's tables", async () => {
  savedPick = HARBOR;
  await render();
  expect(doorAskedFor).toEqual([HARBOR]);
  expect(offered().join("\n")).toContain("Patient recall list");
  expect(offered().join("\n")).not.toContain("Service calls");
});
