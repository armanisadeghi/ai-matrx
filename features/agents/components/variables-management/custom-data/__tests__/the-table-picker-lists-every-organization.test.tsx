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
//   2. the organization filter is the SHELL'S (`EntityOrgFilter`) on the Table row: it starts on
//      All organizations every time, narrows the list to the one organization chosen, and is never
//      remembered (law: common-docs/policies/access-ladder.md);
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
    team: false,
    system: false,
    created_by: null,
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
  // Published by an organization she is not in: Public lane only, never folded into All.
  row("a1000000-0000-4000-8000-000000000005", "Tide chart", "7e000000-0000-4000-8000-000000000009", "Harbor Tide Co-op", {
    member: false,
    shared_with_me: false,
    visibility: "public",
  }),
];

/** Which organization each call to custom.data_home_tables named (null = every organization). */
const doorAskedFor: Array<string | null> = [];

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
  platformOwned: (t: { kept_by_the_app?: boolean }) => t.kept_by_the_app === true,
  recordsDataSource: () => ({ rpc: jest.fn() }),
  personActor: () => ({}),
  // The picker's one rule (records-ui tablePicking): tables only, the chosen one always kept.
  tablePickerEntries: (
    rows: Array<{ id: string; kept_by_the_app?: boolean }>,
    { keep }: { keep?: string | null },
  ) => ({ entries: rows.filter((r) => !r.kept_by_the_app || r.id === keep).map((table) => ({ table })) }),
}));
// Keeps the real module (the chat package reads `cn` etc. from it at import time); only the two inputs are stand-ins.
jest.mock("@ai-matrx/design-system", () => ({
  ...jest.requireActual("@ai-matrx/design-system"),
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
  return {
    Select: Pass,
    SelectContent: Pass,
    SelectGroup: Pass,
    SelectLabel: Pass,
    SelectItem: Pass,
    SelectTrigger: Pass,
    SelectTriggerLegacy: Pass, // EntityScopeTabs imports the legacy trigger name (a7aa1e3fb8)
    SelectValue: () => null,
  };
});
jest.mock("../CustomDataBindingPreview", () => ({ CustomDataBindingPreview: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
// The shell's dropdown, as plain buttons: the menu mechanics are not what this suite is about.
jest.mock("@/components/ui/dropdown-menu", () => {
  const Pass = ({ children }: { children?: unknown }) => <>{children as never}</>;
  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuLabel: Pass,
    DropdownMenuSeparator: () => null,
    DropdownMenuItem: ({ children, onSelect }: { children?: unknown; onSelect?: () => void }) => (
      <button type="button" data-org-choice onClick={() => onSelect?.()}>
        {children as never}
      </button>
    ),
  };
});
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
  expect(offered().join("\n")).toContain("Status choices — Rincon Plumbing Co · list · platform table");
});

it("shows the shell's organization filter on the Table row, starting on All organizations", async () => {
  await render();
  const trigger = host.querySelector<HTMLButtonElement>("[data-entity-org-filter]");
  expect(trigger?.textContent).toContain("All organizations");
  const choices = [...host.querySelectorAll<HTMLButtonElement>("[data-org-choice]")].map((b) => b.textContent);
  // All organizations first; each organization with its count from the complete answer.
  expect(choices[0]).toContain("All organizations");
  expect(choices.join("|")).toContain("Harbor Dental Group1");
  // Counts are what the list shows: Rincon's "Status choices" sits behind the platform-owned fold.
  expect(choices.join("|")).toContain("Rincon Plumbing Co1");
});

it("narrows to the organization chosen — and the door is asked once, for every organization", async () => {
  await render();
  const harbor = [...host.querySelectorAll<HTMLButtonElement>("[data-org-choice]")].find((b) =>
    b.textContent?.includes("Harbor Dental Group"),
  );
  await act(async () => harbor!.click());
  expect(offered().join("\n")).toContain("Patient recall list");
  expect(offered().join("\n")).not.toContain("Service calls");
  expect(doorAskedFor).toEqual([null]);
});

it("is never remembered: a fresh picker starts on All organizations again", async () => {
  await render();
  const harbor = [...host.querySelectorAll<HTMLButtonElement>("[data-org-choice]")].find((b) =>
    b.textContent?.includes("Harbor Dental Group"),
  );
  await act(async () => harbor!.click());
  act(() => root.unmount());
  root = createRoot(host);
  await render();
  expect(host.querySelector("[data-entity-org-filter]")?.textContent).toContain("All organizations");
  expect(offered().join("\n")).toContain("Service calls");
});


function tab(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) =>
    (b.textContent ?? "").startsWith(label),
  );
  if (!found) throw new Error(`no "${label}" tab`);
  return found;
}

it("draws the shell's lanes — All · Mine · My team · My Orgs · Shared · Public · System — starting on All", async () => {
  await render();
  const labels = [...host.querySelectorAll('[role="tab"]')].map((b) => (b.textContent ?? "").replace(/\d+$/, ""));
  expect(labels).toEqual(["All", "Mine", "My team", "My Orgs", "Shared", "Public", "System"]);
  expect(tab("All").getAttribute("aria-selected")).toBe("true");
  // All = Mine ∪ My team ∪ My Orgs ∪ Shared: the public table of an outside organization is not in it.
  expect(offered().join("\n")).not.toContain("Tide chart");
  expect(tab("All").textContent).toContain("3");
});

it("each lane narrows the list to its own rows", async () => {
  await render();
  await act(async () => tab("Mine").click());
  expect(offered().map((o) => o.split(" — ")[0])).toEqual(["Patient recall list"]);
  await act(async () => tab("Shared").click());
  expect(offered().map((o) => o.split(" — ")[0])).toEqual(["Backflow test schedule"]);
  await act(async () => tab("Public").click());
  expect(offered().map((o) => o.split(" — ")[0])).toEqual(["Tide chart"]);
});
