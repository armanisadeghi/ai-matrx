/**
 * A save never empties a populated field silently (2026-10-05: test saves on a
 * live monitor emptied its topics, standing, feeds and brief and nothing said so).
 * The server names what a save emptied (`blanked_fields`); the editor says it in
 * one sentence.
 */
import { blankedFieldsSentence } from "./model";

describe("blankedFieldsSentence", () => {
  it("names every field a save emptied, with what it held", () => {
    expect(
      blankedFieldsSentence({ id: "t", blanked_fields: { topics: 7, standing: 3, feed_ids: 2, brief_source_id: 1 } }),
    ).toBe(
      "This save emptied topics (had 7), what you can speak to (had 3), feeds (had 2), the brief (had 1). If that was not meant, add them back and save again.",
    );
  });

  it("says nothing when the save emptied nothing", () => {
    expect(blankedFieldsSentence({ id: "t", blanked_fields: {} })).toBeNull();
    expect(blankedFieldsSentence({ id: "t" })).toBeNull();
  });
});
