/**
 * Lane LISTS-AFTER-SWITCH — the Lists pages after Data tables → new system.
 *
 * The switch archives an organization's older pick lists and each one lives on in the record store
 * as a Table of choices under the SAME id. Every Lists screen read only the older table, so after
 * the switch Harbor Dental Group's lists vanished from /lists, and a list handed to the older
 * editor would have been edited into an archived list nobody reads. Now:
 *
 *   A. getAccessibleLists (every list picker: agent variable bindings, choice columns, the floating
 *      workspace) lists the person's lists that live in the new system beside the older ones,
 *      marked `lives_in: "record"`;
 *   B. the Picklists page (/lists/v3) lists them from THE LIST INDEX (one store door, lane HANDOVER)
 *      and links each at its own address /lists/<id> (the new table page) — and reads no older table
 *      from the browser;
 *   C. the older list editor, handed a list that lives in the new system, says so and links to it.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const ME = "87a6e699-3622-4869-8843-d0867456c0dd"; // admin@admin.com
const STORE_LIST = "5b7a3f1e-2c4d-4e8f-9a1b-3c5d7e9f1a2b";
const push = jest.fn();

const summary = [
  {
    list_id: STORE_LIST,
    list_name: "Hygiene Visit Types",
    description: "The kinds of hygiene visit the front desk books.",
    created_at: "2026-09-26T15:40:00Z",
    updated_at: "2026-09-26T15:40:00Z",
    item_count: 4,
    group_count: 3,
    lives_in: "record",
  },
];

/** A PostgREST builder that answers `rows` whatever is chained on it. */
function builder(rows: unknown[]) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "order", "in", "limit"]) b[m] = () => b;
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  b.maybeSingle = async () => ({ data: null, error: null });
  return b;
}

/** THE LIST INDEX's answer (custom.pick_list_index / _everywhere). */
const index = {
  lists: summary.map((l) => ({
    id: l.list_id,
    list_name: l.list_name,
    description: l.description,
    item_count: l.item_count,
    updated_at: l.updated_at,
    created_by: ME,
    organization_id: "11f4e747-c13a-49c7-81a3-66e6391f8a9b",
    organization_name: "Harbor Dental Group",
    lives_in: "record",
  })),
  archived_ids: [],
};
const olderReads: string[] = [];
const indexReads: string[] = [];
const client = {
  rpc: jest.fn(async (fn: string) => {
    if (fn === "get_user_lists_summary") return { data: summary, error: null };
    throw new Error(`unexpected rpc ${fn}`);
  }),
  // Harbor Dental's older lists were archived by the press: the older table answers none.
  schema: (name: string) => ({
    from: (table: string) => {
      olderReads.push(`${name}.${table}`);
      return builder([]);
    },
    rpc: async (fn: string) => {
      if (name === "custom" && (fn === "pick_list_index" || fn === "pick_list_index_everywhere")) {
        indexReads.push(fn);
        return { data: index, error: null };
      }
      throw new Error(`unexpected rpc ${name}.${fn}`);
    },
  }),
  auth: { getSession: async () => ({ data: { session: { user: { id: ME } } } }) },
};

jest.mock("@/utils/supabase/client", () => ({ supabase: client, createClient: () => client }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  usePathname: () => "/lists/v3",
  useSearchParams: () => new URLSearchParams(),
}));
// The server actions the older editor imports cannot load in jsdom; the branch under test never calls them.
jest.mock("../actions/list-actions", () => ({ deleteListAction: jest.fn(), deleteItemAction: jest.fn() }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "11f4e747-c13a-49c7-81a3-66e6391f8a9b" }));
jest.mock("@/components/official/entity-ref/EntityDoorControls", () => ({ EntityDoorControls: () => null }));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/context-menu-v3/utils/open-context-menu", () => ({ openContextMenuForElement: jest.fn() }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/features/data-tables/data-source/where-a-table-is-born", () => ({ whereANewTableIsBorn: jest.fn() }));
const RECORDS_CLIENT = { listArchived: jest.fn(), recordRestore: jest.fn() };
jest.mock("@ai-matrx/records/react", () => ({ useRecordsClient: () => RECORDS_CLIENT }));
jest.mock("@/features/unified-data/hub/OrganizationScope", () => ({ OrganizationScopeStrip: () => null }));
jest.mock("@/features/unified-data/hub/doors", () => ({ tableKernelId: async () => ({ ok: true, data: "kernel" }) }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  push.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

test("A. getAccessibleLists lists the person's lists that live in the new system, marked", async () => {
  const { getAccessibleLists } = await import("../service");
  const lists = await getAccessibleLists();
  const found = lists.find((l) => l.id === STORE_LIST);
  expect(found).toBeDefined();
  expect(found?.lives_in).toBe("record");
  expect(found?.list_name).toBe("Hygiene Visit Types");
});

test("B. the Picklists page lists a list in the new system at /lists/<id> and reads no older table", async () => {
  olderReads.length = 0;
  indexReads.length = 0;
  const { PicklistsIndex } = await import("../components/PicklistsIndex");
  await act(async () => {
    root.render(
      <PicklistsIndex
        organizationId="11f4e747-c13a-49c7-81a3-66e6391f8a9b"
        organizationName="Harbor Dental Group"
        userId={ME}
        dataSource={{} as never}
      />,
    );
  });
  await settle();
  const text = container.textContent ?? "";
  expect(text).toContain("Hygiene Visit Types");
  expect(text).toContain("4 items");
  expect(container.querySelector(`a[href="/lists/${STORE_LIST}"]`)).not.toBeNull();
  expect(olderReads.filter((t) => t.startsWith("workbench."))).toEqual([]);
  // The header's selected organization never narrows the list: it opens on every organization.
  expect(indexReads).toEqual(["pick_list_index_everywhere"]);
});

test("C. the older list editor, handed a list that lives in the new system, links to it instead", async () => {
  const { ListDetailClient } = await import("../components/ListDetailClient");
  await act(async () => {
    root.render(
      <ListDetailClient
        list={{
          list_id: STORE_LIST,
          list_name: "Hygiene Visit Types",
          description: null,
          created_at: "2026-09-26T15:40:00Z",
          updated_at: null,
          is_public: false,
          public_read: false,
          lives_in: "record",
          items_grouped: { Routine: [{ id: "c1", label: "Recall cleaning", description: null, help_text: null }] },
        }}
        userId={ME}
      />,
    );
  });
  expect(container.textContent).toContain("now lives in the new system");
  const link = container.querySelector(`a[href="/lists/${STORE_LIST}"]`);
  expect(link).not.toBeNull();
});
