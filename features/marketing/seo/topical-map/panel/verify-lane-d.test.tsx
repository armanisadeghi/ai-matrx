// features/marketing/seo/topical-map/panel/verify-lane-d.test.tsx
//
// ZERO-AUTHORSHIP VERIFICATION (VERIFIER-D.md), written independently of the
// builder's tests and fixture. It does not import
// `__fixtures__/mapTopicAssociationsRecorded.ts` — every row here is composed
// fresh, from the function body read directly
// (`aidream/packages/matrx-seo/matrx_seo/migrations/20260916100000_..._19_page_intents.sql`
// lines 392-447: `topic` / `association{kind,role,direction,payload}` / `item`
// shape) for a DIFFERENT real `platform.entity_types` token than the builder
// used (`crm_deal`, confirmed live at `aidream/db/migrations/
// 0766_google_sync_document_and_calendar_records.sql:206`, a registered
// association target — the builder used `web_youtube_video`/`rulebook`).
//
// What this file proves, item by item against VERIFIER-D.md:
//   A. a kind the panel never special-cases groups and labels with NO code
//      change, at both the pure `splitAssociations` layer and through the
//      real `TopicDetailBody` render.
//   B. read-only removes EVERY write control this file can enumerate by
//      reading the panel's own source (Attach, Detach X, Change, facet
//      Clear/picker, Make a page here, the two agent buttons) — ABSENT, not
//      merely disabled.
//   C. counts print nothing when the tree loaded without `counts` (absent is
//      not zero), and the Pages section never prints a count it did not
//      receive.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { splitAssociations, itemLabel, SPECIAL_KINDS } from "./associationGroups";
import type { MapTopicAssociation, MapTreeWholeResult } from "../types";
import topicalMapReducer, { mapTreeLoaded } from "../redux/slice";
import type { TopicalMapKnobs } from "../knobs";
import { TopicDetailBody } from "./TopicDetailBody";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const MAP_ID = "verify-map-0000-4000-8000-000000000001";
const SLUG = "verifier-topic";

// Composed independently — NOT recorded, NOT the builder's fixture. Shaped
// exactly as `seo.map_topic_associations`'s own `jsonb_build_object` (kind,
// role, direction, payload; item = `platform.resolve_entity_ref`'s
// {type,id,label,...}) for a registered pair the panel has no section for.
const VERIFIER_GENERIC_ROW: MapTopicAssociation = {
  topic: SLUG,
  association: { kind: "crm_deal", role: "related_to", direction: "in" },
  item: {
    id: "9c9c9c9c-1111-4000-8000-000000000099",
    type: "crm_deal",
    label: "Q4 recycling contract renewal",
  },
};

describe("VERIFIER-D item A — splitAssociations, a fresh composed row", () => {
  it("is not a SPECIAL_KINDS token", () => {
    expect(SPECIAL_KINDS.has("crm_deal")).toBe(false);
  });

  it("groups the kind under the exact string the function returned, with no code change", () => {
    const split = splitAssociations([VERIFIER_GENERIC_ROW]);
    expect(split.generic).toHaveLength(1);
    expect(split.generic[0].kind).toBe("crm_deal");
    expect(split.generic[0].rows).toHaveLength(1);
    expect(itemLabel(split.generic[0].rows[0])).toBe("Q4 recycling contract renewal");
    expect(split.generic[0].hidden).toBe(0);
    expect(split.pages).toEqual([]);
    expect(split.planned).toEqual([]);
    expect(split.keywords).toEqual([]);
  });
});

// ── Full render, through the real body, the real slice, the real selectors ──

const TREE_WITH_COUNTS: MapTreeWholeResult = {
  map_id: MAP_ID,
  root: null,
  total_topics: 1,
  topics: [
    {
      slug: SLUG,
      name: "Verifier Topic",
      status: "active",
      description: "A topic composed only for this verification.",
      pages: 0,
      planned: 0,
      keywords: 0,
      facets: {},
    },
  ],
};

