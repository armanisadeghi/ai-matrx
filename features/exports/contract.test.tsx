/**
 * THE GUARD for the 2026-09-17 `/exports` outage.
 *
 * WHAT BROKE. Production's `GET /media/export-adapters` answered with
 * `recognised_not_readable` as a LIST of `{label, block}` objects instead of a
 * count (the server's `accept_summary()` published a key the router also
 * publishes as a count, and the `**` spread replaced it). `features/exports`
 * asserted the response with a generic type parameter, never checked it, and
 * `AdapterCatalog` put that value into a JSX child position — so React threw
 * "Objects are not valid as a React child (found: object with keys {label,
 * block})" and `/exports` fell to the global error boundary on EVERY load,
 * 6/6 reproductions, desktop and mobile, light and dark.
 *
 * WHY THIS TEST CANNOT GO GREEN ON A LIE (`forcing-function-tests`):
 *   • The payload is not written by hand. It is the VERBATIM bytes production
 *     returned on 2026-09-17, captured off the wire and checked in at
 *     `__fixtures__/live-export-adapters-2026-09-17.json`. Nobody can make this
 *     test pass by adjusting the input to suit the code.
 *   • The transport is the only thing stubbed. The real `fetchExportAdapters`,
 *     the real `parseAdapterCatalog`, the real `AdapterCatalog` component and
 *     the real React DOM renderer all run — so this fails exactly when a person
 *     loading `/exports` would see the crash, and for the same reason.
 *   • It was proven failing before the fix: with `api.ts` returning the raw body
 *     and `AdapterCatalog` rendering `catalog.recognised_not_readable`, the
 *     first test below dies with the exact React message quoted above.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import LIVE_PAYLOAD from "./__fixtures__/live-export-adapters-2026-09-17.json";

const getJson = jest.fn();

jest.mock("@/lib/python-client", () => ({
  getJson: (...args: unknown[]) => getJson(...args),
  postJson: jest.fn(),
  postNdjson: jest.fn(),
}));

// Imported AFTER the transport mock so the real module graph binds to it.
import { AdapterCatalog } from "./components/AdapterCatalog";
import { fetchExportAdapters } from "./api";
import { parseAdapterCatalog, parseExportItemsResponse, parseExportLibrary } from "./contract";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  getJson.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mountCatalog(): Promise<void> {
  await act(async () => {
    root.render(<AdapterCatalog />);
  });
  // Let the fetch effect settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("the /exports screen against the bytes production actually sent", () => {
  it("renders the list of formats instead of crashing on a count that is a list", async () => {
    getJson.mockResolvedValue({ data: LIVE_PAYLOAD });

    await mountCatalog();

    // The screen is up: real adapter labels from the live payload are on it.
    expect(container.textContent).toContain("Google Takeout");
    expect(container.textContent).toContain("Outlook mailbox (.pst / .ost)");
    // And the object that used to reach React as a child is nowhere in the DOM.
    expect(container.textContent).not.toContain("[object Object]");
  });

  it("says out loud that it worked the count out itself, and never pretends", async () => {
    getJson.mockResolvedValue({ data: LIVE_PAYLOAD });

    await mountCatalog();

    expect(container.textContent).toContain("recognised_not_readable");
    expect(container.textContent).toContain("worked it out from the list");
  });

  it("counts the blocked formats correctly from the adapters themselves", async () => {
    getJson.mockResolvedValue({ data: LIVE_PAYLOAD });

    const parsed = await fetchExportAdapters();
    const blocked = LIVE_PAYLOAD.adapters.filter((a) => !a.implemented).length;
    const readable = LIVE_PAYLOAD.adapters.length - blocked;

    expect(typeof parsed.value.recognised_not_readable).toBe("number");
    expect(parsed.value.recognised_not_readable).toBe(blocked);
    expect(parsed.value.readable).toBe(readable);
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0]).toContain("recognised_not_readable");
  });

  it("proves the raw payload really is the crash — the guard is not guarding nothing", () => {
    // The unparsed field is what React choked on. If this ever stops being an
    // array of objects, the outage it guards is gone and so is this test's
    // reason to exist — it must be updated deliberately, not silently.
    const raw = (LIVE_PAYLOAD as unknown as Record<string, unknown>)
      .recognised_not_readable;
    expect(Array.isArray(raw)).toBe(true);
    expect(Object.keys((raw as unknown[])[0] as object).sort()).toEqual([
      "block",
      "label",
    ]);
  });
});

describe("every value the screen renders has been checked, not assumed", () => {
  /**
   * 🚨 CLASS FIX, 2026-09-18. This used to assert `parseAdapterCatalog`
   * THROWS when one adapter row is unreadable — the exact all-or-nothing bug
   * `mapListRows` (`lib/contract/narrow.ts`) exists to close, the sibling of
   * the one that blanked the Jobs panel in `features/source-library` (see
   * commit 509e2bffb5). One unreadable row must drop and name itself in
   * `problems`, never take its neighbors with it.
   */
  it("drops one unreadable adapter and names it, but keeps every adapter that reads fine", () => {
    const parsed = parseAdapterCatalog({
      adapters: [
        { key: "google_takeout", label: "Google Takeout", accepts: ".zip", implemented: true },
        { key: "x", label: { a: 1 }, accepts: ".pst", implemented: false },
        { key: "imessage", label: "iMessage", accepts: ".db", implemented: true },
      ],
    });

    // The two good siblings survived the one broken row between them.
    expect(parsed.value.adapters.map((a) => a.key)).toEqual([
      "google_takeout",
      "imessage",
    ]);

    // The broken row is named, not silently dropped and not thrown.
    const rowProblem = parsed.problems.find((p) => p.includes("adapters[1]"));
    expect(rowProblem).toBeDefined();
    expect(rowProblem).toContain("adapters[1].label");
    expect(rowProblem).toContain("should be text");
    expect(rowProblem).toContain("an object with keys {a}");
  });

  it("shows the honest sentence on the screen when the list itself is unreadable", async () => {
    getJson.mockResolvedValue({ data: { adapters: "not a list" } });

    await mountCatalog();

    expect(container.textContent).toContain("could not be read");
    expect(container.textContent).toContain("adapters");
    // The drop zone is a sibling and must survive: this component says its own
    // part is unavailable rather than taking the page down.
    expect(container.textContent).toContain("Dropping a file still works");
  });
});

