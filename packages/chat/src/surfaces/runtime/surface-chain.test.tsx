/**
 * The surface chain and its three guarantees (register ARE-010 / 011 / 012):
 *
 *  1. A LAYER outranks every page provider wherever it mounts — the overlay
 *     controller mounts layers at the app root, outside the page's tree, and a
 *     depth-1 layer used to lose to a depth-2 page.
 *  2. Every OTHER mounted registered surface travels with a run as a level of
 *     `surface_chain`, with its declared values and their descriptions — the
 *     page under a window is never lost again — and the two chokepoints that
 *     build a run's scope both add it.
 *  3. An unregistered window is read field by field and can be filled in, with
 *     every change checked before anything lands.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getSurfaceRuntime,
  getSurfaceRuntimeForName,
  registerSurfaceRuntime,
  registerSurfaceScopeContribution,
  SurfaceLayerBoundary,
  SurfaceRuntimeProvider,
} from "./SurfaceRuntimeContext";
import {
  SURFACE_CHAIN_KEY,
  WINDOW_FORMS_KEY,
  withLiveSurfaceContext,
  type SurfaceChainLevel,
} from "./surface-chain";
import {
  applyWindowFormChanges,
  readWindowForms,
  SURFACE_LAYER_ATTRIBUTE,
} from "./window-forms";
import { assertNoPlatformReservedNames } from "@/features/surfaces/manifests/registry";

jest.mock("@/components/agent-copy/AlchemySurfaceBridge", () => ({
  AlchemySurfaceBridge: ({ children }: { children: ReactNode }) => children,
}));

const DATA_TABLES = "matrx-user/data-tables";
const TABLE_SETTINGS = "matrx-user/table-settings";
const MARKETING_SITE = "matrx-user/marketing-site";

describe("layers outrank pages wherever they mount (ARE-012)", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("a layer mounted OUTSIDE a depth-2 page tree becomes the primary surface, marked as a layer", () => {
    act(() =>
      root.render(
        <>
          <SurfaceRuntimeProvider surfaceName={MARKETING_SITE} getScope={() => ({})}>
            <SurfaceRuntimeProvider surfaceName={DATA_TABLES} getScope={() => ({})}>
              <span />
            </SurfaceRuntimeProvider>
          </SurfaceRuntimeProvider>
          {/* What the overlay controller renders: a sibling at the app root. */}
          <SurfaceLayerBoundary>
            <SurfaceRuntimeProvider surfaceName={TABLE_SETTINGS} getScope={() => ({})}>
              <span />
            </SurfaceRuntimeProvider>
          </SurfaceLayerBoundary>
        </>,
      ),
    );
    expect(getSurfaceRuntime()?.surfaceName).toBe(TABLE_SETTINGS);
    expect(getSurfaceRuntime()?.layer).toBe(true);
    expect(getSurfaceRuntimeForName(DATA_TABLES)?.layer).toBe(false);
  });
});

describe("descendant contributions are merged by the registry", () => {
  it("a contribution reaches every reader with no wiring in the provider", async () => {
    const off = registerSurfaceRuntime({ surfaceName: TABLE_SETTINGS, getScope: () => ({ settings_tab: "actions" }) }, 1);
    const offContribution = registerSurfaceScopeContribution(TABLE_SETTINGS, "RowActionsEditor", () => ({
      editing_row_action: { name: "Restock" },
    }));
    expect(await getSurfaceRuntimeForName(TABLE_SETTINGS)?.getScope()).toEqual({
      settings_tab: "actions",
      editing_row_action: { name: "Restock" },
    });
    offContribution();
    off();
  });

  it("a contribution may not replace a provider-owned value", () => {
    const off = registerSurfaceRuntime({ surfaceName: TABLE_SETTINGS, getScope: () => ({ settings_tab: "actions" }) }, 1);
    const offContribution = registerSurfaceScopeContribution(TABLE_SETTINGS, "Rogue", () => ({ settings_tab: "fields" }));
    expect(() => getSurfaceRuntimeForName(TABLE_SETTINGS)?.getScope()).toThrow(/provider-owned value "settings_tab"/);
    offContribution();
    off();
  });
});