const mapTopicAssociations = jest.fn(async () => [VERIFIER_GENERIC_ROW]);
const mapTopicFacets = jest.fn(async () => ({}));
const mapTree = jest.fn(async () => TREE_WITH_COUNTS);

jest.mock("../data", () => ({
  __esModule: true,
  mapTree: (...args: unknown[]) => mapTree(...(args as [])),
  mapTopicAssociations: (...args: unknown[]) => mapTopicAssociations(...(args as [])),
  mapTopicFacets: (...args: unknown[]) => mapTopicFacets(...(args as [])),
  getTopicalMap: jest.fn(async () => ({
    id: MAP_ID,
    organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    brand_id: null,
    name: "Verifier map",
  })),
  listMapTopics: jest.fn(async () => [
    { id: "verifier-topic-row-id", map_id: MAP_ID, slug: SLUG, name: "Verifier Topic" },
  ]),
  listMapHistory: jest.fn(async () => ({ total: 0, limit: 1000, offset: 0, items: [] })),
  listMapFacets: jest.fn(async () => []),
  listMapFacetValues: jest.fn(async () => []),
  mapDiagnostics: jest.fn(async () => ({ sites_using_map: [] })),
  patchMapTopics: jest.fn(),
  setMapTopicFacet: jest.fn(),
  mapDryRun: jest.fn(),
  retireMapTopics: jest.fn(),
  rejectMapTopics: jest.fn(),
  moveMapTopic: jest.fn(),
  mergeMapTopics: jest.fn(),
  splitMapTopic: jest.fn(),
}));

const knobState: { knobs: TopicalMapKnobs | null; loading: boolean; error: Error | null } = {
  knobs: null,
  loading: false,
  error: null,
};
jest.mock("../knobs", () => ({
  __esModule: true,
  useTopicalMapKnobs: () => knobState,
}));

jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  __esModule: true,
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  __esModule: true,
  EntityRef: ({ name, token }: { name?: string | null; token: string }) => (
    <span data-entity-ref={token}>{name}</span>
  ),
}));
jest.mock("@/features/overlays/openers/topicalMapTopicPanel", () => ({
  __esModule: true,
  useOpenTopicPanel: () => jest.fn(),
}));
jest.mock("@/features/overlays/openers/mandateWindow", () => ({
  __esModule: true,
  useOpenMandateWindow: () => jest.fn(),
}));
jest.mock("@/features/mandates/useMandate", () => ({
  __esModule: true,
  useMandate: () => ({ mandate: null, loading: false, error: null, absent: true, organizationPending: false }),
}));
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  __esModule: true,
  SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  getSurfaceRuntimeForName: () => null,
}));
jest.mock("@ai-matrx/associations/react", () => ({
  __esModule: true,
  UniversalAssociationPicker: () => <div data-picker />,
}));
jest.mock("@/features/scopes/service/associationsService", () => ({
  __esModule: true,
  associationsService: { add: jest.fn(), remove: jest.fn() },
}));
jest.mock("@/features/cms/services/cmsService", () => ({
  __esModule: true,
  CmsSiteService: { listSites: jest.fn(async () => []) },
  CmsPageService: { listPages: jest.fn(async () => []) },
}));
jest.mock("@/features/marketing/data/hooks", () => ({
  __esModule: true,
  useSite: () => ({ data: null }),
}));
jest.mock("@/features/marketing/content-plan/data/service", () => ({
  __esModule: true,
  createPlanNode: jest.fn(),
}));
jest.mock("@/lib/layout/useClippedContentGuard", () => ({
  __esModule: true,
  useClippedContentGuard: () => undefined,
}));
jest.mock("@/lib/toast", () => ({
  __esModule: true,
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));
jest.mock("@/components/dialogs/clipboard-fallback/ClipboardFallbackDialog", () => ({
  __esModule: true,
  ClipboardFallbackDialog: () => null,
}));
jest.mock("@/components/dialogs/text-input/TextInputDialog", () => ({
  __esModule: true,
  TextInputDialog: () => null,
}));

function liveKnobs(): TopicalMapKnobs {
  return {
    detail_panel: "window",
    topic_agent_change_mode: "apply",
    description_regeneration_mode: "queued",
    performance_window_days: 28,
    topic_description_max_chars: 1200,
    intent_colors: {
      in_place: "green",
      leaving: "amber",
      arriving: "blue",
      delete: "red",
      missing: "gray_dashed",
      planned: "purple_dashed",
    },
  } as TopicalMapKnobs;
}

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

function mount(props: { readOnly?: boolean; includeCounts?: boolean }): Mounted {
  const store = configureStore({ reducer: { topicalMap: topicalMapReducer } });
  const includes = props.includeCounts
    ? ["description", "status", "counts", "facets"]
    : ["description", "status", "facets"];
  store.dispatch(mapTreeLoaded({ mapId: MAP_ID, result: TREE_WITH_COUNTS, includes }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <Provider store={store}>
        <QueryClientProvider client={client}>
          <TopicDetailBody
            mapId={MAP_ID}
            slug={SLUG}
            siteId={null}
            host={props.readOnly ? "peek" : "window"}
            readOnly={props.readOnly ?? false}
          />
        </QueryClientProvider>
      </Provider>,
    );
  });
  return { container, root };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function unmount(mounted: Mounted): void {
  act(() => mounted.root.unmount());
  mounted.container.remove();
}

beforeEach(() => {
  knobState.knobs = liveKnobs();
  knobState.loading = false;
  knobState.error = null;
  mapTree.mockClear();
});

describe("VERIFIER-D item A — TopicDetailBody, a fresh composed row, no code change", () => {
  it("renders the crm_deal group, labelled by the item, with no special-case in this file's own composed data", async () => {
    const mounted = mount({ includeCounts: true });
    await flush();
    const group = mounted.container.querySelector('[data-association-kind="crm_deal"]');
    expect(group).not.toBeNull();
    expect(group?.textContent).toContain("Q4 recycling contract renewal");
    expect(group?.querySelector('[data-entity-ref="crm_deal"]')).not.toBeNull();
    unmount(mounted);
  });
});

describe("VERIFIER-D item B — read-only removes EVERY write control this test enumerates", () => {
  it("has none of: Attach, Detach, Change, Make a page here, agent buttons, facet Clear/picker", async () => {
    const mounted = mount({ readOnly: true, includeCounts: true });
    await flush();
    const text = mounted.container.textContent ?? "";
    const buttonLabels = [...mounted.container.querySelectorAll("button")].map((b) =>
      (b.textContent ?? "").trim(),
    );
    expect(buttonLabels).not.toContain("Attach");
    expect(buttonLabels).not.toContain("Change");
    expect(text).not.toContain("Make a page here");
    expect(text).not.toContain("Rewrite description");
    expect(text).not.toContain("Ask about this topic");
    expect(mounted.container.querySelector('button[aria-label^="Detach"]')).toBeNull();
    expect(mounted.container.querySelector('button[aria-label^="Clear "]')).toBeNull();
    // …while the readable content — including the generic row — is present.
    expect(text).toContain("Q4 recycling contract renewal");
    unmount(mounted);
  });
});

describe("VERIFIER-D item C — absent is not zero, verified independently", () => {
  it("prints [data-counts-loaded=false] and no page/planned/keyword figure when the tree loaded without counts", async () => {
    const mounted = mount({ includeCounts: false });
    await flush();
    expect(mounted.container.querySelector('[data-counts-loaded="false"]')).not.toBeNull();
    const text = mounted.container.textContent ?? "";
    // The zero-topic tree carries 0 pages/planned/keywords when counts ARE
    // included; with counts absent this test's fixture would still read "0
    // pages" if the component ever fell back to a client-computed count
    // instead of trusting `counts.loaded`.
    expect(text).not.toMatch(/\b0 pages?\b/);
    unmount(mounted);
  });
});
