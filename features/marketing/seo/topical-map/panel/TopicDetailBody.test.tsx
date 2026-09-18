// features/marketing/seo/topical-map/panel/TopicDetailBody.test.tsx
//
// THE ONE body, rendered through the REAL slice, the REAL hooks and the REAL
// selectors, with the `seo.*` wrappers answering the RECORDED bytes of
// `seo.map_topic_associations` / `seo.map_topic_facets` for All Green's
// `cable-and-wire-recycling` (fixture header), plus one composed row of a kind
// the panel never names.
//
// What each case defends:
//   · a kind the panel has never heard of renders GROUPED and LABELLED (the
//     vision's done-check for U3: a new association type appears with no code
//     change);
//   · read-only removes EVERY write control — absent, not disabled;
//   · the topic agent's doors are honest while `seo.topic_curation` does not
//     resolve (no mandate.definition row exists live, 2026-09-18): disabled AND
//     the sentence naming the key is on the screen;
//   · traffic is the function's numbers over the function's window;
//   · counts print only when the tree was loaded WITH counts (absent ≠ zero);
//   · an unknown slug on a loaded map is the P0002 sentence, and on an unloaded
//     map the panel LOADS the tree itself (self-loading) instead of pretending.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import topicalMapReducer from "../redux/slice";
import type { TopicalMapKnobs } from "../knobs";
import type { MapTreeWholeResult } from "../types";
import { TopicDetailBody } from "./TopicDetailBody";
import {
  COMPOSED_GENERIC_ROW,
  RECORDED_ASSOCIATIONS,
  RECORDED_FACETS,
  RECORDED_MAP_ID,
  RECORDED_SLUG,
} from "./__fixtures__/mapTopicAssociationsRecorded";

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

// ── The wrappers (`data.ts`) — everything else above them is real ──────────

const TREE: MapTreeWholeResult = {
  map_id: RECORDED_MAP_ID,
  root: null,
  total_topics: 2,
  topics: [
    {
      slug: "electronics-recycling",
      name: "Electronics Recycling",
      status: "active",
      pages: 40,
      planned: 0,
      keywords: 3,
      facets: { offering_kind: "service" },
      children: [
        {
          slug: RECORDED_SLUG,
          name: "Cable and Wire Recycling",
          status: "active",
          description: "Recycling of computer cables, power cords and wires.",
          pages: 1,
          planned: 0,
          keywords: 0,
          facets: { offering_kind: "service" },
        },
      ],
    },
  ],
};

const mapTree = jest.fn(async () => TREE);
const mapTopicAssociations = jest.fn(async () => [...RECORDED_ASSOCIATIONS, COMPOSED_GENERIC_ROW]);
const mapTopicFacets = jest.fn(async () => RECORDED_FACETS);

