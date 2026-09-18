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
import { ExportContractError, parseAdapterCatalog } from "./contract";

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
  it("refuses a payload whose adapters are not adapters, with a sentence", () => {
    expect(() =>
      parseAdapterCatalog({ adapters: [{ key: "x", label: { a: 1 } }] }),
    ).toThrow(ExportContractError);

    try {
      parseAdapterCatalog({ adapters: [{ key: "x", label: { a: 1 } }] });
      throw new Error("the parser accepted an object where text was promised");
    } catch (error) {
      expect(error).toBeInstanceOf(ExportContractError);
      const message = (error as ExportContractError).message;
      // A person reads this. It names the field and what arrived — no stack,
      // no "something went wrong", no silent empty screen.
      expect(message).toContain("adapters[0].label");
      expect(message).toContain("should be text");
      expect(message).toContain("an object with keys {a}");
    }
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
