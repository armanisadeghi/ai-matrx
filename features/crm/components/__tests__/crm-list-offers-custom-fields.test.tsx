/**
 * THE CRM PEOPLE LIST OFFERS ITS ORGANIZATION'S CUSTOM FIELDS AS COLUMNS — behaviour, not wiring
 * text (lane 7 W2, feeds guard G1).
 *
 * Renders the REAL `CrmListPage` with its service, its organizations and the store's field door
 * stubbed at the edge, and asserts what a person meets: the "Home clinic" custom field is a column
 * with a Choice picker (Downtown / Westside / Harbor), picking Westside asks the server for the
 * option KEY (`filters.custom.home_clinic`), and the list's own read carries the field list (so
 * search and sort reach it).
 *
 * RED ON A PLANT: point `CRM_LIST_PAGE_PLANT` at a copy of the page with the column source removed
 * (`scratchpad/lane7/plant-crm-list.sh` makes one beside the page and deletes it); every case here
 * fails. Never a mutation of the real file.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const CR = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const MARISOL = {
  id: "82a25af4-27cb-4e94-a2de-155eae7c8992",
  organization_id: CR,
  display_name: "Marisol Vega",
  party_kind: "person",
  job_title: "Physical Therapist",
  custom_fields: { home_clinic: "westside" },
  employer: null,
  updated_at: "2026-10-02T18:00:00Z",
  created_at: "2026-10-02T17:00:00Z",
};

/** The organizations the seat spans — 450 in the many-organizations case (the door reads 200 per call). */
let ORGS: string[] = [CR];
const acrossCalls: number[] = [];
const pageCalls: { query: { filters: { custom?: Record<string, unknown> } }; fields: { key: string }[] }[] = [];

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/crm",
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: () => undefined, success: () => undefined },
  recordToast: { success: () => undefined },
  dismissRecordToasts: () => undefined,
  toastErrorAlreadyCaptured: () => undefined,
}));
jest.mock("@/features/crm/hooks/useCrmContext", () => ({
  useCrmContext: () => ({ userId: "87a6e699-3622-4869-8843-d0867456c0dd", orgIds: ORGS, orgNames: { [CR]: "Cedar Ridge Physical Therapy" } }),
}));
jest.mock("@/features/crm/service", () => ({
  fetchPartyPage: async (query: unknown, _opts: unknown, _ctx: unknown, fields: { key: string }[] = []) => {
    pageCalls.push({ query: query as never, fields });
    return { rows: [MARISOL], total: 1 };
  },
  fetchPartyScopeCounts: async () => ({ byKind: { all: 1 }, narrow: {} }),
  countPartyList: async () => 1,
  fetchPartyWholeResult: async () => ({ rows: [MARISOL], total: 1, ceiling: null }),
  fetchPendingCandidateCount: async () => 0,
  deleteParties: async () => {},
  deleteParty: async () => {},
  restoreParties: async () => {},
  restoreParty: async () => {},
  setPartiesDoNotContact: async () => {},
}));
// THE STORE'S FIELD DOOR, at the edge: one org, one Choice field and its options.
jest.mock("@ai-matrx/records/core", () => ({
  createRecordsClient: () => ({
    // ONE read across the list's organizations: Fields with their choices.
    entityFieldsAcross: async ({ organization_ids }: { organization_ids: string[] }) => {
      acrossCalls.push(organization_ids.length);
      // The door's own cap, refused by name exactly as custom.entity_fields_across does.
      if (organization_ids.length > 200) {
        return { ok: false, error: { code: "invalid_input", message: `One read covers at most 200 organizations, and this asked for ${organization_ids.length}.` } };
      }
      if (!organization_ids.includes(CR)) return { ok: true, data: { fields: [], unavailable: [] } };
      return {
      ok: true,
      data: {
        fields: [
          {
            id: "f68a3998", organization_id: CR, key: "home_clinic", label: "Home clinic", type: "list",
            sensitivity: "internal", config: { options_table_id: "ce3b0c0c" },
            options: { downtown: { label: "Downtown" }, westside: { label: "Westside" }, harbor: { label: "Harbor" } },
          },
        ],
        unavailable: [],
      },
      };
    },
    entityFields: async () => ({
      ok: true,
      data: [{ id: "f68a3998", key: "home_clinic", label: "Home clinic", type: "list", sensitivity: "internal", config: { options_table_id: "ce3b0c0c" } }],
    }),
    fieldOptions: async () => ({
      ok: true,
      data: [
        { id: "o1", data: { title: "Downtown" }, metadata: { option_key: "downtown" }, deleted_at: null },
        { id: "o2", data: { title: "Westside" }, metadata: { option_key: "westside" }, deleted_at: null },
        { id: "o3", data: { title: "Harbor" }, metadata: { option_key: "harbor" }, deleted_at: null },
      ],
    }),
  }),
}));
jest.mock("@ai-matrx/records-ui", () => ({ personActor: () => ({ actor: "user" }), recordsDataSource: () => ({}) }));
jest.mock("@/utils/supabase/client", () => (require("@/tests/helpers/emptySupabaseClient") as typeof import("@/tests/helpers/emptySupabaseClient")).emptySupabaseClientModule());
// Chrome around the list that is not under test.
jest.mock("@/features/crm/components/saved-views/SavedViewBar", () => ({ SavedViewBar: () => null }));
jest.mock("@/features/crm/components/dedup/CrmAssistStrip", () => ({ CrmAssistStrip: () => null }));
jest.mock("@/features/crm/components/outreach-lists/AddToOutreachListDialog", () => ({ AddToOutreachListDialog: () => null }));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/crm/components/crm-row-actions", () => ({
  partyMenuTarget: () => null,
  useCrmRowMenu: () => ({ getApplicationScope: () => ({}), resolveContextOnOpen: () => ({}), sections: [] }),
}));
jest.mock("@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/overlays/openers/crmCreatePartyWindow", () => ({ useOpenCrmCreatePartyWindow: () => () => ({ close: () => {} }) }));
jest.mock("@/features/overlays/openers/googleImportWindows", () => ({ useOpenGoogleContactsImport: () => () => {} }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/lib/entity-list/components/EntityScopeTabs", () => ({ EntityScopeTabs: () => null }));
jest.mock("@/lib/entity-list/components/EntityOrgFilter", () => ({ EntityOrgFilter: () => null }));
jest.mock("@/features/crm/agent-context/buildCrmListContextData", () => ({ buildCrmListContextData: () => ({}) }));
// The person already showed the custom column (their view prefs).
jest.mock("@/lib/list-views/useListViewPrefs", () => {
  const { useState } = jest.requireActual("react");
  return {
    useListViewPrefs: (_key: string, defaults: Record<string, unknown>) => {
      const [prefs, setState] = useState({
        version: 1, view: "table", density: "comfortable", sort: "updated_at", direction: "desc",
        favoritesFirst: false, pageSize: 25, hiddenColumns: [], shownColumns: ["cf:home_clinic"], ...defaults,
      });
      return { prefs, setPrefs: (patch: Record<string, unknown>) => setState((p: object) => ({ ...p, ...patch })) };
    },
  };
});

import { makeStore } from "@/lib/redux/store";
import { TooltipProvider } from "@/components/ui/tooltip";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CrmListPage } = require(process.env.CRM_LIST_PAGE_PLANT ?? "../CrmListPage") as typeof import("../CrmListPage");

let container: HTMLDivElement;
let root: Root;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function settle(ms = 400) {
  await act(async () => {
    await wait(ms);
  });
}

beforeEach(async () => {
  pageCalls.length = 0;
  acrossCalls.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={makeStore()}>
        <TooltipProvider>
          <CrmListPage />
        </TooltipProvider>
      </Provider>,
    );
  });
  await settle(900);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const byLabel = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`);

describe("the CRM people list offers custom fields as columns", () => {
  it("the custom field is a column showing the option's label", () => {
    expect(byLabel("Sort or filter Home clinic")).not.toBeNull();
    const row = [...document.querySelectorAll("tbody tr")].map((tr) => tr.textContent ?? "").find((t) => t.includes("Marisol Vega"));
    expect(row).toContain("Westside");
  });

  it("the list's own read carries the field, so search and sort reach it", () => {
    expect(pageCalls.at(-1)?.fields.map((f) => f.key)).toContain("home_clinic");
  });

  it("its filter is a Choice picker, and Westside asks the server for the key", async () => {
    await act(async () => {
      byLabel("Sort or filter Home clinic")!.click();
    });
    await settle();
    const choices = [...document.querySelectorAll('[role="checkbox"],[role="radio"]')]
      .map((e) => e.getAttribute("aria-label"))
      .filter((l) => l === "Downtown" || l === "Westside" || l === "Harbor");
    expect(choices).toEqual(["Downtown", "Westside", "Harbor"]);
    await act(async () => {
      (byLabel("Westside")!.closest("[cmdk-item]") as HTMLElement | null ?? byLabel("Westside")!).click();
    });
    await settle();
    const apply = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Apply");
    if (apply) {
      await act(async () => {
        apply.click();
      });
    }
    await settle(800);
    const custom = pageCalls.at(-1)?.query.filters.custom as Record<string, { values?: string[] }> | undefined;
    expect(custom?.home_clinic?.values).toEqual(["westside"]);
  });
});

describe("a person in more organizations than one fields read covers", () => {
  beforeAll(() => {
    ORGS = [...Array.from({ length: 449 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`), CR];
  });
  afterAll(() => {
    ORGS = [CR];
  });
  it("reads the fields in pages of 200 and still shows the column", () => {
    expect(acrossCalls).toEqual([200, 200, 50]);
    expect(byLabel("Sort or filter Home clinic")).not.toBeNull();
  });
});
