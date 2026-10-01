/**
 * THE EXPLORER'S ONE NAME BOOK (lane DRILL-D1; drillNames.ts): each id asked once across every
 * surface, batched; a failed or throwing read ends in the resolver's plain words, never a loading
 * state; the door's own labels are kept and never re-asked. The whole-explorer proof (Findings rows
 * named) is drill-names-one-book.test.tsx.
 */
import { createDrillNameBook, DRILL_NAME_UNREAD } from "../drillNames";
describe("the name book itself", () => {
  it("asks each id once across every surface, batched in one read per Dimension", async () => {
    const calls: string[][] = [];
    const book = createDrillNameBook({ person: { resolve: async (ids) => (calls.push(ids), { ok: true as const, names: Object.fromEntries(ids.map((i) => [i, `${i}@acme-recycling.com`])) }) } });
    // the answer, the findings and the chart put the same person on screen in one tick
    await Promise.all([book.want("person", ["ana", "ben"]), book.readRows([{ groups: { person: "ben" } }, { groups: { person: "cy" } }]), book.want("person", ["ana"])]);
    expect(calls).toEqual([["ana", "ben", "cy"]]);
    await book.want("person", ["ana", "cy"]);
    expect(calls).toHaveLength(1);
    expect(book.names().person).toEqual({ ana: "ana@acme-recycling.com", ben: "ben@acme-recycling.com", cy: "cy@acme-recycling.com" });
  });

  it("a failed or throwing read ends in the resolver's plain words, and its message is handed back", async () => {
    const book = createDrillNameBook({
      request: { unreadLabel: "A request whose details could not be read", resolve: async () => ({ ok: false as const, message: "The names door timed out." }) },
      session: { resolve: async () => { throw new Error("network down"); } },
    });
    await expect(book.want("request", ["r1"])).resolves.toBe("The names door timed out.");
    await expect(book.want("session", ["s1"])).resolves.toBe("network down");
    expect(book.names()).toEqual({ request: { r1: "A request whose details could not be read" }, session: { s1: DRILL_NAME_UNREAD } });
  });

  it("keeps the door's own labels and never asks the resolver for an id the door named", async () => {
    const resolve = jest.fn(async (ids: string[]) => ({ ok: true as const, names: Object.fromEntries(ids.map((i) => [i, "x"])) }));
    const book = createDrillNameBook({ agent: { resolve } });
    await book.readRows([{ groups: { agent: "a1", conversation: "c1" }, labels: { agent: "Vendor intake agent", conversation: "Quarterly vendor review" } }]);
    expect(resolve).not.toHaveBeenCalled();
    expect(book.names()).toEqual({ agent: { a1: "Vendor intake agent" }, conversation: { c1: "Quarterly vendor review" } });
  });
});
