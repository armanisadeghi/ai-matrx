// No layout shift: every widget's slot has the same height loading and loaded, and a loading list draws
// exactly the rows its slot holds. Data hooks are stubbed to a controllable "loading" / "loaded" world.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const world = { loading: true };

jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "user-1" }));
jest.mock("@/features/dashboard/hooks/useDashboardMetrics", () => ({
  useDashboardMetrics: () => ({
    metrics: { agents: 7, conversations: 12, knowledge_files: 0, published_apps: 0, notes: 3, tasks: 5, transcripts: 0, scopes: 0, shortcuts: 0, research_reports: 0, podcasts: 0, messages: 0 },
    isLoading: world.loading,
    isError: false,
    refetch: () => undefined,
  }),
}));
const rows = Array.from({ length: 20 }, (_, i) => ({ entity_token: "note", entity_id: `n${i}`, title: `Note ${i}`, subtitle: null, updated_at: new Date().toISOString() }));
jest.mock("@/features/board/tools/search-items", () => ({
  searchItemsAsPerson: () => (world.loading ? new Promise(() => undefined) : Promise.resolve(rows)),
}));
const tasks = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, title: `Task ${i}`, status: "active", due_date: null, assignee_id: "user-1", created_by: "user-1" }));
jest.mock("@/features/tasks/services/taskService", () => ({
  getUserTasks: () => (world.loading ? new Promise(() => undefined) : Promise.resolve(tasks)),
}));
jest.mock("@/features/meet/hooks/useMeetingsDirectory", () => ({
  useMeetingsDirectory: () => ({
    loading: world.loading,
    failure: null,
    occurrences: world.loading ? [] : [{ meetingId: "m1", occurrenceStart: new Date().toISOString(), title: "Standup", meetingCancelled: false, state: "scheduled" }],
    meetings: [],
    roles: new Map(),
    userId: "user-1",
    reload: () => undefined,
  }),
}));
jest.mock("@/components/favorites/usePinned", () => ({
  usePinned: () => ({
    favorites: [
      { id: "/notes", kind: "nav", label: "Notes", href: "/notes", pinnedAt: "2026-10-01" },
      { id: "agent:a1", kind: "agent", label: "Writer", href: "/agents/a1", pinnedAt: "2026-10-01" },
      { id: "agent:a2", kind: "agent", label: "Gone agent", href: "/agents/a2", pinnedAt: "2026-10-01" },
    ],
  }),
}));
jest.mock("@/features/access-gate/hooks/useAccessStates", () => ({
  useAccessStates: () => ({
    states: new Map([["a1", { status: "ok" }], ["a2", { status: "deleted" }]]),
    isLoading: false,
    refresh: () => undefined,
  }),
}));
jest.mock("@/features/applets/embed/DataPage", () => ({ DataPage: () => <div>page body</div> }));
jest.mock("@/features/scopes/registry/entityRegistry", () => ({
  tryGetEntityInfo: (t: string) => ({ hrefFor: (id: string) => `/${t}/${id}`, Icon: () => null }),
}));
jest.mock("@/features/shell/components/ShellIcon", () => ({ __esModule: true, default: () => null }));

import { StartGrid } from "../StartGrid";
import { START_WIDGET_CATALOG } from "../catalog";
import { slotHeightPx, slotRows } from "../frame";
import type { StartDoc, StartWidgetSize } from "../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let mounted: { root: Root; host: HTMLElement } | null = null;

async function renderOne(type: string, size: StartWidgetSize, config: Record<string, string>, editing = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const doc: StartDoc = { schema: 1, widgets: [{ id: "w", type, size, config }] };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <StartGrid
          doc={doc}
          editing={editing ? { selectedId: null, onNudge: () => undefined, onRemove: () => undefined, onConfigure: () => undefined } : null}
        />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  mounted = { root, host };
  return host;
}

async function cleanup() {
  if (!mounted) return;
  const { root, host } = mounted;
  await act(async () => root.unmount());
  host.remove();
  mounted = null;
}

const slotOf = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-start-slot]")!;

const cases = START_WIDGET_CATALOG.flatMap((spec) =>
  spec.sizes.map((size) => [spec.key, size, { ...spec.defaultConfig, ...(spec.key === "page" ? { pageId: "p1" } : {}) }] as const),
);

afterEach(cleanup);

describe("Start widget slots hold their height", () => {
  it.each(cases)("%s at %s: loading height = loaded height", async (type, size, config) => {
    world.loading = true;
    const loadingSlot = slotOf(await renderOne(type, size, config));
    const loadingHeight = loadingSlot.style.height;
    const busy = loadingSlot.querySelector('ul[aria-busy="true"]');
    if (busy) expect(busy.querySelectorAll("li")).toHaveLength(slotRows(type, size));
    await cleanup();

    world.loading = false;
    const loadedSlot = slotOf(await renderOne(type, size, config));
    expect(loadedSlot.querySelector('[aria-busy="true"]')).toBeNull();
    expect(loadedSlot.style.height).toBe(loadingHeight);
    expect(loadedSlot.style.height).toBe(`${slotHeightPx(type, size)}px`);
    expect(loadedSlot.querySelectorAll("li").length).toBeLessThanOrEqual(slotRows(type, size));
  });

  it("the counts strip shows each configured count, and a zero shows its nudge", async () => {
    world.loading = false;
    const host = await renderOne("kpis", "l", { keys: "agents,knowledge_files" });
    expect(host.querySelectorAll("li")).toHaveLength(2);
    expect(host.textContent).toContain("7");
    expect(host.textContent).toContain("Add to your knowledge base");
    expect(host.querySelector('a[href="/agents/all"]')).not.toBeNull();
  });

  it("a pinned agent that was deleted says Removed and offers no Run", async () => {
    world.loading = false;
    const host = await renderOne("agents", "m", {});
    expect(host.textContent).toContain("Removed");
    expect(host.querySelector('[aria-label="Run Gone agent"]')).toBeNull();
    expect(host.querySelector('[aria-label="Run Writer"]')).not.toBeNull();
  });

  it("an unknown widget type renders a named unavailable slot", async () => {
    const host = await renderOne("weather_from_the_future", "m", {});
    expect(host.textContent).toContain("Unavailable");
    expect(slotOf(host).style.height).toBe(`${slotHeightPx("x", "m")}px`);
  });

  it("edit mode keeps the controls in the header row and the title whole behind a tooltip", async () => {
    world.loading = false;
    const host = await renderOne("metric", "s", { metric: "conversations" }, true);
    const header = host.querySelector<HTMLElement>("[data-start-slot-header]")!;
    expect(header.style.height).toBe("36px");
    const title = header.querySelector("h2")!;
    expect(title.getAttribute("title")).toBe("Conversations count");
    expect(title.className).toContain("flex-1");
    expect(header.querySelector('[aria-label="Remove"]')).not.toBeNull();
    expect(header.querySelector("svg.text-muted-foreground")).toBeNull();
  });
});
