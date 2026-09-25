/** @jest-environment jsdom */
/**
 * THE NAME MIRROR WRITES ONLY WHEN A FILE IS RENAMED — never for a standing difference, never twice.
 *
 * 2026-09-25 20:43-20:45Z: one studio session sent 366 PATCHes to docproc.processed_documents
 * across 117 documents in 75 s. The hook wrote `name = file.fileName` for EVERY loaded doc whose
 * name differed from its cloud file's name — including docs whose name differs ON PURPOSE (one
 * file, several extraction runs: "01-intake-rules.txt (agent extract run 0bdbf4b0)") — then
 * refetched the whole list after each success, which re-ran the effect, and forgot a failed doc
 * the moment its write returned, so a timed-out (57014) write was re-sent on the next render.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { StudioDocSummary } from "../usePdfStudioDocs";
import { useSyncStudioDocNames } from "../useSyncStudioDocNames";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let filesById: Record<string, { fileName: string }> = {};
const writes: Array<{ id: string; name: string }> = [];
let nextWriteFails = false;

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => filesById,
}));
jest.mock("@/features/files/redux/selectors", () => ({
  selectAllFilesMap: () => null,
}));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/utils/supabase/docprocDb", () => ({
  docprocDb: () => ({
    from: () => ({
      update: (patch: { name: string }) => ({
        eq: (_col: string, id: string) => ({
          select: () => ({ id, name: patch.name }),
        }),
      }),
    }),
  }),
}));
jest.mock("@/utils/supabase/writeOne", () => ({
  tryWriteOne: (q: { id: string; name: string }) => {
    writes.push({ id: q.id, name: q.name });
    const fail = nextWriteFails;
    return Promise.resolve(
      fail
        ? { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }
        : { data: { id: q.id }, error: null },
    );
  },
}));

function doc(id: string, name: string, sourceId: string): StudioDocSummary {
  return {
    id,
    name,
    createdAt: "2026-09-25T00:00:00Z",
    updatedAt: "2026-09-25T00:00:00Z",
    totalPages: 1,
    mimeType: "application/pdf",
    sourceKind: "cld_file",
    sourceId,
    parentProcessedId: null,
    derivationKind: "original",
    sourceMissing: false,
    archived: false,
  };
}

let root: Root;
let host: HTMLDivElement;
const refresh = jest.fn();

function Harness({ docs }: { docs: StudioDocSummary[] }) {
  useSyncStudioDocNames(docs, refresh);
  return null;
}

async function render(docs: StudioDocSummary[]) {
  await act(async () => {
    root.render(<Harness docs={docs} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  writes.length = 0;
  nextWriteFails = false;
  refresh.mockClear();
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
});

test("a standing difference on load is not a rename — nothing is written", async () => {
  filesById = { f1: { fileName: "01-intake-rules.txt" }, f2: { fileName: "existing.pdf" } };
  const docs = [
    doc("d1", "01-intake-rules.txt (agent extract run 0bdbf4b0)", "f1"),
    doc("d2", "01-intake-rules.txt (agent extract run 981ba57)", "f1"),
    doc("d3", "Quarterly report", "f2"),
  ];
  await render(docs);
  await render([...docs]); // the list refetched: a new array, same rows
  expect(writes).toEqual([]);
});

test("a file renamed while open renames the docs that mirrored it, once, and refreshes once", async () => {
  filesById = { f1: { fileName: "old.pdf" } };
  const docs = [doc("d1", "old.pdf", "f1"), doc("d2", "old.pdf (agent extract run 1)", "f1")];
  await render(docs);
  expect(writes).toEqual([]);

  filesById = { f1: { fileName: "new.pdf" } };
  await render([...docs]);
  await render([...docs]); // re-render before the refetch lands: no second write
  expect(writes).toEqual([{ id: "d1", name: "new.pdf" }]);
  expect(refresh).toHaveBeenCalledTimes(1);
});

test("a write that times out is not re-sent on the next render", async () => {
  filesById = { f1: { fileName: "old.pdf" } };
  const docs = [doc("d1", "old.pdf", "f1")];
  await render(docs);
  nextWriteFails = true;
  filesById = { f1: { fileName: "new.pdf" } };
  await render([...docs]);
  await render([...docs]);
  await render([...docs]);
  expect(writes).toEqual([{ id: "d1", name: "new.pdf" }]);
  expect(refresh).not.toHaveBeenCalled();
});
