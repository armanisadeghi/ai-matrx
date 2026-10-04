import { intakeText } from "../home/board-intake";

describe("what a paste becomes on a board", () => {
  it("a web address becomes a web page, an image address an image", () => {
    expect(intakeText("example.com/pricing")).toEqual([
      { title: "example.com", source: { kind: "html", url: "https://example.com/pricing" } },
    ]);
    expect(intakeText("https://cdn.site.io/a/cat.png")[0].source).toEqual({ kind: "image", url: "https://cdn.site.io/a/cat.png" });
  });

  it("several addresses, one per line, become one tile each", () => {
    expect(intakeText("a.com\nhttps://b.org/x\n").map((i) => i.source.kind)).toEqual(["html", "html"]);
  });

  it("anything else becomes a new Note seeded with the text", () => {
    const [note] = intakeText("Call the client Monday\n- bring the contract");
    expect(note.title).toBe("Call the client Monday");
    expect(note.source).toEqual({
      kind: "entity",
      entity: "note",
      id: null,
      meta: { seed: "Call the client Monday\n- bring the contract" },
    });
    // A bare word is text, not a host; a sentence with a link in it is text too.
    expect(intakeText("hello")[0].source.kind).toBe("entity");
    expect(intakeText("see example.com for details")[0].source.kind).toBe("entity");
    expect(intakeText("javascript:alert(1)")[0].source.kind).toBe("entity");
  });

  it("empty input adds nothing", () => {
    expect(intakeText("   \n ")).toEqual([]);
  });
});