jest.mock("../data", () => ({
  __esModule: true,
  mapTree: (...args: unknown[]) => mapTree(...(args as [])),
  mapTopicAssociations: (...args: unknown[]) => mapTopicAssociations(...(args as [])),
  mapTopicFacets: (...args: unknown[]) => mapTopicFacets(...(args as [])),
  getTopicalMap: jest.fn(async () => ({
    id: RECORDED_MAP_ID,
    organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    brand_id: "c2db36a1-0000-4000-8000-000000000000",
    name: "All Green Recycling",
  })),
  listMapTopics: jest.fn(async () => [
    { id: "topic-row-id", map_id: RECORDED_MAP_ID, slug: RECORDED_SLUG, name: "Cable and Wire Recycling" },
  ]),
  listMapHistory: jest.fn(async () => ({ total: 0, limit: 1000, offset: 0, items: [] })),
  listMapFacets: jest.fn(async () => [
    { id: "facet-offering-kind", key: "offering_kind", label: "Offering kind", inherits: true },
  ]),
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

// ── Chrome that is not under test ──────────────────────────────────────────

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
const openMandate = jest.fn();
jest.mock("@/features/overlays/openers/mandateWindow", () => ({
  __esModule: true,
  useOpenMandateWindow: () => openMandate,
}));
// No `mandate.definition` row carries `seo.topic_curation` live (verified
// 2026-09-18) — the resolver's `absent` is the state the screen must be honest about.
jest.mock("@/features/mandates/useMandate", () => ({
  __esModule: true,
  useMandate: () => ({
    mandate: null,
    loading: false,
    error: null,
    absent: true,
    organizationPending: false,
  }),
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
  // The live rows, read 2026-09-18 (`platform.feature_knob`, feature seo.topical_map).
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
  store: ReturnType<typeof configureStore>;
}

function mount(props: {
  slug?: string;
  readOnly?: boolean;
  host?: "window" | "peek";
  preloadTree?: { includeCounts: boolean } | null;
}): Mounted {
  const store = configureStore({ reducer: { topicalMap: topicalMapReducer } });
  if (props.preloadTree) {
    // Loaded by a workspace before the panel opened — with or without counts.
    const includes = props.preloadTree.includeCounts
      ? ["description", "status", "counts", "facets"]
      : ["description", "status", "facets"];
    const { mapTreeLoaded } = jest.requireActual<typeof import("../redux/slice")>("../redux/slice");
    store.dispatch(mapTreeLoaded({ mapId: RECORDED_MAP_ID, result: TREE, includes }));
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <Provider store={store}>
        <QueryClientProvider client={client}>
          <TopicDetailBody
            mapId={RECORDED_MAP_ID}
            slug={props.slug ?? RECORDED_SLUG}
            siteId={null}
            host={props.host ?? "window"}
            readOnly={props.readOnly ?? false}
          />
        </QueryClientProvider>
      </Provider>,
    );
  });
  return { container, root, store };
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

describe("TopicDetailBody — a writer, on a map the workspace loaded with counts", () => {
  let mounted: Mounted;
  beforeEach(async () => {
    mounted = mount({ preloadTree: { includeCounts: true } });
    await flush();
  });
  afterEach(() => unmount(mounted));

  it("renders identity, path and counts from the slice", () => {
    const text = mounted.container.textContent ?? "";
    expect(mounted.container.querySelector('[data-testid="topic-name"]')?.textContent).toBe(
      "Cable and Wire Recycling",
    );
    expect(text).toContain("Recycling of computer cables, power cords and wires.");
    // The path crumb names the parent by NAME, not slug.
    expect(mounted.container.querySelector('nav[aria-label="Topic path"]')?.textContent).toContain(
      "Electronics Recycling",
    );
    // Counts were loaded → printed.
    expect(text).toContain("1 page");
    expect(mounted.container.querySelector('[data-counts-loaded="false"]')).toBeNull();
    // The panel did NOT re-load the tree — the workspace already had it.
    expect(mapTree).not.toHaveBeenCalled();
  });

  it("renders the recorded page with the function's traffic over the function's window", () => {
    const text = mounted.container.textContent ?? "";
    expect(text).toContain("traffic over 28 days");
    expect(text).toContain("2 / 586");
    expect(
      mounted.container.querySelector('[data-page-id="bf089006-3b35-4b80-89b0-c8d3055ad8cb"]'),
    ).not.toBeNull();
    expect(
      mounted.container.querySelector('a[href="https://allgreenrecycling.com/wires-and-cable-recycling"]'),
    ).not.toBeNull();
  });

  it("renders the recorded facet as an own (not inherited) chip", () => {
    const chip = mounted.container.querySelector('[title="offering_kind: service"]');
    expect(chip).not.toBeNull();
    expect(chip?.querySelector('button[aria-label="Clear offering_kind"]')).not.toBeNull();
  });

  it("groups a kind the panel never special-cases under the function's own string, labelled", () => {
    const group = mounted.container.querySelector('[data-association-kind="web_youtube_video"]');
    expect(group).not.toBeNull();
    expect(group?.textContent).toContain("How we shred hard drives");
    expect(group?.querySelector('[data-entity-ref="web_youtube_video"]')).not.toBeNull();
    // The facet-value edge is NOT a generic row.
    expect(mounted.container.querySelector('[data-association-kind="seo_map_facet_value"]')).toBeNull();
  });

  it("shows the write controls, and the agent doors honest-disabled naming the missing key", () => {
    const text = mounted.container.textContent ?? "";
    expect(text).toContain("Attach");
    expect(text).toContain("Make a page here");
    expect(text).toContain("Change");
    const buttons = [...mounted.container.querySelectorAll("button")];
    const rewrite = buttons.find((b) => b.textContent?.includes("Rewrite description"));
    const ask = buttons.find((b) => b.textContent?.includes("Ask about this topic"));
    expect(rewrite?.disabled).toBe(true);
    expect(ask?.disabled).toBe(true);
    expect(text).toContain('"seo.topic_curation"');
    expect(text).toContain("no live job has that name");
  });
});

describe("TopicDetailBody — read-only (a peek, a record-only grantee)", () => {
  let mounted: Mounted;
  beforeEach(async () => {
    mounted = mount({ readOnly: true, host: "peek", preloadTree: { includeCounts: true } });
    await flush();
  });
  afterEach(() => unmount(mounted));

  it("removes EVERY write control — absent, not disabled", () => {
    const text = mounted.container.textContent ?? "";
    expect(mounted.container.getAttribute("data-read-only")).toBeNull(); // attr is on the inner root
    expect(mounted.container.querySelector('[data-read-only="true"]')).not.toBeNull();
    const labels = [...mounted.container.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(labels).not.toContain("Attach");
    expect(text).not.toContain("Make a page here");
    expect(text).not.toContain("Rewrite description");
    expect(text).not.toContain("Ask about this topic");
    expect(mounted.container.querySelector('button[aria-label="Clear offering_kind"]')).toBeNull();
    expect(mounted.container.querySelector('button[aria-label^="Detach"]')).toBeNull();
    const change = [...mounted.container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Change",
    );
    expect(change).toBeUndefined();
    // …and everything readable is still there.
    expect(text).toContain("How we shred hard drives");
    expect(text).toContain("2 / 586");
  });
});

describe("TopicDetailBody — absent is not zero", () => {
  it("prints no counts when the tree was loaded without them", async () => {
    const mounted = mount({ preloadTree: { includeCounts: false } });
    await flush();
    expect(mounted.container.querySelector('[data-counts-loaded="false"]')).not.toBeNull();
    expect(mounted.container.textContent).not.toContain("1 page");
    unmount(mounted);
  });
});

describe("TopicDetailBody — when no workspace loaded the map", () => {
  it("loads the tree itself and then renders the topic", async () => {
    const mounted = mount({ preloadTree: null });
    await flush();
    expect(mapTree).toHaveBeenCalledTimes(1);
    expect(mounted.container.querySelector('[data-testid="topic-name"]')?.textContent).toBe(
      "Cable and Wire Recycling",
    );
    unmount(mounted);
  });

  it("says which of the two 'not here' cases it is for an unknown slug on a loaded map", async () => {
    const mounted = mount({ slug: "no-such-topic", preloadTree: { includeCounts: true } });
    await flush();
    const alert = mounted.container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('This map has no topic "no-such-topic"');
    expect(alert?.textContent).toContain("History screen");
    unmount(mounted);
  });
});
