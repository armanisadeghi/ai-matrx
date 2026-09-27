/**
 * The hub's state IS the URL (Linear). These guard the two promises the page
 * rests on: every state survives a round trip through the address unchanged,
 * and choosing a sidebar item produces exactly that item's query.
 */
import {
  hubStateFromParams,
  hubStateToParams,
  parseSavedViewDefinition,
  selectionQuery,
  type HubState,
} from "@/features/knowledge/hub/hubState";

function roundTrip(s: HubState): HubState {
  const qs = hubStateToParams(s).toString();
  return hubStateFromParams(new URLSearchParams(qs));
}

describe("URL ⇄ query round trip", () => {
  it("keeps every field of a full state, including names with commas and colons", () => {
    const state: HubState = {
      view: { kind: "container", type: "project", id: "p-1" },
      query: {
        mode: "ask",
        text: "budget, draft: v2",
        types: ["note", "task"],
        source_kinds: ["web_page"],
        within: [
          { type: "project", id: "p-1" },
          { type: "tag", name: "grant, 2026" },
        ],
        entities: ["Ava Chen", "Acme, Inc."],
        captured_by: "me",
        origin: ["extension", "agent"],
        date: { field: "updated", relative: "last_7_days" },
        state: ["inbox", "kept"],
        organizations: ["o-1"],
        sort: "title",
      },
      layout: "board",
      peek: { entity: "processed_document", id: "d-9" },
      data: "sample",
    };
    expect(roundTrip(state)).toEqual(state);
  });

  it("an explicit date range and a list of people survive", () => {
    const state: HubState = {
      view: { kind: "saved", id: "sv-1" },
      query: {
        mode: "find",
        captured_by: ["u-1", "u-2"],
        date: { field: "created", from: "2026-01-01", to: "2026-02-01" },
      },
      layout: "table",
      peek: null,
      data: "live",
    };
    expect(roundTrip(state)).toEqual(state);
  });

  it("the default state is the bare address", () => {
    const qs = hubStateToParams({
      view: { kind: "everything" },
      query: { mode: "find" },
      layout: "list",
      peek: null,
      data: "live",
    }).toString();
    expect(qs).toBe("");
  });

  it("garbage in the address falls back to defaults instead of throwing", () => {
    const s = hubStateFromParams(
      new URLSearchParams("view=in:&layout=spiral&state=bogus&sort=wat&peek=nocolon&date=when:"),
    );
    expect(s.view).toEqual({ kind: "everything" });
    expect(s.layout).toBe("list");
    expect(s.query).toEqual({ mode: "find" });
    expect(s.peek).toBeNull();
  });
});

describe("sidebar selection → query", () => {
  it("Inbox is the inbox state", () => {
    expect(selectionQuery({ kind: "inbox" }).query).toEqual({ mode: "find", state: ["inbox"] });
  });
  it("Everything clears every filter", () => {
    expect(selectionQuery({ kind: "everything" }).query).toEqual({ mode: "find" });
  });
  it("a container is `within` that container", () => {
    expect(selectionQuery({ kind: "container", type: "scope", id: "s-1" }).query).toEqual({
      mode: "find",
      within: [{ type: "scope", id: "s-1" }],
    });
  });
  it("a Source kind narrows source_kinds; an entity kind narrows types", () => {
    expect(selectionQuery({ kind: "kind", key: "sk.transcript" }).query).toEqual({
      mode: "find",
      source_kinds: ["transcript"],
    });
    expect(selectionQuery({ kind: "kind", key: "conversation" }).query).toEqual({
      mode: "find",
      types: ["conversation"],
    });
  });
  it("a saved view brings its stored query and layout", () => {
    const def = parseSavedViewDefinition({
      query: { mode: "find", types: ["note"], text: "grant" },
      layout: "gallery",
    });
    expect(selectionQuery({ kind: "saved", id: "sv" }, def)).toEqual({
      query: { mode: "find", types: ["note"], text: "grant" },
      layout: "gallery",
    });
  });
  it("an unreadable saved view definition is refused, not guessed", () => {
    expect(parseSavedViewDefinition("nope")).toBeNull();
    expect(parseSavedViewDefinition(null)).toBeNull();
  });
});