describe("the Library read, against the envelope the server actually sends", () => {
  it("reads the row out of `{library: {…}}` instead of showing an empty card", () => {
    // Verbatim shape of `GET /media/exports/{id}` (aidream read_export).
    const library = parseExportLibrary({
      library: {
        id: "d2df57ed-ea50-4e59-aa68-64fdc6dd4247",
        name: "takeout-10k.mbox",
        adapter: "gmail_mbox",
        adapter_label: "Gmail / mail archive (.mbox)",
        sync_status: "completed",
        item_count: 10000,
        organization_id: "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f",
        visibility: "personal",
      },
    });

    // THE FAILING HALF: reading the envelope as the row made every field
    // undefined and the screen said "the export.id ... arrived as nothing at
    // all" over a Library that had just indexed perfectly.
    expect(library.id).toBe("d2df57ed-ea50-4e59-aa68-64fdc6dd4247");
    expect(library.name).toBe("takeout-10k.mbox");
    expect(library.total_items).toBe(10000);
    expect(library.status).toBe("completed");
  });

  it("still reads a bare row, which is what the contract publishes", () => {
    const library = parseExportLibrary({ id: "abc", name: "x.mbox" });
    expect(library.id).toBe("abc");
  });

  it("does not mistake a row that happens to carry a `library` string", () => {
    const library = parseExportLibrary({ id: "abc", name: "x", library: "not-an-object" });
    expect(library.id).toBe("abc");
  });
});

