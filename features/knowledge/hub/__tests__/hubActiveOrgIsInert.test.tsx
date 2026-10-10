/**
 * Mounted: the header's ACTIVE organization is never a list filter
 * (policies/access-ladder.md). The hub is mounted on live (non-sample) data with a
 * recording search runner; the person switches the active organization in the header; the hub's
 * request and its rows must be exactly what they were. Only the page's own organization filter
 * (?org_filter=) may change what is asked. The same mount proves the filter's per-organization counts
 * are the list's own count (the same query, `limit: 0`, one organization at a time).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let search = new URLSearchParams("");
const listeners = new Set<() => void>();
const navigate = (href: string) => {
  search = new URLSearchParams(href.split("?")[1] ?? "");
  listeners.forEach((l) => l());
};
jest.mock("next/navigation", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    useSearchParams: () => {
      const [, force] = React.useReducer((n: number) => n + 1, 0);
      React.useEffect(() => {
        listeners.add(force);
        return () => {
          listeners.delete(force);
        };
      }, []);
      return search;
    },
    useRouter: () => ({ push: navigate, replace: navigate, back: jest.fn() }),
  };
});
jest.mock("@ai-matrx/kit/media-query", () => ({
  ...jest.requireActual("@ai-matrx/kit/media-query"),
  useIsMobile: () => true,
}));
jest.mock("@/features/shell/components/header/RouteHeader", () => ({
  __esModule: true,
  default: ({
    left,
    right,
  }: {
    left: React.ReactNode;
    right: React.ReactNode;
  }) => (
    <header>
      {left}
      {right}
    </header>
  ),
}));

// The header's active organization: a switch is one assignment plus a re-render.
let activeOrg: string | null = "org-acme";
jest.mock("@/lib/redux/hooks", () => {
  const slice = jest.requireActual<
    typeof import("@/lib/redux/slices/appContextSlice")
  >("@/lib/redux/slices/appContextSlice");
  return {
    useAppSelector: (sel: unknown) =>
      sel === slice.selectOrganizationId
        ? activeOrg
        : sel === slice.selectOrganizationName
          ? activeOrg === "org-acme"
            ? "Acme"
            : "Globex"
          : null,
    useAppDispatch: () => jest.fn(),
    useAppStore: () => ({ getState: () => ({}), dispatch: jest.fn() }),
  };
});
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () =>
  jest.requireMock("@/lib/redux/hooks"),
);
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({
    organizations: [
      { id: "org-acme", name: "Acme" },
      { id: "org-globex", name: "Globex" },
    ],
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));
jest.mock("@ai-matrx/associations/react", () => ({
  useEntityTitles: () => ({
    titleFor: () => "Untitled",
    isUnresolved: () => false,
    loading: false,
  }),
  useAssociations: () => ({
    edges: [],
    status: "ready",
    error: null,
    reload: async () => undefined,
  }),
  UniversalAssociationPicker: () => null,
}));
const ready = {
  status: "ready" as const,
  items: [],
  error: null,
  retry: jest.fn(),
};
jest.mock("@/features/knowledge/hub/hooks/useHubSidebarData", () => {
  const actual = jest.requireActual(
    "@/features/knowledge/hub/hooks/useHubSidebarData",
  );
  return {
    ...actual,
    useHubSidebarData: () => ({
      savedViews: ready,
      favorites: ready,
      containers: {
        project: ready,
        scope: ready,
        media_source_library: ready,
        research_topic: ready,
        data_store: ready,
      },
    }),
  };
});

// Every read the page makes through supabase answers empty: this test is about the search request.
jest.mock("@/utils/supabase/client", () => {
  const chain: unknown = new Proxy(() => undefined, {
    get: (_t, prop) =>
      prop === "then"
        ? (res: (v: unknown) => void) => res({ data: [], error: null })
        : chain,
    apply: () => chain,
  });
  // The client itself must NOT be thenable (the associations port refuses a thenable as "missing"),
  // so only the builders it hands out are the answering chain.
  const client = new Proxy({} as Record<string, unknown>, {
    get: (_t, prop) => (prop === "then" ? undefined : () => chain),
  });
  return { supabase: client };
});

// Components that need the real store / backend session are not what this test is about.
jest.mock("@/features/sources/components/SourceCapture", () => ({
  ...jest.requireActual("@/features/sources/components/SourceCapture"),
  SourceAddMenu: () => null,
}));

// The recording runner: what the hub asks, and what it is shown.
import type {
  KnowledgeQuery,
  KnowledgeSection,
} from "@/features/knowledge/api/knowledgeSearch";
const asked: KnowledgeQuery[] = [];
const ROWS: Record<string, { title: string; count: number }[]> = {
  all: [
    { title: "Acme handbook", count: 3 },
    { title: "Globex memo", count: 1 },
  ],
};
const COUNT_BY_ORG: Record<string, number> = { "org-acme": 3, "org-globex": 1 };
jest.mock("@/features/knowledge/api/knowledgeSearch", () => {
  const actual = jest.requireActual("@/features/knowledge/api/knowledgeSearch");
  return {
    ...actual,
    searchKnowledge: jest.fn(async (q: KnowledgeQuery) => {
      asked.push(q);
      const org = q.organizations?.[0];
      const items = (ROWS.all ?? []).map((r, i) => ({
        entity: "processed_document",
        id: `src-${i}`,
        title: r.title,
        organization_id: i === 0 ? "org-acme" : "org-globex",
      }));
      const shown = org
        ? items.filter((i) => i.organization_id === org)
        : items;
      const sections: KnowledgeSection[] = (
        actual.KNOWLEDGE_SECTION_KEYS as string[]
      ).map((key) => ({
        key,
        label: key,
        count: key === "sources" ? (org ? COUNT_BY_ORG[org] : shown.length) : 0,
        items: key === "sources" && q.limit !== 0 ? shown : [],
        next_cursor: null,
        error: null,
      })) as KnowledgeSection[];
      return sections;
    }),
  };
});

import { TooltipProvider } from "@ai-matrx/design-system";
import { KnowledgeHubPage } from "@/features/knowledge/hub/components/KnowledgeHubPage";

Element.prototype.scrollIntoView = jest.fn();

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  search = new URLSearchParams("");
  activeOrg = "org-acme";
  asked.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}
async function render() {
  await act(async () => {
    root.render(
      <TooltipProvider>
        <KnowledgeHubPage cookieName="t" />
      </TooltipProvider>,
    );
  });
  await settle();
}
const rowTitles = () =>
  [...host.querySelectorAll<HTMLElement>("[data-hit-key]")].map(
    (e) => e.textContent ?? "",
  );
/** The queries that LIST (limit is not 0): the hub's own request, not the per-organization counts. */
const listRequests = () => asked.filter((q) => q.limit !== 0);

