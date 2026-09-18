// features/marketing/seo/topical-map/views/pages/__tests__/runs-map-pages.test.tsx
//
// WHAT "MAP THE PAGES" TELLS A PERSON BEFORE THEY SPEND MONEY, and what it
// tells them afterwards.
//
// Three defects are measured here, all of them ones a screen can commit while
// looking perfectly fine:
//
// 1. THE CONSEQUENCE IS THE LEDGER'S, NOT A GUESS. The sentence above Start
//    quotes `queue_pending` and `pending_clicks` off
//    `seo.page_mapping_status` — shaped in the fixture exactly as
//    `Database["seo"]["Functions"]["page_mapping_status"]["Returns"][number]`
//    (see `runs-harness.tsx`).
// 2. ABSENT IS NOT ZERO. While that read is pending, or when it is refused, the
//    screen says so. "up to 0 of 0 pending pages" over a four-thousand-page site
//    is the sentence that makes somebody close the popover and do nothing.
// 3. `kept_existing` IS A SUCCESS. The map already held that placement from a
//    person or a higher-ranked source and the pass correctly left it alone. A
//    result screen that files it under failures punishes the behaviour we want.

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
jest.mock("../../../hooks", () => ({
  usePageMappingStatus: jest.fn(),
  usePageMappingWantedTopics: jest.fn(),
  usePageMappingWantedTopicsHeldBack: jest.fn(),
  useUpsertMapTopics: jest.fn(),
}));
jest.mock("../../../useMapPagesRun", () => ({ useMapPagesRun: jest.fn() }));

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { TopicalMapError } from "../../../errors";
import {
  usePageMappingStatus,
  usePageMappingWantedTopics,
  usePageMappingWantedTopicsHeldBack,
  useUpsertMapTopics,
} from "../../../hooks";
import type { MapTopicTreeNode } from "../../../types";
import { useMapPagesRun } from "../../../useMapPagesRun";
import { MapPagesRunControl } from "../runs/MapPagesRunControl";
import {
  context,
  heldBackTopicRow,
  mapPagesResult,
  mutation,
  pagesHandle,
  query,
  render,
  statusRow,
  wantedTopicRow,
  type PageMappingStatusRow,
} from "./runs-harness";

function noWantedTopics(): void {
  jest.mocked(usePageMappingWantedTopics).mockReturnValue(query("success", []));
  jest
    .mocked(usePageMappingWantedTopicsHeldBack)
    .mockReturnValue(query("success", []));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useMapPagesRun).mockReturnValue(pagesHandle());
  jest.mocked(usePageMappingStatus).mockReturnValue(
    query("success", statusRow()),
  );
  jest
    .mocked(useUpsertMapTopics)
    .mockReturnValue(
      mutation(async () => ({ created: [], updated: [], unchanged: [] })),
    );
  noWantedTopics();
});

function control() {
  return (
    <MapPagesRunControl
      context={context()}
      siteId="site-1"
      onChooseSite={jest.fn()}
    />
  );
}

describe("the consequence sentence", () => {
  it("names the pending pages and the waiting clicks from the ledger row", async () => {
    const screen = await render(control());
    const text = screen.text();
    expect(text).toContain("Will enrol and place up to");
    // `queue_pending` and `pending_clicks`, straight off the status row.
    expect(text).toContain("2916 pending pages");
    expect(text).toContain("812 clicks waiting");
    expect(text).toContain("next up: https://example.com/roof-repair");
    // The spend, and the one reassurance a person actually wants.
    expect(text).toContain("one model call per batch of");
    expect(text).toContain("Nothing a person placed is overwritten");
    await screen.unmount();
  });

  it("falls back to the daily ceiling knob and says which knob it is", async () => {
    const screen = await render(control());
    const text = screen.text();
    // 2000 = mapping_daily_page_ceiling; 50 = mapping_batch_size.
    expect(text).toContain("up to 2000 (the daily ceiling knob)");
    expect(text).toContain("batch of 50");
    await screen.unmount();
  });

  it("says the ledger is still loading rather than quoting a zero", async () => {
    jest.mocked(usePageMappingStatus).mockReturnValue(query("pending"));
    const screen = await render(control());
    const text = screen.text();
    expect(text).toContain("Reading this site's mapping ledger");
    expect(text).not.toContain("Will enrol and place up to");
    expect(text).not.toContain("0 pending pages");
    await screen.unmount();
  });

  it("prints the function's own refusal when the ledger read fails", async () => {
    jest.mocked(usePageMappingStatus).mockReturnValue(
      query<PageMappingStatusRow>(
        "error",
        undefined,
        // The PostgREST error shape the wrapper wraps, so the rendered
        // sentence is the FUNCTION's, exactly as it arrives.
        new TopicalMapError("seo.page_mapping_status", {
          message: "You cannot read this site.",
          code: "42501",
        }),
      ),
    );
    const screen = await render(control());
    const text = screen.text();
    expect(text).toContain("You cannot read this site.");
    expect(text).not.toContain("Will enrol and place up to");
    await screen.unmount();
  });

  it("shows the newest standing failure verbatim", async () => {
    jest.mocked(usePageMappingStatus).mockReturnValue(
      query(
        "success",
        statusRow({ last_error: "The model answered with a slug we do not have." }),
      ),
    );
    const screen = await render(control());
    expect(screen.text()).toContain(
      "The model answered with a slug we do not have.",
    );
    await screen.unmount();
  });
});

