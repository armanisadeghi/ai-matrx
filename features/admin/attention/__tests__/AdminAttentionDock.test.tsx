/**
 * @jest-environment jsdom
 *
 * The things the dock must never get wrong, proven against the REAL
 * component. Only the boundaries it does not own are stubbed: Redux gating,
 * the two network reads, the router, the record-door components (which pull
 * the entity registry and the peek host) and the Radix dropdown (rendered
 * inline so a menu item can be clicked without pointer-event choreography).
 *
 *  1. One card for every source: a suspended schedule and two outages are
 *     three rows under two sections, with one title naming both.
 *  2. A schedule row carries its doors: the record, "Where it shows" from the
 *     job's declaration, and Re-enable.
 *  3. A LOCAL mute hides that outage AND persists it — and leaves the other
 *     one loud. A different outage is a different server id.
 *  4. A SERVER mute goes to the row: choosing "8 days" calls the injected
 *     write with an ISO `until` eight days out.
 *  5. A non-super-admin renders nothing AND issues no request.
 *  6. A failed SCHEDULE read is SAID (silence reads as healthy); a failed
 *     OUTAGE poll is silent (already captured once by lib/python-client).
 *  7. A mute that has run out is not a mute: an expired local mute stored
 *     before mount is never honoured.
 *
 * Rendered with `createRoot` + `act`, the repo's component-test convention.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import AdminAttentionDock from "../AdminAttentionDock";
import { clearMutes, muteItem, readMuteMap } from "../item-mute";
import { clearSnooze } from "../dock-snooze";
import type { OpenOutage } from "@/features/admin/system-errors/open-outages";
import type { SystemScheduleAlarm } from "@/features/scheduling/service/queries";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/",
}));

const fetchOpenOutages = jest.fn();
jest.mock("@/features/admin/system-errors/open-outages", () => {
  const actual = jest.requireActual("@/features/admin/system-errors/open-outages");
  return { ...actual, fetchOpenOutages: () => fetchOpenOutages() };
});

const fetchSystemScheduleAlarms = jest.fn();
interface MuteArgs {
  taskId: string;
  untilIso: string;
  reason: string | null;
  by: string | null;
}
const muteSystemScheduleAlarm = jest.fn(async (_args: MuteArgs) => {});
const clearSystemScheduleAlarmMute = jest.fn(async (_id: string) => {});
jest.mock("@/features/scheduling/service/queries", () => ({
  fetchSystemScheduleAlarms: () => fetchSystemScheduleAlarms(),
  muteSystemScheduleAlarm: (args: MuteArgs) => muteSystemScheduleAlarm(args),
  clearSystemScheduleAlarmMute: (id: string) => clearSystemScheduleAlarmMute(id),
}));

jest.mock("@/features/scheduling/redux/tasks/thunks", () => ({
  setSystemTaskEnabled: (id: string, enabled: boolean) => ({ type: "test/setSystemTaskEnabled", id, enabled }),
  toggleTaskEnabled: (id: string, enabled: boolean) => ({ type: "test/toggleTaskEnabled", id, enabled }),
}));

let superAdmin = true;
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: { name?: string }) => {
    const name = selector?.name ?? "";
    if (name.includes("SuperAdmin")) return superAdmin;
    if (name.includes("AuthReady")) return true;
    if (name.includes("AccessToken")) return "token";
    if (name.includes("Email")) return "admin@admin.com";
    return undefined;
  },
  useAppDispatch: () => jest.fn(async () => {}),
}));

// The record door pulls the entity registry and the peek host — neither is
// under test here. The label is what a person reads; that is what we assert.
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name, href }: { name?: string; href?: string }) => (
    <a data-testid="entity-ref" href={href}>
      {name}
    </a>
  ),
}));
jest.mock("@/components/official/entity-ref/TextWithDoors", () => ({
  TextWithDoors: ({ text }: { text?: string | null }) => <>{text}</>,
}));
jest.mock("@/components/navigation/AppLink", () => {
  const Link = ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={typeof href === "string" ? href : String(href)} {...rest}>
      {children}
    </a>
  );
  return { AppLink: Link, default: Link };
});
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: async () => true,
}));
jest.mock("@/components/dialogs/text-input/TextInputDialog", () => ({
  TextInputDialog: () => null,
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
// Radix's dropdown needs pointer choreography jsdom cannot give it. Rendered
// inline, a menu item is a button a test can click.
jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => null,
  DropdownMenuItem: ({
    children,
    onSelect,
    ...rest
  }: {
    children?: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" onClick={() => onSelect?.()} {...rest}>
      {children}
    </button>
  ),
}));

function outage(over: Partial<OpenOutage> & { id: string; provider: string }): OpenOutage {
  return {
    error_type: "overloaded_error",
    error_text: "provider refused",
    first_seen_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    consecutive_failures: 214,
    models_affected: ["claude-opus-5"],
    rerouted_to: null,
    occurred_at: new Date().toISOString(),
    ...over,
  };
}

function alarm(over: Partial<SystemScheduleAlarm> = {}): SystemScheduleAlarm {
  return {
    task_id: "a7c1e2d3-0000-4e5f-9a00-000000000544",
    title: "Commerce eBay sync engine",
    description: "Knob-gated tick.",
    tags: ["system"],
    kind: "tool",
    alarm: "suspended",
    severity: "critical",
    detail: "The repeat guard switched this off, but a later run succeeded.",
    enabled: false,
    next_due_at: null,
    last_run_at: null,
    suspended_at: new Date(Date.now() - 16 * 24 * 3_600_000).toISOString(),
    consecutive_failures: 3,
    succeeded_since_suspension: true,
    last_run_id: null,
    last_run_status: "success",
    last_run_error: null,
    last_run_finished_at: null,
    failed_streak: 0,
    approval: null,
    impact: [{ href: "/commerce/stores/connect", label: "Connected stores", what: "Nothing pushes." }],
    muted_until: null,
    mute_reason: null,
    mute_by: null,
    mute_at: null,
    ...over,
  };
}

let container: HTMLDivElement;
let root: Root;

async function tick(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mount(): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AdminAttentionDock />
      </QueryClientProvider>,
    );
  });
  for (let i = 0; i < 12; i += 1) await tick();
}

function rows(): Element[] {
  return [...container.querySelectorAll('[data-testid="attention-row"]')];
}

function click(el: Element): Promise<void> {
  return act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function buttonByLabel(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === label,
  );
  if (!found) throw new Error(`no button labelled "${label}"`);
  return found;
}

async function expand(): Promise<void> {
  await click(buttonByLabel("Expand the attention dock"));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  superAdmin = true;
  fetchOpenOutages.mockReset();
  fetchSystemScheduleAlarms.mockReset();
  muteSystemScheduleAlarm.mockClear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  clearMutes();
  clearSnooze();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("AdminAttentionDock", () => {
  it("is one card for every source: three rows, two sections, one title", async () => {
    fetchSystemScheduleAlarms.mockResolvedValue([alarm()]);
    fetchOpenOutages.mockResolvedValue([
      outage({ id: "o-anthropic", provider: "anthropic" }),
      outage({ id: "o-openai", provider: "openai", rerouted_to: ["anthropic"] }),
    ]);
    await mount();

    // Collapsed by default: the pill counts everything.
    expect(container.textContent).toContain("3 things need a person");
    await expand();

    expect(rows()).toHaveLength(3);
    expect(container.querySelector('[data-testid="attention-section-schedule-alarms"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="attention-section-provider-outages"]')).not.toBeNull();
    const title = container.querySelector('[data-testid="attention-title"]')?.textContent ?? "";
    expect(title).toContain("1 scheduled job is switched off");
    expect(title).toContain("2 providers are down");
    expect(document.documentElement.dataset.adminAttention).toBe("expanded");
  });

  it("a schedule row carries its doors and its fix", async () => {
    fetchSystemScheduleAlarms.mockResolvedValue([alarm()]);
    fetchOpenOutages.mockResolvedValue([]);
    await mount();
    await expand();

    const row = rows()[0];
    const record = row.querySelector('[data-testid="entity-ref"]');
    expect(record?.textContent).toBe("Commerce eBay sync engine");
    expect(record?.getAttribute("href")).toBe("/schedules/a7c1e2d3-0000-4e5f-9a00-000000000544");
    expect(row.textContent).toContain("Where it shows:");
    const impact = [...row.querySelectorAll("a")].find((a) => a.textContent?.includes("Connected stores"));
    expect(impact?.getAttribute("href")).toBe("/commerce/stores/connect");
    expect(impact?.getAttribute("target")).toBe("_blank");
    expect(row.textContent).toContain("a later run succeeded");
    expect([...row.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Re-enable")).toBe(true);
  });

  it("a job with no declaration says so instead of showing nothing", async () => {
    fetchSystemScheduleAlarms.mockResolvedValue([alarm({ impact: null })]);
    fetchOpenOutages.mockResolvedValue([]);
    await mount();
    await expand();
    expect(rows()[0].textContent).toContain("has not said which pages it feeds");
  });

  it("a LOCAL mute hides that outage, persists it, and leaves the other one loud", async () => {
    fetchSystemScheduleAlarms.mockResolvedValue([]);
    fetchOpenOutages.mockResolvedValue([
      outage({ id: "o-anthropic", provider: "anthropic" }),
      outage({ id: "o-openai", provider: "openai" }),
    ]);
    await mount();
    await expand();
    expect(rows()).toHaveLength(2);

    const anthropic = rows().find((r) => r.getAttribute("data-attention-key") === "provider-outages:o-anthropic")!;
    await click(anthropic.querySelector('[data-testid="attention-mute-1h"]')!);
    for (let i = 0; i < 4; i += 1) await tick();

    expect(rows()).toHaveLength(1);
    expect(container.textContent).not.toContain("Anthropic is refusing");
    const stored = readMuteMap();
    expect(stored["provider-outages:o-anthropic"]).toBeGreaterThan(Date.now());
    expect(stored["provider-outages:o-openai"]).toBeUndefined();
  });

  it("a SERVER mute goes to the row with an ISO `until`", async () => {
    fetchSystemScheduleAlarms.mockResolvedValue([alarm()]);
    fetchOpenOutages.mockResolvedValue([]);
    await mount();
    await expand();

    const before = Date.now();
    await click(rows()[0].querySelector('[data-testid="attention-mute-8d"]')!);
    for (let i = 0; i < 4; i += 1) await tick();

    expect(muteSystemScheduleAlarm).toHaveBeenCalledTimes(1);
    const args = muteSystemScheduleAlarm.mock.calls[0]?.[0];
    if (!args) throw new Error("mute was not called with arguments");
    expect(args.taskId).toBe("a7c1e2d3-0000-4e5f-9a00-000000000544");
    expect(args.by).toBe("admin@admin.com");
    expect(args.reason).toBeNull();
    const until = Date.parse(args.untilIso);
    expect(until).toBeGreaterThanOrEqual(before + 8 * 24 * 3_600_000);
    expect(until).toBeLessThan(before + 8 * 24 * 3_600_000 + 60_000);
  });

  it("a non-super-admin renders nothing and issues no request", async () => {
    superAdmin = false;
    fetchSystemScheduleAlarms.mockResolvedValue([alarm()]);
    fetchOpenOutages.mockResolvedValue([outage({ id: "o", provider: "anthropic" })]);
    await mount();
    expect(container.innerHTML).toBe("");
    expect(fetchSystemScheduleAlarms).not.toHaveBeenCalled();
    expect(fetchOpenOutages).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.adminAttention).toBeUndefined();
  });

  it("a failed schedule read is SAID; a failed outage poll is silent", async () => {
    fetchSystemScheduleAlarms.mockRejectedValue(new Error("42501 forbidden"));
    fetchOpenOutages.mockRejectedValue(new Error("502"));
    await mount();
    await expand();
    const failed = container.querySelector('[data-testid="attention-read-failed"]');
    expect(failed?.textContent).toContain("Schedules could not be read: 42501 forbidden");
    expect(failed?.textContent).toContain("Treat this as unknown, not healthy");
    expect(container.textContent).not.toContain("AI providers could not be read");
  });

  it("nothing live renders nothing — never an all-clear strip", async () => {
    fetchSystemScheduleAlarms.mockResolvedValue([]);
    fetchOpenOutages.mockResolvedValue([]);
    await mount();
    expect(container.innerHTML).toBe("");
    expect(document.documentElement.dataset.adminAttention).toBeUndefined();
  });

  it("an expired local mute stored before mount is never honoured", async () => {
    muteItem("provider-outages:o-anthropic", 1000, Date.now() - 5000);
    fetchSystemScheduleAlarms.mockResolvedValue([]);
    fetchOpenOutages.mockResolvedValue([outage({ id: "o-anthropic", provider: "anthropic" })]);
    await mount();
    await expand();
    expect(rows()).toHaveLength(1);
  });
});
