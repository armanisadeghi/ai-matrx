/**
 * Lanes LISTS-AFTER-SWITCH (2026-09-26) and OLD-READERS-REMOVAL (2026-10-01) — every pick list lives
 * in the record store as a Table of choices under its own id. Harbor Dental Group's front desk:
 *
 *   A. getAccessibleLists (every list picker: agent variable bindings, choice columns, the floating
 *      workspace) lists the person's lists from THE LIST INDEX;
 *   B. the Pick lists page (/pick-lists) lists them and links each at its own address /pick-lists/<id> (the
 *      store's table page) — and reads no `workbench.*` table from the browser;
 *   C. a host handed a list (the List Manager window, the pick list tool) names it and links to its page;
 *   D. a NEW pick list is born in the store (`custom.pick_list_create`) in the active organization;
 *   E. an agent adding and editing choices writes Records of the list's Table, never an older table.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const ME = "87a6e699-3622-4869-8843-d0867456c0dd"; // admin@admin.com
const STORE_LIST = "5b7a3f1e-2c4d-4e8f-9a1b-3c5d7e9f1a2b";
const push = jest.fn();
const mockMenuEntities: unknown[] = [];

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
const created: Array<Record<string, unknown>> = [];
const client = {
  rpc: jest.fn(async (fn: string) => {
    throw new Error(`unexpected rpc ${fn}`);
  }),
  // Harbor Dental's older lists were archived by the press: the older table answers none.
  schema: (name: string) => ({
    from: (table: string) => {
      olderReads.push(`${name}.${table}`);
      return builder([]);
    },
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      if (name === "custom" && fn === "pick_list_create") {
        created.push(args ?? {});
        return { data: { list_id: STORE_LIST, lives_in: "record", address: `/pick-lists/${STORE_LIST}` }, error: null };
      }
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
  usePathname: () => "/pick-lists",
  useSearchParams: () => new URLSearchParams(),
}));
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
  NonEditableContextMenu: ({ children, entity }: { children: React.ReactNode; entity?: unknown }) => {
    mockMenuEntities.push(entity);
    return <>{children}</>;
  },
}));
jest.mock("@/features/context-menu-v3/utils/open-context-menu", () => ({ openContextMenuForElement: jest.fn() }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/features/data-tables/data-source/where-a-table-is-born", () => ({ whereANewTableIsBorn: jest.fn() }));
const RECORDS_CLIENT = { listArchived: jest.fn(), recordRestore: jest.fn() };
jest.mock("@ai-matrx/records/react", () => ({ useRecordsClient: () => RECORDS_CLIENT }));
jest.mock("@/lib/entity-list/components/EntityOrgFilter", () => ({ EntityOrgFilter: () => null }));
jest.mock("@/lib/entity-list/orgFilterUrl", () => ({ useOrgFilterParam: () => [null, jest.fn()] }));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: jest.fn(async () => "active-org") }));
jest.mock("@ai-matrx/records-ui", () => ({
  ArchivedDisclosure: () => null,
  RecordsMount: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  personActor: () => ({}),
  recordsDataSource: () => ({}),
}));
const STORE_WRITES: Array<{ door: string; args: unknown }> = [];
const STORE_CLIENT = {
  recordWrite: jest.fn(async (args: unknown) => {
    STORE_WRITES.push({ door: "recordWrite", args });
    return { ok: true, data: "new-choice" };
  }),
  recordUpdate: jest.fn(async (args: unknown) => {
    STORE_WRITES.push({ door: "recordUpdate", args });
    return { ok: true, data: 2 };
  }),
  // The choices' versions, read when the list is drawn (lane VWF: an update carries the version seen).
  recordHeaders: jest.fn(async ({ ids }: { ids: string[] }) => ({ ok: true, data: ids.map((id) => ({ id, version: 3 })) })),
};
const CLIENT_CONFIGS: unknown[] = [];
jest.mock("@ai-matrx/records/core", () => ({
  createRecordsClient: (config: unknown) => {
    CLIENT_CONFIGS.push(config);
    return STORE_CLIENT;
  },
}));
jest.mock("@/features/unified-data/recordsNotify", () => ({ RECORDS_NOTIFY: {} }));
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

test("A. getAccessibleLists lists the person's lists from the list index", async () => {
  const { getAccessibleLists } = await import("../service");
  const lists = await getAccessibleLists();
  const found = lists.find((l) => l.id === STORE_LIST);
  expect(found).toBeDefined();
  expect(found?.list_name).toBe("Hygiene Visit Types");
});

test("B. the Pick lists page lists a list in the new system at /pick-lists/<id> and reads no older table", async () => {
  olderReads.length = 0;
  indexReads.length = 0;
  mockMenuEntities.length = 0;
  const { PickListsIndex } = await import("../components/PickListsIndex");
  await act(async () => {
    root.render(
      <PickListsIndex
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
  expect(container.querySelector(`a[href="/pick-lists/${STORE_LIST}"]`)).not.toBeNull();
  expect(olderReads.filter((t) => t.startsWith("workbench."))).toEqual([]);
  // The header's selected organization never narrows the list: it opens on every organization.
  expect(indexReads).toEqual(["pick_list_index_everywhere"]);
});

test("B2. a list menu targets the Table's real custom.record identity", async () => {
  mockMenuEntities.length = 0;
  const { ListCard } = await import("../components/ListCard");
  await act(async () => {
    root.render(
      <ListCard
        list={{
          id: STORE_LIST,
          list_name: "Hygiene Visit Types",
          description: null,
          user_id: ME,
          is_public: false,
          public_read: false,
          created_at: "2026-09-26T15:40:00Z",
          updated_at: null,
        }}
        isActive={false}
        isAnyNavigating={false}
        onNavigate={jest.fn()}
      />,
    );
  });
  // REC-1: the list id is the custom Table's own custom.record id. It
  // must never regress to the retired pick_list/structured_list entity token.
  expect(mockMenuEntities).toContainEqual({
    type: "record",
    id: STORE_LIST,
    title: "Hygiene Visit Types",
    resourceType: "record",
  });
});

test("D. a NEW pick list carries the active organization (ensureOrgId), the list read never does", async () => {
  created.length = 0;
  const { PickListsIndex } = await import("../components/PickListsIndex");
  await act(async () => {
    root.render(<PickListsIndex organizationName="Harbor Dental Group" userId={ME} dataSource={{} as never} />);
  });
  await settle();
  const press = async (label: string) => {
    const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(label));
    if (!button) throw new Error(`no ${label} button`);
    await act(async () => button.click());
  };
  await press("New pick list");
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Pick list name"]')!;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(input, "Recall reasons");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await press("Create");
  await settle();
  // Born in the store through its own door, in the active organization, then opened at its page.
  expect(created).toEqual([{ p_organization_id: "active-org", p_list_name: "Recall reasons", p_description: null, p_items: [] }]);
  expect(push).toHaveBeenCalledWith(`/pick-lists/${STORE_LIST}`);
});

test("C. a host handed a list names it and links to its page, never saying it moved", async () => {
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
          items_grouped: { Routine: [{ id: "c1", label: "Recall cleaning", description: null, help_text: null }] },
        }}
        userId={ME}
      />,
    );
  });
  expect(container.textContent).toContain("Hygiene Visit Types");
  expect(container.textContent).not.toMatch(/moved|new system|older/i);
  expect(container.querySelector(`a[href="/pick-lists/${STORE_LIST}"]`)).not.toBeNull();
});

test("E. an agent's choice writes land as Records of the list's Table, in the list's organization", async () => {
  STORE_WRITES.length = 0;
  CLIENT_CONFIGS.length = 0;
  olderReads.length = 0;
  (client.rpc as jest.Mock).mockImplementation(async (fn: string) => {
    if (fn === "get_user_list_with_items") {
      return {
        data: {
          list_id: STORE_LIST,
          list_name: "Hygiene Visit Types",
          organization_id: "11f4e747-c13a-49c7-81a3-66e6391f8a9b",
          items_grouped: { Routine: [{ id: "c1", label: "Recall cleaning", description: null, help_text: null }] },
        },
        error: null,
      };
    }
    throw new Error(`unexpected rpc ${fn}`);
  });
  // The list manager draws the list (and, with it, the versions of its choices).
  const { getListWithItems } = await import("../service");
  await getListWithItems(STORE_LIST);
  const { buildListSurfaceWriteHandlers } = await import("../surface-write-handlers");
  const handlers = buildListSurfaceWriteHandlers({ resolveListId: () => STORE_LIST, afterWrite: () => undefined });
  const apply = (name: string, value: unknown) => {
    const handler = handlers[name];
    return typeof handler === "function" ? handler(value) : handler.apply(value);
  };
  await apply("add_list_items", [{ label: "Perio maintenance", group: "Routine" }]);
  await apply("update_list_item", { id: "c1", label: "Recall cleaning (6 months)", help_text: null });
  expect(STORE_WRITES).toEqual([
    { door: "recordWrite", args: { table_id: STORE_LIST, data: { name: "Perio maintenance", group_name: "Routine" } } },
    { door: "recordUpdate", args: { record_id: "c1", patch: { name: "Recall cleaning (6 months)", help_text: null }, expectedVersion: 3 } },
  ]);
  expect(CLIENT_CONFIGS.every((c) => (c as { organizationId?: string }).organizationId === "11f4e747-c13a-49c7-81a3-66e6391f8a9b")).toBe(true);
  expect(olderReads).toEqual([]);
});