describe("a finished export is recognised as finished", () => {
  const METRICS = {
    total_items: 10000,
    counts_by_kind: { message: 10000 },
    counts_by_direction: { outbound: 3941, inbound: 6059 },
    counts_by_label: {},
    top_containers: [],
    date_range: { earliest: "2021-01-01", latest: "2021-11-12", span_days: 315 },
    top_correspondents: [{ key: "dana", label: "Dana Okafor", count: 812 }],
    total_chars: 1200000,
    total_words: 210000,
    with_attachments: 355,
    owner_identity: "me@example.com",
    owner_identity_basis: "the address that sent the most messages",
    warnings: [],
  };

  it("reads the summary the server publishes as `metrics`", () => {
    const library = parseExportLibrary({
      library: { id: "lib-1", name: "takeout.mbox", metrics: METRICS },
    });

    // THE FAILING HALF: reading only `summary` left this null, so the page
    // thought the export was un-indexed and re-ran the index on EVERY mount —
    // which is how a person re-opening their own export met
    // `library_item_library_external_uniq` on screen.
    expect(library.summary).not.toBeNull();
    expect(library.summary?.total_items).toBe(10000);
    expect(library.summary?.owner_identity).toBe("me@example.com");
  });

  it("treats an empty `metrics` as not-yet-indexed, never as a summary of zero", () => {
    const library = parseExportLibrary({ library: { id: "lib-1", name: "x", metrics: {} } });
    expect(library.summary).toBeNull();
  });

  it("prefers an explicit `summary` when the server ever sends one", () => {
    const library = parseExportLibrary({
      library: {
        id: "lib-1",
        name: "x",
        summary: { ...METRICS, total_items: 7 },
        metrics: METRICS,
      },
    });
    expect(library.summary?.total_items).toBe(7);
  });
});

describe("the items list, against the same class of defect (2026-09-18)", () => {
  /**
   * 🚨 THE SIBLING OF THE JOBS-PANEL FIX. `features/source-library`'s Jobs
   * lane blanked entirely when one job row failed narrowing (commit
   * 509e2bffb5, `mapListRows` in `lib/contract/narrow.ts`). `parseExportItemsResponse`
   * had the identical `.map(parseExportItem)` shape — one bad item in a
   * 20,000-row Google Takeout would have blanked the whole items list.
   *
   * PROVEN FAILING BEFORE THE FIX: with the old `arr(root.items, "items").map(...)`,
   * this exact payload throws `ExportContractError` out of
   * `parseExportItemsResponse` and neither good item is ever returned.
   */
  it("keeps two good items when one sibling item is unreadable", () => {
    const response = parseExportItemsResponse({
      items: [
        {
          id: "item-1",
          kind: "email",
          direction: "inbound",
          char_count: 100,
          word_count: 20,
          attachment_count: 0,
        },
        // Broken: `direction` is a number where the contract requires text.
        { id: "item-2", kind: "email", direction: 4, char_count: 1, word_count: 1, attachment_count: 0 },
        {
          id: "item-3",
          kind: "email",
          direction: "outbound",
          char_count: 50,
          word_count: 9,
          attachment_count: 1,
        },
      ],
      total: 3,
      filtered_total: 3,
      limit: 100,
      offset: 0,
    });

    expect(response.items.map((item) => item.id)).toEqual(["item-1", "item-3"]);
    const rowProblem = response.row_problems.find((p) => p.includes("items[1]"));
    expect(rowProblem).toBeDefined();
    expect(rowProblem).toContain("items[1].direction");
    expect(rowProblem).toContain("should be text");
  });

  it("drops one unreadable recipient without losing the item or its other recipients", () => {
    const response = parseExportItemsResponse({
      items: [
        {
          id: "item-1",
          kind: "email",
          direction: "outbound",
          char_count: 10,
          word_count: 2,
          attachment_count: 0,
          recipients: [
            { name: "Good One", email: "good1@example.com" },
            // Broken: a recipient entry that is not an object at all.
            "not-a-party",
            { name: "Good Two", email: "good2@example.com" },
          ],
        },
      ],
      total: 1,
      filtered_total: 1,
      limit: 100,
      offset: 0,
    });

    expect(response.items).toHaveLength(1);
    expect(response.items[0].recipients.map((r) => r.name)).toEqual([
      "Good One",
      "Good Two",
    ]);
    const rowProblem = response.row_problems.find((p) =>
      p.includes("items[0].recipients[1]"),
    );
    expect(rowProblem).toBeDefined();
  });
});
