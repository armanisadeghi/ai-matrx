import { initialTabsFromUrl } from "@/features/notes/initialTabsFromUrl";

describe("initialTabsFromUrl", () => {
  it("opens the note a bare ?active= names — every note door in the app is /notes?active=<id>", () => {
    expect(
      initialTabsFromUrl({ tabs: [], active: "note-1", routeNoteId: null }),
    ).toEqual(["note-1"]);
  });

  it("keeps ?tabs= when both are present, so ?active= only focuses", () => {
    expect(
      initialTabsFromUrl({
        tabs: ["note-1", "note-2"],
        active: "note-2",
        routeNoteId: null,
      }),
    ).toEqual(["note-1", "note-2"]);
  });

  it("falls back to the /notes/[id] segment", () => {
    expect(
      initialTabsFromUrl({ tabs: [], active: null, routeNoteId: "note-3" }),
    ).toEqual(["note-3"]);
  });

  it("asks for nothing when the URL names nothing", () => {
    expect(
      initialTabsFromUrl({ tabs: [], active: null, routeNoteId: null }),
    ).toBeUndefined();
  });
});
