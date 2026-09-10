import reducer from "./slice";

describe("note content load status", () => {
  const noteId = "33271d7c-b112-4234-9392-383046e86829";

  it("distinguishes an in-flight deep link from a rejected read", () => {
    const loading = reducer(undefined, {
      type: "notes/fetchNoteContent/pending",
      meta: { arg: noteId },
    });
    expect(loading.contentLoadStatus[noteId]).toBe("loading");

    const failed = reducer(loading, {
      type: "notes/fetchNoteContent/rejected",
      meta: { arg: noteId },
      error: { message: "database unavailable" },
    });
    expect(failed.contentLoadStatus[noteId]).toBe("error");

    const retrying = reducer(failed, {
      type: "notes/fetchNoteContent/pending",
      meta: { arg: noteId },
    });
    expect(retrying.contentLoadStatus[noteId]).toBe("loading");

    const loaded = reducer(retrying, {
      type: "notes/fetchNoteContent/fulfilled",
      meta: { arg: noteId },
      payload: null,
    });
    expect(loaded.contentLoadStatus[noteId]).toBe("loaded");
  });
});
