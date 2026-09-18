// features/marketing/seo/topical-map/views/pages/__tests__/runs-map-regions.test.tsx
//
// 🚨 THE DESTRUCTIVE SWITCH ANSWERS ITS OWN QUESTION BEFORE IT ARMS ANYTHING.
//
// Retiring a map's geography branches moves every page they carry and can leave
// some of those pages on NO topic at all. Nobody — not the person, not this
// screen — can guess those two numbers, and a generic "Are you sure?" over them
// would be the destructive-click defect wearing a dialog. The region pass makes
// NO MODEL CALLS, so the same call with `dry_run: true` answers for free: that
// is what turning the switch on does, and Start does not exist until it has
// answered.
//
// What this suite pins, in order: the switch launches a dry run and only a dry
// run; Start is absent while that rehearsal is unanswered and the screen says
// why; the branches, the pages they move and the pages left on nothing all
// appear before Start does; and the real launch carries the slugs that were
// actually ticked, never an empty list (which the server reads as "retire
// everything").

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
jest.mock("../../../useMapRegionsRun", () => ({ useMapRegionsRun: jest.fn() }));

import type { MapRegionsInput } from "../../../map-regions";
import { useMapRegionsRun } from "../../../useMapRegionsRun";
import { MapRegionsRunControl } from "../runs/MapRegionsRunControl";
import {
  context,
  mapRegionsResult,
  regionsHandle,
  render,
  type Screen,
} from "./runs-harness";

const CALIFORNIA = {
  slug: "california",
  name: "California",
  reason:
    "Every page under this topic names a city or a county and nothing else.",
  pages: 557,
  pages_with_no_other_topic: 38,
  retired: false,
};

function control() {
  return (
    <MapRegionsRunControl
      context={context()}
      siteId="site-1"
      onChooseSite={jest.fn()}
    />
  );
}

/** The switch carries no text of its own — it is found by the id it is labelled by. */
async function turnOnRetirement(screen: Screen): Promise<void> {
  const toggle = screen.find("#map-regions-retire");
  expect(toggle).not.toBeNull();
  if (toggle) await screen.click(toggle);
}

let run: jest.Mock<Promise<void>, [MapRegionsInput?]>;

beforeEach(() => {
  jest.clearAllMocks();
  run = jest.fn(async () => undefined);
  jest.mocked(useMapRegionsRun).mockReturnValue(regionsHandle({ run }));
});