it("switching the header's active organization changes neither the hub's request nor its rows", async () => {
  await render();
  const before = JSON.stringify(listRequests());
  const rowsBefore = rowTitles();
  expect(rowsBefore.join("|")).toContain("Acme handbook");
  expect(rowsBefore.join("|")).toContain("Globex memo");
  // A fresh load carries no organization at all (All organizations).
  expect(listRequests().every((q) => q.organizations === undefined)).toBe(true);
  const requestsBefore = listRequests().length;

  // The person switches the active organization in the header.
  activeOrg = "org-globex";
  await render();
  await settle();

  expect(rowTitles()).toEqual(rowsBefore);
  expect(listRequests().length).toBe(requestsBefore);
  expect(JSON.stringify(listRequests())).toBe(before);
  // The header's switch never appears as an organization filter on anything the hub asked for.
  expect(listRequests().every((q) => q.organizations === undefined)).toBe(true);
});

it("only the page's own organization filter narrows the request and the rows", async () => {
  search = new URLSearchParams("org_filter=org-globex");
  await render();
  const last = listRequests()[listRequests().length - 1];
  expect(last.organizations).toEqual(["org-globex"]);
  const rows = rowTitles().join("|");
  expect(rows).toContain("Globex memo");
  expect(rows).not.toContain("Acme handbook");
});

it("the filter shows each organization's own count — fetched when the menu opens, as the same query with one organization and limit 0", async () => {
  await render();
  // Nothing is counted until the person opens the menu (a read per organization is not free).
  expect(asked.filter((q) => q.limit === 0)).toHaveLength(0);
  const options = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === "View options",
  );
  expect(options).toBeDefined();
  await act(async () => options?.click());
  await settle();
  const dialog = document.body.querySelector('[role="dialog"]');
  expect(dialog?.textContent).toContain("View options");
  const trigger = dialog?.querySelector<HTMLElement>(
    "[data-entity-org-filter]",
  );
  expect(trigger?.textContent).toContain("All organizations");
  await act(async () => {
    trigger?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  await settle();
  const counted = asked.filter((q) => q.limit === 0);
  expect(counted.map((q) => q.organizations?.[0]).sort()).toEqual([
    "org-acme",
    "org-globex",
  ]);
  // Same words and filters as the list, never the active organization's.
  for (const q of counted)
    expect(q.text ?? undefined).toBe(listRequests()[0].text ?? undefined);
  const menu = document.body.querySelector('[role="menu"]');
  expect(menu?.textContent).toContain("Acme3");
  expect(menu?.textContent).toContain("Globex1");
});

// A missing mobile toolbar command, inert filter, or trapped sheet must all fail this mounted flow.
it("mobile View options filters actual results and closes back to the list", async () => {
  await render();
  expect(rowTitles().join("|")).toContain("Acme handbook");
  const options = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === "View options",
  );
  expect(options).toBeDefined();
  await act(async () => options?.click());
  await settle();
  const dialog = document.body.querySelector('[role="dialog"]');
  expect(dialog).not.toBeNull();
  const trigger = dialog?.querySelector<HTMLElement>(
    "[data-entity-org-filter]",
  );
  expect(trigger).not.toBeNull();
  await act(async () =>
    trigger?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  await settle();
  const globex = [
    ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ].find((item) => item.textContent?.includes("Globex"));
  expect(globex).toBeDefined();
  await act(async () => globex?.click());
  await settle();
  expect(search.get("org_filter")).toBe("org-globex");
  expect(listRequests().at(-1)?.organizations).toEqual(["org-globex"]);
  expect(rowTitles().join("|")).toContain("Globex memo");
  expect(rowTitles().join("|")).not.toContain("Acme handbook");
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  await settle();
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  expect(search.get("org_filter")).toBe("org-globex");
  expect(rowTitles().join("|")).toContain("Globex memo");
});
