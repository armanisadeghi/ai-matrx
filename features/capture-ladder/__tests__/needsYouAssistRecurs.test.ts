/**
 * THE ONE-SHOT-NOTICE GUARD.
 *
 * This producer's dedupe key is stable per workspace, and it RESOLVES its own
 * row every time the queue empties. Combine that with the ledger's usual
 * "anything not pending is decided" gate and the notice fires exactly ONCE per
 * workspace, for ever: the first successful capture resolves the row, the key
 * reads as decided, and from then on pages pile up in silence. A queue that
 * goes quiet after working once is worse than one that never worked.
 *
 * So the rule this binds is: **a person's dismissal is durable; the system
 * resolving its own row is not a decision at all.**
 *
 * RED: point the producer back at `filterUndecidedKeys` (the blanket gate) and
 * "comes back after the work is finished" fails.
 */

import { produceNeedsYouAssist } from "@/features/capture-ladder/needsYouAssist";
import type { CaptureHandoff } from "@/features/capture-ladder/types";

const emitted: unknown[] = [];
const resolved: string[][] = [];
/** Keys the person DISMISSED. The mock honours the real function's contract. */
let silencedByAPerson = new Set<string>();

jest.mock("@/features/assists/service", () => ({
  filterKeysNotSilencedByAPerson: jest.fn(async (keys: string[]) =>
    keys.filter((k) => !silencedByAPerson.has(k)),
  ),
  resolveAssistsByDedupeKeys: jest.fn(async (keys: string[]) => {
    resolved.push(keys);
    return keys.length;
  }),
}));

jest.mock("@/features/assists/redux/emitTracked", () => ({
  emitAssistTracked: jest.fn(async (_userId: string, input: unknown) => {
    emitted.push(input);
    return "assist-id";
  }),
}));

jest.mock("@/lib/extension-bridge/handToOwnBrowser", () => ({
  hasOwnBrowserExtension: jest.fn(async () => true),
}));

const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const USER = "87a6e699-3622-4869-8843-d0867456c0dd";

function handoff(id: string, url: string): CaptureHandoff {
  return {
    id,
    organization_id: ORG,
    url,
    title: "",
    rung: "own_browser",
    status: "waiting",
    handoff_kind: "web_page",
    reason: "login_wall",
    reason_note: "",
    what_to_do: "",
    estimated_seconds: null,
    rung_trail: [],
    batch_id: null,
    library_id: null,
    claimed_by: null,
    claimed_at: null,
    claim_expires_at: null,
    attempt_count: 0,
    captured_item_id: null,
    captured_chars: null,
    captured_at: null,
    captured_by_rung: null,
    final_url: null,
    failure_note: null,
    created_by: USER,
    updated_by: null,
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
    deleted_at: null,
    version: 1,
    metadata: {},
    custom_fields: {},
  };
}

const dispatch = (() => undefined) as never;

describe("the waiting-for-your-browser notice recurs", () => {
  beforeEach(() => {
    emitted.length = 0;
    resolved.length = 0;
    silencedByAPerson = new Set();
  });

  it("resolves its own row the moment the queue empties", async () => {
    const outcome = await produceNeedsYouAssist({
      userId: USER,
      organizationId: ORG,
      handoffs: [],
      dispatch,
    });
    expect(outcome).toBe("resolved");
    expect(resolved[0]?.[0]).toContain(ORG);
    expect(emitted).toHaveLength(0);
  });

  it("comes back the next time pages are queued, after the work was finished", async () => {
    // Episode one: queued, then captured, so the producer resolved its own row.
    await produceNeedsYouAssist({
      userId: USER,
      organizationId: ORG,
      handoffs: [handoff("a", "https://www.facebook.com/nasa")],
      dispatch,
    });
    await produceNeedsYouAssist({
      userId: USER,
      organizationId: ORG,
      handoffs: [],
      dispatch,
    });
    expect(emitted).toHaveLength(1);

    // Episode two: a new page is queued. The person was never asked anything,
    // so there is nothing to honour — they must be told.
    const outcome = await produceNeedsYouAssist({
      userId: USER,
      organizationId: ORG,
      handoffs: [handoff("b", "https://www.instagram.com/nasa/")],
      dispatch,
    });
    expect(outcome).toBe("emitted");
    expect(emitted).toHaveLength(2);
  });

  it("comes back after the person PRESSED the button — accepting is not 'never again'", async () => {
    const first = await produceNeedsYouAssist({
      userId: USER,
      organizationId: ORG,
      handoffs: [handoff("a", "https://www.facebook.com/nasa")],
      dispatch,
    });
    expect(first).toBe("emitted");

    // `accepted` is what the ledger holds after a click. It is the person
    // saying "I did this one", never "stop telling me". Two real workspaces
    // reached exactly this state minutes after the feature went live.
    const second = await produceNeedsYouAssist({
      userId: USER,
      organizationId: ORG,
      handoffs: [handoff("b", "https://www.instagram.com/nasa/")],
      dispatch,
    });
    expect(second).toBe("emitted");
    expect(emitted).toHaveLength(2);
  });

  it("stays gone once the PERSON dismissed it for good", async () => {
    const first = await produceNeedsYouAssist({
      userId: USER,
      organizationId: ORG,
      handoffs: [handoff("a", "https://www.facebook.com/nasa")],
      dispatch,
    });
    expect(first).toBe("emitted");

    // What "Dismiss for good" writes.
    silencedByAPerson.add(
      (emitted[0] as { dedupeKey: string }).dedupeKey,
    );

    const second = await produceNeedsYouAssist({
      userId: USER,
      organizationId: ORG,
      handoffs: [handoff("b", "https://www.instagram.com/nasa/")],
      dispatch,
    });
    expect(second).toBe("skipped");
    expect(emitted).toHaveLength(1);
  });
});
