/**
 * The context chip names an attached document exactly as its tile does: the
 * file's own name first. An edge saved without a label used to read
 * "Attached document" in the chip after every reload while the tile beside it
 * showed the real file name.
 */

import { act } from "react";
import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Mount the hook, let every resolve settle, return what it last rendered. */
async function settledNames(fileIds: string[]): Promise<Record<string, string>> {
  let last: Record<string, string> = {};
  function Probe() {
    last = useAttachedDocumentFileNames(fileIds);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
  await act(async () => {});
  act(() => root.unmount());
  return last;
}

const resolve = jest.fn();
// The host registers its file resolver and file hook (P16f slots); this test registers doubles.
registerChatUi({ resolveFile: (...a: unknown[]) => resolve(...a), useFile: () => ({ file: null }) });

import {
  attachedDocumentFileId,
  resolveAttachedDocumentDisplayName,
  useAttachedDocumentFileNames,
} from "../attached-documents";

beforeEach(() => resolve.mockReset());

it("a file edge is the file; a legacy edge names its file in metadata", () => {
  expect(attachedDocumentFileId("file", { resourceId: "f1", metadata: null })).toBe("f1");
  expect(
    attachedDocumentFileId("processed_document", { resourceId: "p1", metadata: { file_id: "f2" } }),
  ).toBe("f2");
  expect(attachedDocumentFileId("processed_document", { resourceId: "p1", metadata: {} })).toBeNull();
});

it("resolves every file name once and labels rows like the tiles", async () => {
  resolve.mockImplementation(async ({ fileId }: { fileId: string }) => ({
    meta: { fileName: fileId === "f1" ? "Q3 board deck.pdf" : "Lease agreement.docx" },
  }));
  const names = await settledNames(["f1", "f2", "f1"]);
  expect(Object.keys(names)).toHaveLength(2);
  expect(resolve).toHaveBeenCalledTimes(2);
  expect(resolveAttachedDocumentDisplayName({ fileName: names.f1, edgeLabel: null })).toBe(
    "Q3 board deck.pdf",
  );
});

it("a file that cannot be read keeps the edge label", async () => {
  resolve.mockRejectedValue(new Error("gone"));
  const names = await settledNames(["f9"]);
  expect(names).toEqual({});
  expect(
    resolveAttachedDocumentDisplayName({ fileName: names.f9, edgeLabel: "Signed lease.pdf" }),
  ).toBe("Signed lease.pdf");
});