describe("the surface chain carries every other open screen (ARE-010)", () => {
  it("the page under a window arrives as a level with its declared values and descriptions", async () => {
    const offPage = registerSurfaceRuntime(
      {
        surfaceName: DATA_TABLES,
        getScope: () => ({
          table_name: "Warehouse inventory",
          column_list: [{ field_name: "on_hand", display_name: "On hand" }],
          search_term: "", // empty — never sent
          not_declared_anywhere: "x", // undeclared — never sent
        }),
      },
      1,
    );
    const offLayer = registerSurfaceRuntime(
      { surfaceName: TABLE_SETTINGS, layer: true, getScope: () => ({ settings_tab: "actions" }) },
      1001,
    );

    // An undeclared loaded value fails under test (loaded-value-check.ts); this
    // case proves the chain's own filter, so read as development does: the
    // value is announced (with its remedy) and still never sent.
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const env = process.env as Record<string, string | undefined>;
    const previousEnv = env.NODE_ENV;
    env.NODE_ENV = "development";
    let scope: Record<string, unknown>;
    try {
      scope = await withLiveSurfaceContext(TABLE_SETTINGS, { settings_tab: "actions" });
    } finally {
      env.NODE_ENV = previousEnv;
    }
    expect(errors.mock.calls.some((call) => String(call[0]).includes('"not_declared_anywhere" it never declared'))).toBe(true);
    errors.mockRestore();
    const chain = scope[SURFACE_CHAIN_KEY] as SurfaceChainLevel[];
    expect(chain).toHaveLength(1);
    expect(chain[0].surface).toBe(DATA_TABLES);
    expect(chain[0].role).toBe("page");
    expect(chain[0].values.table_name.value).toBe("Warehouse inventory");
    expect(chain[0].values.table_name.description.length).toBeGreaterThan(10);
    expect(chain[0].values.column_list.value).toEqual([{ field_name: "on_hand", display_name: "On hand" }]);
    expect(chain[0].values.search_term).toBeUndefined();
    expect(chain[0].values.not_declared_anywhere).toBeUndefined();

    // From the page's side, the open window is a `window` level.
    const fromPage = await withLiveSurfaceContext(DATA_TABLES, {});
    const pageChain = (fromPage[SURFACE_CHAIN_KEY] ?? []) as SurfaceChainLevel[];
    expect(pageChain.map((level) => [level.surface, level.role])).toEqual([[TABLE_SETTINGS, "window"]]);
    offLayer();
    offPage();
  });

  it("a level whose scope throws is left out, and the run still gets the rest", async () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const offBroken = registerSurfaceRuntime(
      { surfaceName: MARKETING_SITE, getScope: () => { throw new Error("boom"); } },
      1,
    );
    const offPage = registerSurfaceRuntime({ surfaceName: DATA_TABLES, getScope: () => ({ table_name: "Leads" }) }, 1);
    const scope = await withLiveSurfaceContext(TABLE_SETTINGS, {});
    expect((scope[SURFACE_CHAIN_KEY] as SurfaceChainLevel[]).map((l) => l.surface)).toEqual([DATA_TABLES]);
    expect(errors).toHaveBeenCalled();
    offPage();
    offBroken();
    errors.mockRestore();
  });

  it("both chokepoints that build a run's scope add the chain", () => {
    for (const file of [
      "features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts",
      "features/agents/redux/execution-system/thunks/refresh-surface-scope.thunk.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect({ file, calls: /await withLiveSurfaceContext\(/.test(source) }).toEqual({ file, calls: true });
    }
  });

  it("no manifest may claim a platform-written name", () => {
    expect(() =>
      assertNoPlatformReservedNames({
        surfaceName: "matrx-user/example",
        values: [
          { name: "surface_chain", label: "x", description: "x", valueType: "array", alwaysAvailable: false, typicalCharCount: 1 },
        ],
      }),
    ).toThrow(/written by the platform/);
    expect(() =>
      assertNoPlatformReservedNames({
        surfaceName: "matrx-user/example",
        values: [],
        writeTargets: [
          { name: "window_form_fields", label: "x", description: "x", valueType: "object", mode: "draft" },
        ],
      }),
    ).toThrow(/unregistered windows/);
  });
});

