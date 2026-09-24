// The one address every feature mints for an id, and the strict reading of the door's answer.
// Door + seat proof: scripts/campaign-tests/openbyid_green.sql (lane ROUTE-RESOLVER).

import { OPEN_BY_ID_PREFIX, openPath } from "@/lib/deep-link/openPath";
import { isResolvableId, readResolvedId, readSide } from "@/lib/deep-link/resolveId";
import manifest from "@/lib/route-manifest/manifest.generated.json";

const ID = "3c1f6f0e-2a4b-4d8e-9f10-5b6c7d8e9f01";

describe("openPath — the one link for any id", () => {
  it("names the id and nothing else", () => {
    expect(openPath(ID)).toBe(`/o/${ID}`);
    expect(OPEN_BY_ID_PREFIX).toBe("/o");
  });

  it("asks for one side of a table only when told to", () => {
    expect(openPath(ID, { side: "old" })).toBe(`/o/${ID}?side=old`);
    expect(openPath(ID, { side: "new" })).toBe(`/o/${ID}?side=new`);
  });

  it("carries a malformed id verbatim for the page to refuse in words, never somewhere else", () => {
    expect(openPath(" a/b ")).toBe("/o/a%2Fb");
  });

  it("is a live route in the checked-in manifest the notification spine trusts", () => {
    const routes = (manifest as { routes: Array<{ pattern: string; status: string }> }).routes;
    expect(routes.find((r) => r.pattern === "/o/[id]")?.status).toBe("live");
  });
});

describe("readResolvedId — the door's answer, read strictly", () => {
  it("opens exactly the path the door gave", () => {
    expect(
      readResolvedId({
        state: "opens",
        kind: "record",
        organization_id: "org-1",
        path: `/data-v2/t?record=${ID}&org=org-1`,
      }),
    ).toEqual({ state: "opens", kind: "record", organizationId: "org-1", path: `/data-v2/t?record=${ID}&org=org-1` });
  });

  it("keeps the two sides a table answer carries", () => {
    const read = readResolvedId({ state: "opens", kind: "table", organization_id: "o", path: "/data-v2/x?org=o", sides: { old: true, new: true } });
    expect(read).toMatchObject({ state: "opens", sides: { old: true, new: true } });
  });

  it.each(["https://elsewhere.example/x", "//elsewhere.example/x", "", null])(
    "never turns an answer into a redirect off this site (%s)",
    (path) => {
      expect(readResolvedId({ state: "opens", kind: "table", organization_id: "o", path }).state).toBe("unknown");
    },
  );

  it("says not-yours in the door's own words", () => {
    expect(readResolvedId({ state: "not_yours", says: "This link does not open anything for you." })).toEqual({
      state: "not_yours",
      says: "This link does not open anything for you.",
    });
  });

  it("reads archived, screenless and missing-side answers", () => {
    expect(readResolvedId({ state: "in_trash", kind: "table", organization_id: "o", says: "Archived." }).state).toBe("in_trash");
    expect(readResolvedId({ state: "no_screen", kind: "table_part", organization_id: "o", says: "A column." }).state).toBe("no_screen");
    expect(
      readResolvedId({ state: "no_such_side", kind: "table", organization_id: "o", sides: { old: true, new: false }, says: "No new side." }),
    ).toMatchObject({ state: "no_such_side", sides: { old: true, new: false } });
  });

  it.each([null, [], "opens", { state: "teleport" }, { state: "not_yours" }, { state: "in_trash", kind: "t" }])(
    "is honest about an answer it cannot read (%p) — unknown, never not-yours",
    (data) => {
      expect(readResolvedId(data).state).toBe("unknown");
    },
  );
});

describe("the address's own inputs", () => {
  it("only asks the door about a real id", () => {
    expect(isResolvableId(ID)).toBe(true);
    expect(isResolvableId(ID.toUpperCase())).toBe(true);
    expect(isResolvableId("chat")).toBe(false);
    expect(isResolvableId(`${ID}x`)).toBe(false);
  });

  it("passes any side word through for the door to judge", () => {
    expect(readSide(undefined)).toBeUndefined();
    expect(readSide(" ")).toBeUndefined();
    expect(readSide("OLD")).toBe("old");
    expect(readSide(["new", "old"])).toBe("new");
    expect(readSide("sideways")).toBe("sideways");
  });
});