describe("retiring geography branches", () => {
  it("rehearses first — the switch launches a dry run, not the retirement", async () => {
    const screen = await render(control());
    await turnOnRetirement(screen);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ retireGeographyTopics: true, dryRun: true }),
    );
    await screen.unmount();
  });

  it("keeps Start absent until the rehearsal answers, and says why", async () => {
    const screen = await render(control());
    await turnOnRetirement(screen);

    expect(screen.text()).toContain(
      "The rehearsal has to answer before this can retire anything",
    );
    expect(screen.button("Retire")).toBeNull();
    await screen.unmount();
  });

  it("shows what would move — and what would end on nothing — before offering Start", async () => {
    const screen = await render(control());
    await turnOnRetirement(screen);

    // The rehearsal lands, exactly as a live stream or a rejoin would deliver it.
    jest.mocked(useMapRegionsRun).mockReturnValue(
      regionsHandle({
        run,
        result: mapRegionsResult({
          dry_run: true,
          geography_branches: [CALIFORNIA],
        }),
      }),
    );
    await screen.rerender(control());

    const text = screen.text();
    expect(text).toContain("Retiring 1 branch(es) moves 557 pages");
    expect(text).toContain("38 would end on NO topic");
    // The server's own sentence for what it recognised.
    expect(text).toContain(
      "Every page under this topic names a city or a county and nothing else.",
    );
    expect(screen.button("Retire 1 branch(es) and bind the regions")).not.toBeNull();
    await screen.unmount();
  });

  it("launches the retirement with the slugs that were actually ticked", async () => {
    const screen = await render(control());
    await turnOnRetirement(screen);
    jest.mocked(useMapRegionsRun).mockReturnValue(
      regionsHandle({
        run,
        result: mapRegionsResult({
          dry_run: true,
          geography_branches: [
            CALIFORNIA,
            {
              slug: "texas",
              name: "Texas",
              reason: "Same shape as California.",
              pages: 120,
              pages_with_no_other_topic: 4,
              retired: false,
            },
          ],
        }),
      }),
    );
    await screen.rerender(control());

    // Untick Texas: the sentence has to follow the ticks, not the findings.
    const texas = screen.find("#map-regions-retire-texas");
    expect(texas).not.toBeNull();
    if (texas) await screen.click(texas);
    expect(screen.text()).toContain("Retiring 1 branch(es) moves 557 pages");

    const start = screen.button("Retire 1 branch(es) and bind the regions");
    expect(start).not.toBeNull();
    if (start) await screen.click(start);

    // 🚨 An EMPTY slug list means "retire everything" on the server, so the
    // launch must name exactly what the person ticked.
    expect(run).toHaveBeenLastCalledWith(
      expect.objectContaining({
        retireGeographyTopics: true,
        geographyTopicSlugs: ["california"],
        dryRun: false,
      }),
    );
    await screen.unmount();
  });

  it("refuses to start with nothing ticked instead of retiring everything", async () => {
    const screen = await render(control());
    await turnOnRetirement(screen);
    jest.mocked(useMapRegionsRun).mockReturnValue(
      regionsHandle({
        run,
        result: mapRegionsResult({
          dry_run: true,
          geography_branches: [CALIFORNIA],
        }),
      }),
    );
    await screen.rerender(control());

    const california = screen.find("#map-regions-retire-california");
    if (california) await screen.click(california);

    expect(screen.text()).toContain(
      "Tick at least one branch, or turn the retirement off",
    );
    expect(screen.button("Retire")).toBeNull();
    await screen.unmount();
  });

  it("says plainly when the rehearsal found no place-named topics", async () => {
    const screen = await render(control());
    await turnOnRetirement(screen);
    jest.mocked(useMapRegionsRun).mockReturnValue(
      regionsHandle({
        run,
        result: mapRegionsResult({ dry_run: true, geography_branches: [] }),
      }),
    );
    await screen.rerender(control());

    expect(screen.text()).toContain(
      "The rehearsal found no place-named topics on this map",
    );
    await screen.unmount();
  });
});

describe("the ordinary region pass", () => {
  it("offers Start with no retirement asked for", async () => {
    const screen = await render(control());
    const start = screen.button("Find the regions");
    expect(start).not.toBeNull();
    // The trigger reads the same words, so the LAST match is the Start below it.
    const buttons = Array.from(
      screen.container.querySelectorAll("button"),
    ).filter((node) => (node.textContent ?? "").includes("Find the regions"));
    await screen.click(buttons[buttons.length - 1]);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        deriveValues: true,
        bindPages: true,
        dryRun: false,
      }),
    );
    // Nothing about retirement rides along when it was not asked for.
    expect(run.mock.calls[0]?.[0]).not.toHaveProperty("geographyTopicSlugs");
    await screen.unmount();
  });

  it("renders a held-back candidate's reason verbatim", async () => {
    jest.mocked(useMapRegionsRun).mockReturnValue(
      regionsHandle({
        run,
        result: mapRegionsResult({
          dry_run: false,
          values_held_back: [
            {
              name: "Fresno",
              held_back_because:
                "One page names it. Two would clear region_min_pages_per_value.",
            },
          ],
        }),
      }),
    );
    const screen = await render(control());
    expect(screen.text()).toContain(
      "One page names it. Two would clear region_min_pages_per_value.",
    );
    await screen.unmount();
  });

  it("says the server gave no reason rather than printing an empty held-back row", async () => {
    jest.mocked(useMapRegionsRun).mockReturnValue(
      regionsHandle({
        run,
        result: mapRegionsResult({
          dry_run: false,
          values_held_back: [{ slug: "fresno" }],
        }),
      }),
    );
    const screen = await render(control());
    const text = screen.text();
    expect(text).toContain("fresno");
    expect(text).toContain("the server did not say why");
    await screen.unmount();
  });
});
