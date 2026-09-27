/**
 * 🚨 D343 — THE CONSOLE'S LINK AND THE LIBRARIES LIST MUST BE ONE QUERY.
 *
 * The Acquisition Console walk (2026-09-20) landed on `/libraries` from the
 * "Gmail export" row and got all 33 Libraries: the anchor was bare and the
 * destination read no filter. The server half landed in aidream `d7093434f6`
 * (contract 0.6.0: `visibility`, `adapter` and `q` declared, `total` counts
 * the filtered set).
 *
 * 2026-09-27 (KNOWLEDGE-HUB §6, H6b): the Libraries LIST retired into the
 * Knowledge hub's Libraries group (`/knowledge?view=group:media_source_library`).
 * This file walks the same WHOLE path through the new destination:
 *
 *     console row → href → hub URL state → the wire request
 *
 * plus D10's law (each lane's count asked under the same narrowing, never
 * derived from an unfiltered call): every case fails if the link stops
 * carrying the filter, the hub stops reading it, or the request stops sending it.
 */

import { hubStateFromParams } from "@/features/knowledge/hub/hubState";
import {
  laneCountRequests,
  libraryListRequest,
} from "@/features/knowledge/hub/containerGroups/groupFilters";
import { librariesToHubHref } from "@/features/knowledge/hub/legacyRoutes";
import {
  librariesHref,
  rollUpLibraries,
  type LibraryFacts,
} from "@/features/acquisition-console/contract";

const stateOf = (href: string) => hubStateFromParams(new URL(href, "https://x").searchParams);

describe("the console's Libraries row addresses one kind of Library", () => {
  it("lands on the hub's Libraries group with the adapter", () => {
    const href = librariesHref("gmail_mbox", "internal");
    const s = stateOf(href);
    expect(new URL(href, "https://x").pathname).toBe("/knowledge");
    expect(s.view).toEqual({ kind: "group", token: "media_source_library" });
    expect(s.group).toEqual({ lane: "orgs", adapter: "gmail_mbox" });
  });

  it("maps every console lane to the lane the row actually carries", () => {
    for (const [lane, expected] of [
      ["personal", "mine"],
      ["shared-with-you", "mine"],
      ["internal", "orgs"],
      ["link", "shared"],
      ["public", "public"],
    ] as const) {
      const g = stateOf(librariesHref("youtube", lane)).group;
      expect(g.lane ?? "mine").toBe(expected);
    }
  });

  it("the console link and a typed old /libraries address are the same state", () => {
    const typed = librariesToHubHref({
      scope: "orgs",
      filters: JSON.stringify({ adapter: { kind: "select", values: ["gmail_mbox"] } }),
    });
    expect(stateOf(typed)).toEqual(stateOf(librariesHref("gmail_mbox", "internal")));
  });
});

describe("every 'What we have' Library row carries that address", () => {
  const shelf: LibraryFacts[] = [
    { id: "a", adapter: "gmail_mbox", name: "Takeout-gmail-10000.mbox", itemCount: 10_000, lastTouchedAt: "2026-09-19T00:00:00Z", transcriptsReady: null, exportItems: 10_000, visibility: "personal", createdBy: "me" },
    { id: "b", adapter: "gmail_mbox", name: "fresh-10k.mbox", itemCount: 10_000, lastTouchedAt: "2026-09-20T00:00:00Z", transcriptsReady: null, exportItems: 10_000, visibility: "personal", createdBy: "me" },
    { id: "c", adapter: "youtube", name: "Darknet Diaries", itemCount: 150, lastTouchedAt: "2026-09-18T00:00:00Z", transcriptsReady: 12, exportItems: null, visibility: "internal", createdBy: "someone-else" },
  ];

  it("gives each grouped row a door to its own kind, never a bare list", () => {
    const rows = rollUpLibraries(shelf, "me");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.href).not.toBe("/libraries");
      expect(stateOf(row.href).group.adapter).toBeTruthy();
    }
    expect(rows.find((r) => r.id === "library:gmail_mbox::personal")?.href).toBe(librariesHref("gmail_mbox", "personal"));
    expect(rows.find((r) => r.id === "library:youtube::internal")?.href).toBe(librariesHref("youtube", "internal"));
  });
});

describe("the query reaches the wire, and each lane is counted under it", () => {
  it("sends the lane, the adapter and the words in the box", () => {
    const g = { ...stateOf(librariesHref("gmail_mbox", "personal")).group, q: "takeout" };
    expect(libraryListRequest(g, { limit: 50, offset: 0 })).toEqual({
      visibility: ["personal"],
      adapter: ["gmail_mbox"],
      q: "takeout",
      limit: 50,
      offset: 0,
    });
  });

  it("sends no adapter and no words when nothing is filtered", () => {
    const req = libraryListRequest({}, { limit: 50, offset: 0 });
    expect(req).not.toHaveProperty("adapter");
    expect(req).not.toHaveProperty("q");
    expect(req.visibility).toEqual(["personal"]);
  });

  it("passes an adapter this build has never heard of straight to the server", () => {
    const g = stateOf(librariesHref("kindle_clippings", "personal")).group;
    expect(libraryListRequest(g, { limit: 50, offset: 0 }).adapter).toEqual(["kindle_clippings"]);
  });

  it("D10: counts each lane with its own visibility and the SAME narrowing", () => {
    const g = { ...stateOf(librariesHref("gmail_mbox", "personal")).group, q: "takeout" };
    const reqs = laneCountRequests(g);
    expect(reqs).toHaveLength(4);
    for (const { request } of reqs) expect(request).toMatchObject({ adapter: ["gmail_mbox"], q: "takeout", limit: 1 });
    expect(reqs.map((r) => r.request.visibility[0]).sort()).toEqual(["internal", "link", "personal", "public"]);
  });
});