describe("unregistered windows are read and filled field by field (ARE-011 safety net)", () => {
  const rects = HTMLElement.prototype.getClientRects;
  beforeAll(() => {
    // jsdom lays nothing out; every element counts as visible here.
    HTMLElement.prototype.getClientRects = () => [{}] as unknown as DOMRectList;
  });
  afterAll(() => {
    HTMLElement.prototype.getClientRects = rects;
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function openInviteDialog() {
    document.body.innerHTML = `
      <div role="dialog" aria-labelledby="t">
        <h2 id="t">Invite a teammate</h2>
        <label for="email">Work email</label><input id="email" type="email" required />
        <label for="seats">Seats</label><input id="seats" type="number" min="1" max="5" />
        <label for="role">Role</label><select id="role"><option value="member">member</option><option value="admin">admin</option></select>
        <label for="pw">Password</label><input id="pw" type="password" />
      </div>
      <div role="dialog" ${SURFACE_LAYER_ATTRIBUTE}="${TABLE_SETTINGS}"><input aria-label="Registered field" /></div>
      <div data-radix-popper-content-wrapper><div role="dialog"><input aria-label="Popover field" /></div></div>`;
  }

  it("lists every field of an unregistered window, and never a registered layer, a popover or a password", () => {
    openInviteDialog();
    const forms = readWindowForms();
    expect(forms).toHaveLength(1);
    expect(forms[0].title).toBe("Invite a teammate");
    expect(forms[0].fields.map((f) => [f.key, f.label, f.type])).toEqual([
      ["work_email", "Work email", "email"],
      ["seats", "Seats", "number"],
      ["role", "Role", "select"],
    ]);
    expect(forms[0].fields[2].options).toEqual(["member", "admin"]);
  });

  it("refuses the whole write when one change breaks a field's rules, and applies nothing", async () => {
    openInviteDialog();
    await expect(
      applyWindowFormChanges({
        window: "Invite a teammate",
        changes: [
          { field: "work_email", value: "dana@allgreen.example" },
          { field: "seats", value: 9 },
        ],
      }),
    ).rejects.toThrow(/Nothing was changed.*Seats/);
    expect((document.getElementById("email") as HTMLInputElement).value).toBe("");
  });

  it("applies every change as typing would, firing the field's own input event", async () => {
    openInviteDialog();
    const email = document.getElementById("email") as HTMLInputElement;
    const typed = jest.fn();
    email.addEventListener("input", typed);
    await applyWindowFormChanges({
      window: "Invite a teammate",
      changes: [
        { field: "work_email", value: "dana@allgreen.example" },
        { field: "seats", value: 3 },
        { field: "role", value: "admin" },
      ],
    });
    expect(email.value).toBe("dana@allgreen.example");
    expect(typed).toHaveBeenCalled();
    expect((document.getElementById("seats") as HTMLInputElement).value).toBe("3");
    expect((document.getElementById("role") as HTMLSelectElement).value).toBe("admin");
  });

  it("picks a styled list's choice the way a keyboard user does, and refuses one it does not offer", async () => {
    document.body.innerHTML = `
      <div role="dialog" aria-label="New column">
        <label id="kind-label">Kind</label>
        <button role="combobox" aria-labelledby="kind-label" id="kind">Text</button>
      </div>`;
    const trigger = document.getElementById("kind") as HTMLButtonElement;
    // A minimal styled list: Enter opens a listbox; Enter on an option picks it; Escape closes.
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const list = document.createElement("div");
      list.setAttribute("role", "listbox");
      for (const choice of ["Text", "Number", "Choice"]) {
        const option = document.createElement("div");
        option.setAttribute("role", "option");
        option.tabIndex = -1;
        option.textContent = choice;
        option.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { trigger.textContent = choice; list.remove(); }
        });
        list.appendChild(option);
      }
      list.addEventListener("keydown", (e) => { if (e.key === "Escape") list.remove(); });
      document.body.appendChild(list);
    });
    await expect(
      applyWindowFormChanges({ window: "New column", changes: [{ field: "kind", value: "Date" }] }),
    ).rejects.toThrow(/no choice "Date" \(choices: Text, Number, Choice\)/);
    expect(trigger.textContent).toBe("Text");
    await applyWindowFormChanges({ window: "New column", changes: [{ field: "kind", value: "choice" }] });
    expect(trigger.textContent).toBe("Choice");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("a run carries the open window forms", async () => {
    openInviteDialog();
    const scope = await withLiveSurfaceContext(null, {});
    expect((scope[WINDOW_FORMS_KEY] as { title: string }[]).map((f) => f.title)).toEqual(["Invite a teammate"]);
  });
});
