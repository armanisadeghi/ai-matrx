/**
 * RC-B12 round 10: `?panels=cloud_files:root` with failed reads said "No files
 * yet." / "This folder is empty." while /files said "We couldn't load your
 * files". The empty state of the shared FileTree / FileList — rendered by the
 * window panel, the pickers and the mobile stack — must be unreachable when
 * the read behind it failed or has not finished.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let mockRead: { status: "loading" | "error" | "ready"; error: string | null; retry: () => void };

jest.mock("@/features/files/hooks/useFilesReadStatus", () => ({
  useTreeReadStatus: () => mockRead,
}));
jest.mock("@/features/files/hooks/useFolderContents", () => ({
  useFolderContents: () => ({
    files: [],
    folders: [],
    loading: mockRead.status === "loading",
    status: mockRead.status,
    error: mockRead.error,
    retry: mockRead.retry,
  }),
}));
jest.mock("@/features/files/hooks/useFileSelection", () => ({
  useFileSelection: () => ({ selectedIds: [], isSelected: () => false, select: jest.fn(), clear: jest.fn() }),
}));
jest.mock("@/features/scopes/redux/thunks/ensureEntityScopes", () => ({ ensureEntityScopesBulk: jest.fn(() => ({ type: "test/noop" })) }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => ({ sortBy: "name", sortDir: "asc" }),
}));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/features/files/components/core/FileTree/useTreeExpansion", () => ({
  useTreeExpansion: () => ({ rows: [], isExpanded: () => false, toggle: jest.fn(), expandAll: jest.fn(), collapseAll: jest.fn(), expand: jest.fn(), collapse: jest.fn() }),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { FileList } from "@/features/files/components/core/FileList/FileList";
import { FileTree } from "@/features/files/components/core/FileTree/FileTree";

const cases = [
  ["FileList (the panel's folder view)", () => <FileList folderId={null} />],
  ["FileTree (the panel's sidebar)", () => <FileTree />],
] as const;

describe.each(cases)("%s", (_name, render) => {
  it("a failed read shows the failure with a retry, never the empty state", () => {
    mockRead = { status: "error", error: "forced failure (files read)", retry: jest.fn() };
    const html = renderToStaticMarkup(render());
    expect(html).not.toMatch(/This folder is empty|No files yet/);
    expect(html).toContain("We couldn&#x27;t load your files");
    expect(html).toContain("forced failure (files read)");
  });
  it("an unfinished read is a wait, never the empty state", () => {
    mockRead = { status: "loading", error: null, retry: jest.fn() };
    const html = renderToStaticMarkup(render());
    expect(html).not.toMatch(/This folder is empty|No files yet/);
  });
  it("a finished read with nothing in it is honestly empty", () => {
    mockRead = { status: "ready", error: null, retry: jest.fn() };
    const html = renderToStaticMarkup(render());
    expect(html).toMatch(/This folder is empty|No files yet/);
  });
});
