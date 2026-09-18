// features/marketing/seo/topical-map/views/pages/__tests__/runs-propose-intents.test.tsx
//
// WHAT REACHES `run()`, AND WHAT THE ANSWER IS ALLOWED TO HIDE.
//
// 1. `dryRun` IS FIRST-CLASS. A rehearsal proposes nothing and still costs a
//    model call per batch, so the switch has to arrive at the wire as
//    `{ dryRun: true }` — not as a filter applied to the answer, and not
//    dropped because the body builder omits falsy fields.
// 2. THE TOPIC RESTRICTION IS PREFILLED FROM THE WORKSPACE'S OWN FILTER. A
//    person who has narrowed the page list to one topic and then opens this
//    means that topic; an empty `topic_slugs` array would read on the server as
//    "restrict this pass to NO topics" — a claim spent proposing nothing — so
//    an unchosen picker omits the field entirely.
// 3. THE `downgraded_*` NUMBERS ARE THE PROMPT'S REPORT CARD. Each counts a
//    code-side correction of the agent's answer, and a screen that hides them
//    hides the only signal saying whether the agent is trusted or policed.

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
jest.mock("../../../hooks", () => ({ useMapTopicSearch: jest.fn() }));
jest.mock("../../../useProposeIntentsRun", () => ({
  useProposeIntentsRun: jest.fn(),
}));

const mockPageFilters = {
  text: "",
  topicSlug: null as string | null,
  regionSlug: null,
  traffic: "all",
  disposition: null,
  state: null,
  source: null,
  onNoTopic: false,
};
jest.mock("@/lib/redux/hooks", () => ({
  // The one thing this control reads from the store.
  useAppSelector: () => mockPageFilters,
  useAppDispatch: () => jest.fn(),
}));

import type { ProposeIntentsInput } from "../../../map-intents";
import { useMapTopicSearch } from "../../../hooks";
import { useProposeIntentsRun } from "../../../useProposeIntentsRun";
import { ProposeIntentsRunControl } from "../runs/ProposeIntentsRunControl";
import {
  context,
  intentsHandle,
  proposeIntentsResult,
  query,
  render,
  type Screen,
} from "./runs-harness";

function control() {
  return (
    <ProposeIntentsRunControl
      context={context()}
      siteId="site-1"
      onChooseSite={jest.fn()}
    />
  );
}

/** The Start button, which is the only control whose words change with dryRun. */
function start(screen: Screen): HTMLButtonElement | null {
  const buttons = Array.from(
    screen.container.querySelectorAll("button"),
  ).filter((node) =>
    (node.textContent ?? "").includes("Propose destinations"),
  );
  // The trigger reads the same words; the Start sits below it.
  return buttons.length > 1 ? buttons[buttons.length - 1] : null;
}

let run: jest.Mock<Promise<void>, [ProposeIntentsInput?]>;

beforeEach(() => {
  jest.clearAllMocks();
  mockPageFilters.topicSlug = null;
  run = jest.fn(async () => undefined);
  jest.mocked(useProposeIntentsRun).mockReturnValue(intentsHandle({ run }));
  jest.mocked(useMapTopicSearch).mockReturnValue(query("success", []));
});

describe("what reaches run()", () => {
  it("sends dryRun: true when the rehearsal switch is on", async () => {
    const screen = await render(control());
    const toggle = screen.find("#propose-intents-dry-run");
    expect(toggle).not.toBeNull();
    if (toggle) await screen.click(toggle);

    const rehearse = screen.button("Rehearse it");
    expect(rehearse).not.toBeNull();
    if (rehearse) await screen.click(rehearse);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    );
    await screen.unmount();
  });

  it("sends dryRun: false — never nothing — when it is off", async () => {
    const screen = await render(control());
    const button = start(screen);
    expect(button).not.toBeNull();
    if (button) await screen.click(button);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }));
    await screen.unmount();
  });

  it("omits topicSlugs entirely when no topic was chosen", async () => {
    const screen = await render(control());
    const button = start(screen);
    if (button) await screen.click(button);
    expect(run.mock.calls[0]?.[0]).not.toHaveProperty("topicSlugs");
    await screen.unmount();
  });

  it("prefills the workspace's own topic filter and sends it", async () => {
    mockPageFilters.topicSlug = "roof-repair";
    const screen = await render(control());
    expect(screen.text()).toContain("roof-repair");
    expect(screen.text()).toContain("under 1 topic(s)");

    const button = start(screen);
    if (button) await screen.click(button);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ topicSlugs: ["roof-repair"] }),
    );
    await screen.unmount();
  });

  it("lets the prefilled topic be removed again", async () => {
    mockPageFilters.topicSlug = "roof-repair";
    const screen = await render(control());
    const chip = screen.container.querySelector(
      'button[aria-label="Remove roof-repair"]',
    );
    expect(chip).not.toBeNull();
    if (chip) await screen.click(chip);

    const button = start(screen);
    if (button) await screen.click(button);
    expect(run.mock.calls[0]?.[0]).not.toHaveProperty("topicSlugs");
    await screen.unmount();
  });
});

describe("the consequence sentence", () => {
  it("says these are PROPOSALS a person accepts, and names the spend", async () => {
    const screen = await render(control());
    const text = screen.text();
    expect(text).toContain("write PROPOSED intents");
    expect(text).toContain("a person accepts them in the review deck");
    // 1000 = intent_daily_page_ceiling; 20 = intent_batch_size.
    expect(text).toContain("up to 1000 (the daily ceiling knob)");
    expect(text).toContain("one model call per batch of 20");
    expect(text).toContain("cost is unmeasured until the usage-ledger reader lands");
    expect(text).toContain("Pages a person already decided are kept");
    await screen.unmount();
  });
});

describe("the result summary", () => {
  it("shows the corrections applied to the agent rather than hiding them", async () => {
    jest.mocked(useProposeIntentsRun).mockReturnValue(
      intentsHandle({
        run,
        result: proposeIntentsResult({
          downgraded_low_confidence: 7,
          downgraded_self_destination: 2,
        }),
      }),
    );
    const screen = await render(control());
    const text = screen.text();
    expect(text).toContain("Corrections applied to the agent");
    expect(text).toContain("7 · confidence too low");
    expect(text).toContain("2 · it sent a page to itself");
    await screen.unmount();
  });

  it("reads the dispositions and the kept pages as answers", async () => {
    jest.mocked(useProposeIntentsRun).mockReturnValue(
      intentsHandle({ run, result: proposeIntentsResult() }),
    );
    const screen = await render(control());
    const text = screen.text();
    expect(text).toContain("keep 300 · redirect 41 · merge 21");
    expect(text).toContain(
      "12 kept — a higher source already holds the page’s destination",
    );
    expect(text).toContain("5 left alone — a person already decided them");
    expect(text).not.toMatch(/kept.{0,20}fail/i);
    await screen.unmount();
  });
});
