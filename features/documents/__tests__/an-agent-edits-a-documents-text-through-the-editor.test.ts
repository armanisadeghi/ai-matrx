/**
 * `matrx-user/documents` → `document_body`: an agent's new text lands through
 * the editor's own facade (delete one span, insert one span), leaves the
 * untouched text around it alone, and says so when it cannot.
 */

import {
  bodyTextOf,
  documentBodyWriteHandler,
  planBodyEdit,
  type DocumentBodyPort,
} from "@/features/documents/document-body-text";

/** A stand-in for Univer's body: the same data-stream rules the facade keeps. */
function fakeDocument(initial: string) {
  let stream = initial;
  const calls: string[] = [];
  const port: DocumentBodyPort = {
    getDataStream: () => stream,
    deleteRange: (start, end) => {
      calls.push(`delete ${start}-${end}`);
      // Univer protects the final paragraph mark + section break.
      if (end > stream.length - 2) return false;
      stream = stream.slice(0, start) + stream.slice(end);
      return true;
    },
    insertText: (at, text) => {
      calls.push(`insert ${at} ${JSON.stringify(text)}`);
      stream = stream.slice(0, at) + text.replace(/\n/g, "\r") + stream.slice(at);
      return true;
    },
  };
  return { port, calls, stream: () => stream };
}

const writable = () => {};

describe("the document body as plain text", () => {
  it("reads paragraphs as lines and leaves out the closing marks and block tokens", () => {
    const body = bodyTextOf("Title\rFirst \x1Fline\r\n");
    expect(body.text).toBe("Title\nFirst line");
    // The end of the text sits before the protected final paragraph mark.
    expect(body.offsets[body.text.length]).toBe(17);
  });

  it("plans one span, keeping the common start and end", () => {
    const edit = planBodyEdit(bodyTextOf("Hello world\r\n"), "Hello brave world");
    expect(edit).toEqual({ start: 6, end: 6, insert: "brave " });
  });
});

describe("the document_body write handler", () => {
  it("refuses a value that is not text before any card is shown", () => {
    const handler = documentBodyWriteHandler({ getPort: () => null, assertWritable: writable });
    expect(() => handler.validate?.({ text: "x" })).toThrow(/plain string/);
  });

  it("changes only the words that differ, through delete + insert", async () => {
    const doc = fakeDocument("Q3 memo\rRevenue rose.\r\n");
    const handler = documentBodyWriteHandler({ getPort: () => doc.port, assertWritable: writable });
    const outcome = await handler.apply("Q3 memo\rRevenue fell.\nCosts held.");
    expect(doc.stream()).toBe("Q3 memo\rRevenue fell.\rCosts held.\r\n");
    // "rose" goes, the shared "." stays where it was.
    expect(doc.calls).toEqual(["delete 16-20", 'insert 16 "fell.\\nCosts held"']);
    expect(outcome).toMatchObject({ data: { removed: 4, inserted: 16 } });
  });

  it("appends at the end of the last paragraph", async () => {
    const doc = fakeDocument("One\r\n");
    const handler = documentBodyWriteHandler({ getPort: () => doc.port, assertWritable: writable });
    await handler.apply("One\nTwo");
    expect(doc.stream()).toBe("One\rTwo\r\n");
  });

  it("reports an unchanged body without touching the editor", async () => {
    const doc = fakeDocument("Same\r\n");
    const handler = documentBodyWriteHandler({ getPort: () => doc.port, assertWritable: writable });
    const outcome = await handler.apply("Same");
    expect(doc.calls).toEqual([]);
    expect(outcome).toMatchObject({ summary: expect.stringMatching(/nothing changed/) });
  });

  it("refuses a viewer, and an editor that has not opened yet", async () => {
    const viewer = documentBodyWriteHandler({
      getPort: () => fakeDocument("x\r\n").port,
      assertWritable: (what) => {
        throw new Error(`viewer-only, so ${what}`);
      },
    });
    expect(() => viewer.apply("y")).toThrow(/viewer-only, so its text cannot be changed/);
    const opening = documentBodyWriteHandler({ getPort: () => null, assertWritable: writable });
    expect(() => opening.apply("y")).toThrow(/not finished opening/);
  });

  it("says so loudly when Univer refuses the edit", () => {
    const doc = fakeDocument("abc\r\n");
    const port: DocumentBodyPort = { ...doc.port, deleteRange: () => false };
    const handler = documentBodyWriteHandler({ getPort: () => port, assertWritable: writable });
    expect(() => handler.apply("xyz")).toThrow(/refused to remove the old text/);
  });
});
