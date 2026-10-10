// No layout shift: every widget's slot has the same height loading and loaded, and a loading list draws
// exactly the rows its slot holds. Data hooks are stubbed to a controllable "loading" / "loaded" world.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const world = { loading: true };

jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "user-1" }));
jest.mock("@ai-matrx/kit/media-query", () => ({ useIsMobile: () => false }));
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
    isPinned: () => false,
    toggle: () => true,
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
import { slotHeightPx, slotHeightPxPhone, slotRows } from "../frame";
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

/** What a person sees as a slot's size: the frame, its header, and the rows its body stacks. */
function measure(slot: HTMLElement) {
  const px = (el: Element | null) => (el instanceof HTMLElement ? parseFloat(el.style.height || "0") : 0);
  const header = px(slot.querySelector("[data-start-slot-header]"));
  const frame = parseFloat(slot.dataset.slotPx ?? "0") || px(slot);
  const list = slot.querySelector("ul");
  const rows = list ? [...list.children].filter((c) => !list.className.includes("grid-flow-col")).reduce((n, li) => n + px(li), 0) : 0;
  return { frame, header, rows };
}

/** Every way the loaded slot differs from the loading one, or overflows its frame. [] = no shift. */
function slotShift(loading: HTMLElement, loaded: HTMLElement): string[] {
  const a = measure(loading);
  const b = measure(loaded);
  const out: string[] = [];
  if (a.frame !== b.frame) out.push(`frame ${a.frame} -> ${b.frame}`);
  if (a.header !== b.header) out.push(`header ${a.header} -> ${b.header}`);
  for (const [name, m] of [["loading", a], ["loaded", b]] as const) {
    if (m.header + m.rows > m.frame) out.push(`${name} rows overflow: ${m.header + m.rows} > ${m.frame}`);
  }
  return out;
}

/** The designed slot heights (px), pinned here so a change is a decision, not a drift. */
const DESIGNED_PX: Record<string, Partial<Record<StartWidgetSize, number>>> = {
  kpis: { l: 112 },
  metric: { s: 112, m: 112 },
  page: { m: 520, l: 520 },
};
const designed = (type: string, size: StartWidgetSize) => DESIGNED_PX[type]?.[size] ?? 256;

const cases = START_WIDGET_CATALOG.flatMap((spec) =>
  spec.sizes.map((size) => [spec.key, size, { ...spec.defaultConfig, ...(spec.key === "page" ? { pageId: "p1" } : {}) }] as const),
);

afterEach(cleanup);

describe("Start widget slots hold their height", () => {
  it("the guard itself fails on a planted shift (a loaded slot taller, or rows that outgrow it)", () => {
    const slot = (frame: number, rows: number[]) => {
      const el = document.createElement("section");
      el.style.height = `${frame}px`;
      el.innerHTML = `<header data-start-slot-header style="height:36px"></header><ul>${rows.map((h) => `<li style="height:${h}px"></li>`).join("")}</ul>`;
      return el;
    };
    expect(slotShift(slot(256, [32, 32]), slot(256, [32, 32, 32]))).toEqual([]);
    expect(slotShift(slot(256, [32]), slot(300, [32]))).toEqual(["frame 256 -> 300"]);
    expect(slotShift(slot(256, [32]), slot(256, Array(8).fill(32)))).toEqual(["loaded rows overflow: 292 > 256"]);
  });

  it.each(cases)("%s at %s: no shift from loading to loaded", async (type, size, config) => {
    world.loading = true;
    const loadingHost = await renderOne(type, size, config);
    const loadingSlot = slotOf(loadingHost).cloneNode(true) as HTMLElement;
    const busy = slotOf(loadingHost).querySelector('ul[aria-busy="true"]');
    if (busy) expect(busy.querySelectorAll("li")).toHaveLength(slotRows(type, size));
    await cleanup();

    world.loading = false;
    const loadedSlot = slotOf(await renderOne(type, size, config));
    expect(loadedSlot.querySelector('[aria-busy="true"]')).toBeNull();
    expect(slotShift(loadingSlot, loadedSlot)).toEqual([]);
    expect(measure(loadedSlot).frame).toBe(designed(type, size));
    expect(slotHeightPx(type, size, config)).toBe(designed(type, size));
  });

  it("the counts strip shows each configured count, and a zero shows its nudge", async () => {
    world.loading = false;
    const host = await renderOne("kpis", "l", { keys: "agents,knowledge_files" });
    expect(host.querySelectorAll("li")).toHaveLength(2);
    expect(host.textContent).toContain("7");
    expect(host.textContent).toContain("Add to your knowledge base");
    expect(host.querySelector('a[href="/agents/all"]')).not.toBeNull();
  });

  it("the conversation count opens the conversation list, not a new chat", async () => {
    world.loading = false;
    const host = await renderOne("kpis", "l", { keys: "conversations" });
    expect(host.querySelector('a[href="/work/conversations"]')).not.toBeNull();
    expect(host.querySelector('a[href="/chat/new"]')).toBeNull();
  });

  it("a page widget with no page is an ordinary-height empty state with a way to make one", async () => {
    const host = await renderOne("page", "l", {});
    expect(slotOf(host).dataset.slotPx).toBe("256");
    expect(host.querySelector('a[href="/make"]')).not.toBeNull();
  });

  it("on a phone the counts strip wraps into rows its slot already holds", () => {
    expect(slotHeightPxPhone("kpis", "l", { keys: "a,b,c,d,e,f" })).toBe(36 + 3 * 52 + 8);
    expect(slotHeightPxPhone("tasks", "m", {})).toBe(256);
  });

  it("pinned pages carry their star (unpin) and suggestions say Suggested", async () => {
    world.loading = false;
    const host = await renderOne("favorites", "l", {});
    const rows = [...host.querySelectorAll("li")];
    expect(rows[0]!.textContent).toContain("Notes");
    expect(rows[0]!.querySelector("button")).not.toBeNull();
    expect(rows.slice(1).every((r) => r.textContent?.includes("Suggested"))).toBe(true);
  });

  it("a pinned agent that was deleted says Removed and offers no Chat", async () => {
    world.loading = false;
    const host = await renderOne("agents", "m", {});
    expect(host.textContent).toContain("Removed");
    expect(host.querySelector('[aria-label="Chat with Gone agent"]')).toBeNull();
    expect(host.querySelector('[aria-label="Unpin Gone agent"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Chat with Writer"]')).not.toBeNull();
  });

  it("an unknown widget type renders a named unavailable slot", async () => {
    const host = await renderOne("weather_from_the_future", "m", {});
    expect(host.textContent).toContain("Unavailable");
    expect(slotOf(host).dataset.slotPx).toBe(String(slotHeightPx("x", "m")));
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
