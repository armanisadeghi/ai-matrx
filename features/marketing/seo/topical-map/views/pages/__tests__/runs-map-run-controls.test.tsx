// features/marketing/seo/topical-map/views/pages/__tests__/runs-map-run-controls.test.tsx
//
// THE ROW ITSELF: who gets it, and what a run offers before it has a site.
//
// Both cases are laws, not preferences:
//   * `readOnly` means ABSENT. A greyed-out "Map the pages" over a record-only
//     grantee is a control that looks like it could act and cannot.
//   * Every one of these endpoints is `/seo/sites/{site_id}/map/…`. Without a
//     site there is nothing to run against, so the popover must offer the CHOICE
//     instead of Start — a Start that launched against "none" would reach the
//     server as the literal placeholder and die as a uuid cast error.

jest.mock("@ai-matrx/design-system", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./runs-mocks").designSystemMock(),
);
jest.mock("@/components/official/entity-ref/EntityRef", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./runs-mocks").entityRefMock(),
);
jest.mock("@/features/overlays/openers/liveRunWindow", () => ({
  useOpenLiveRunWindow: () => jest.fn(),
}));
jest.mock("@/lib/durable-run/useDurableRun", () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  formatElapsed: require("@/lib/progress/elapsed").formatElapsed,
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: jest.fn(async () => true),
}));
jest.mock("@/lib/redux/hooks", () => ({
  // The proposer reads ONE thing from the store: this map's page filters.
  useAppSelector: () => ({
    text: "",
    topicSlug: null,
    regionSlug: null,
    traffic: "all",
    disposition: null,
    state: null,
    source: null,
    onNoTopic: false,
  }),
  useAppDispatch: () => jest.fn(),
}));
jest.mock("../../../hooks", () => ({
  usePageMappingStatus: jest.fn(),
  usePageMappingWantedTopics: jest.fn(),
  usePageMappingWantedTopicsHeldBack: jest.fn(),
  useUpsertMapTopics: jest.fn(),
  useMapTopicSearch: jest.fn(),
}));
jest.mock("../../../useMapPagesRun", () => ({ useMapPagesRun: jest.fn() }));
jest.mock("../../../useMapRegionsRun", () => ({ useMapRegionsRun: jest.fn() }));
jest.mock("../../../useProposeIntentsRun", () => ({
  useProposeIntentsRun: jest.fn(),
}));

import {
  useMapTopicSearch,
  usePageMappingStatus,
  usePageMappingWantedTopics,
  usePageMappingWantedTopicsHeldBack,
  useUpsertMapTopics,
} from "../../../hooks";
import { useMapPagesRun } from "../../../useMapPagesRun";
import { useMapRegionsRun } from "../../../useMapRegionsRun";
import { useProposeIntentsRun } from "../../../useProposeIntentsRun";
import { MapRunControls } from "../runs/MapRunControls";
import {
  context,
  intentsHandle,
  mutation,
  pagesHandle,
  query,
  regionsHandle,
  render,
  statusRow,
} from "./runs-harness";

function armHooks(): void {
  jest.mocked(useMapPagesRun).mockReturnValue(pagesHandle());
  jest.mocked(useMapRegionsRun).mockReturnValue(regionsHandle());
  jest.mocked(useProposeIntentsRun).mockReturnValue(intentsHandle());
  jest.mocked(usePageMappingStatus).mockReturnValue(
    query("success", statusRow()),
  );
  jest.mocked(usePageMappingWantedTopics).mockReturnValue(query("success", []));
  jest
    .mocked(usePageMappingWantedTopicsHeldBack)
    .mockReturnValue(query("success", []));
  jest
    .mocked(useUpsertMapTopics)
    .mockReturnValue(mutation(async () => ({ created: [], updated: [], unchanged: [] })));
  jest.mocked(useMapTopicSearch).mockReturnValue(query("success", []));
}

beforeEach(() => {
  jest.clearAllMocks();
  armHooks();
});

describe("MapRunControls", () => {
  it("renders nothing at all for a read-only viewer", async () => {
    const screen = await render(
      <MapRunControls context={context({ readOnly: true })} />,
    );
    expect(screen.container.textContent).toBe("");
    expect(screen.container.querySelector("button")).toBeNull();
    await screen.unmount();
  });

  it("renders the three runs for a writer", async () => {
    const screen = await render(<MapRunControls context={context()} />);
    const text = screen.text();
    expect(text).toContain("Map the pages");
    expect(text).toContain("Find the regions");
    expect(text).toContain("Propose destinations");
    await screen.unmount();
  });

  it("offers the site chooser instead of Start when no site is in scope", async () => {
    const screen = await render(
      <MapRunControls
        context={context({ siteId: null, siteIds: ["site-7"] })}
      />,
    );
    expect(screen.text()).toContain("This runs for one site");
    expect(screen.button("Use this site")).not.toBeNull();
    // The consequence sentence and the Start it sits above belong to a site.
    expect(screen.text()).not.toContain("Will enrol and place up to");
    await screen.unmount();
  });

  it("says so honestly when the map is bound to no site the viewer can open", async () => {
    const screen = await render(
      <MapRunControls context={context({ siteId: null, siteIds: [] })} />,
    );
    expect(screen.text()).toContain(
      "This map is not used by any site you can view",
    );
    expect(screen.button("Use this site")).toBeNull();
    await screen.unmount();
  });

  it("chooses the site once for all three runs", async () => {
    const screen = await render(
      <MapRunControls
        context={context({ siteId: null, siteIds: ["site-7"] })}
      />,
    );
    const choose = screen.button("Use this site");
    expect(choose).not.toBeNull();
    if (choose) await screen.click(choose);
    // Every popover moved on together: nothing is still asking for a site.
    expect(screen.button("Use this site")).toBeNull();
    expect(jest.mocked(useMapPagesRun)).toHaveBeenLastCalledWith(
      expect.objectContaining({ siteId: "site-7" }),
    );
    expect(jest.mocked(useProposeIntentsRun)).toHaveBeenLastCalledWith(
      expect.objectContaining({ siteId: "site-7" }),
    );
    await screen.unmount();
  });
});