describe("the result summary", () => {
  it("reads kept_existing as kept, never as a failure", async () => {
    jest
      .mocked(useMapPagesRun)
      .mockReturnValue(
        pagesHandle({ result: mapPagesResult({ kept_existing: 19 }) }),
      );
    const screen = await render(control());
    const text = screen.text();
    expect(text).toContain(
      "19 kept — already decided by a person or a higher source",
    );
    expect(text).not.toContain("19 failed");
    expect(text).not.toMatch(/kept.{0,20}fail/i);
    await screen.unmount();
  });

  it("points a geography drop at the region run", async () => {
    jest.mocked(useMapPagesRun).mockReturnValue(
      pagesHandle({
        result: mapPagesResult({ dropped_geography_topic: 12 }),
      }),
    );
    expect((await render(control())).text()).toContain(
      "this map still has a geography branch",
    );
  });

  it("only quotes mapped_today / daily_ceiling from a result, never from the status row", async () => {
    // Nothing has run: the status row does not carry either figure, so neither
    // may appear. Rendering 0/0 here would be an invented fact.
    const before = await render(control());
    expect(before.text()).not.toContain("mapped today");
    await before.unmount();

    jest.mocked(useMapPagesRun).mockReturnValue(
      pagesHandle({
        result: mapPagesResult({
          ceiling_reached: true,
          mapped_today: 2_000,
          daily_ceiling: 2_000,
        }),
      }),
    );
    const after = await render(control());
    expect(after.text()).toContain("2000 of 2000 mapped today");
    await after.unmount();
  });

  it("prints the run's own notes and error unaltered", async () => {
    jest.mocked(useMapPagesRun).mockReturnValue(
      pagesHandle({
        result: mapPagesResult({
          notes: ["This map still has a geography branch: california."],
          error: "Two batches came back empty and the pass stopped early.",
        }),
      }),
    );
    const text = (await render(control())).text();
    expect(text).toContain(
      "This map still has a geography branch: california.",
    );
    expect(text).toContain(
      "Two batches came back empty and the pass stopped early.",
    );
  });
});

describe("the wanted-topics panel", () => {
  it("lists what the map is missing and what the bar held back, verbatim", async () => {
    jest
      .mocked(usePageMappingWantedTopics)
      .mockReturnValue(query("success", [wantedTopicRow()]));
    jest
      .mocked(usePageMappingWantedTopicsHeldBack)
      .mockReturnValue(query("success", [heldBackTopicRow()]));
    const screen = await render(control());
    expect(screen.text()).toContain("Emergency tarping");

    const disclosure = screen.button("Held back");
    expect(disclosure).not.toBeNull();
    // Held back is a DECISION, so its sentence is shown, not summarised.
    expect(screen.text()).not.toContain("Crawl it, or find a second page");
    if (disclosure) await screen.click(disclosure);
    expect(screen.text()).toContain(
      "Only one page asks for this and we have not crawled it yet. Crawl it, or find a second page, and it is promoted.",
    );
    await screen.unmount();
  });

  it("writes a PROPOSED root topic after a confirm that names it", async () => {
    const written: MapTopicTreeNode[][] = [];
    jest.mocked(usePageMappingWantedTopics).mockReturnValue(
      query("success", [wantedTopicRow({ suggested_topic_name: "Roof venting" })]),
    );
    jest.mocked(useUpsertMapTopics).mockReturnValue(
      mutation(async (tree: MapTopicTreeNode[]) => {
        written.push(tree);
        return { created: ["roof-venting"], updated: [], unchanged: [] };
      }),
    );
    const screen = await render(control());
    const add = screen.button("Add as proposed topic");
    expect(add).not.toBeNull();
    if (add) await screen.click(add);

    expect(jest.mocked(confirm)).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("Roof venting"),
      }),
    );
    expect(written).toEqual([
      [{ name: "Roof venting", slug: "roof-venting", status: "proposed" }],
    ]);
    await screen.unmount();
  });

  it("writes nothing when the confirm is declined", async () => {
    jest.mocked(confirm).mockResolvedValueOnce(false);
    const mutateAsync = jest.fn(async () => ({
      created: [],
      updated: [],
      unchanged: [],
    }));
    jest
      .mocked(usePageMappingWantedTopics)
      .mockReturnValue(query("success", [wantedTopicRow()]));
    jest.mocked(useUpsertMapTopics).mockReturnValue(mutation(mutateAsync));
    const screen = await render(control());
    const add = screen.button("Add as proposed topic");
    if (add) await screen.click(add);
    expect(mutateAsync).not.toHaveBeenCalled();
    await screen.unmount();
  });
});
