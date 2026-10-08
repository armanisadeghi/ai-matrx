/**
 * OPENING ONE FILE NEVER REDRAWS EVERY ROW OF THE FILES TABLE.
 *
 * 🚨 Measured live on /files/all (2026-10-07): clicking one file redrew 50 of
 * 51 rows. `FileTable` handed every row three inline handlers and a freshly
 * built `granteeIds` array on each of its renders, and `FileTableRow` was not
 * memoised, so any table render (opening a file moves `activeFileId`) redrew
 * them all. Rows now take one stable `commands` object and are memoised on
 * what they show.
 *
 * This host renders rows exactly the way `FileTable` does — new arrays every
 * render, the same commands — and counts row draws.
 *
 * RED against the old FileTableRow (no memo): every row redraws on every render.
 */
import React, { act, useState } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let rowDraws = new Map<string, number>();

jest.mock("@/features/files/components/core/RowContextMenu/RowContextMenu", () => ({
  FileRowContextMenu: ({ fileId, children }: { fileId: string; children: React.ReactNode }) => {
    rowDraws.set(fileId, (rowDraws.get(fileId) ?? 0) + 1);
    return <>{children}</>;
  },
  FolderRowContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/files/components/core/FileActions/useFileActions", () => ({
  useFileActions: () => ({ copyShareUrl: async () => undefined }),
}));
jest.mock("@/features/files/components/core/FileActions/useFolderActions", () => ({
  useFolderActions: () => ({}),
}));
jest.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => undefined, isDragging: false }),
  useDroppable: () => ({ isOver: false, setNodeRef: () => undefined }),
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ label, onOpen }: { label?: string; onOpen?: () => void }) => (
    <button type="button" onClick={onOpen}>{label}</button>
  ),
}));
jest.mock("@/components/official/entity-ref/EntityDoorControls", () => ({ EntityDoorControls: () => null }));
jest.mock("@ai-matrx/media/react", () => ({ FileIcon: () => null }));
jest.mock("@/features/files/components/core/FileBadges/FileRagBadge", () => ({ FileRagBadge: () => null }));
jest.mock("@/features/files/components/core/FileContextMenu/FileContextMenu", () => ({
  FileContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/files/components/core/FolderContextMenu/FolderContextMenu", () => ({
  FolderContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("../AccessCell", () => ({ AccessCell: () => <td /> }));
jest.mock("../OwnerCell", () => ({ OwnerCell: () => <td /> }));
jest.mock("../RagStatusCell", () => ({ RagStatusCell: () => <td /> }));
jest.mock("../FileContextCell", () => ({ FileContextCell: () => <td /> }));
jest.mock("../FileTypeBadge", () => ({ FileTypeBadge: () => null }));
jest.mock("../FolderIconWithMembers", () => ({ FolderIconWithMembers: () => null }));

import { FileTableRow, type FileTableRowCommands } from "../FileTableRow";
import type { CloudFileRecord } from "@/features/files/types";

const FILES = Array.from({ length: 20 }, (_, i) => ({
  id: `file-${i}`,
  fileName: `File ${i}.pdf`,
  fileSize: 1000 + i,
  mimeType: "application/pdf",
  ownerId: "user-1",
  parentFolderId: null,
  visibility: "private",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  metadata: {},
  source: { kind: "real" },
  deletedAt: null,
})) as unknown as CloudFileRecord[];

let openFile: (id: string | null) => void = () => undefined;
let bump: () => void = () => undefined;
const calls: string[] = [];

/** Mirrors FileTable: one stable commands object, fresh arrays every render. */
function Table() {
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  openFile = setActiveFileId;
  bump = () => setTick((t) => t + 1);
  const [commands] = useState<FileTableRowCommands>(() => ({
    toggleSelected: (id) => calls.push(`toggle:${id}`),
    activate: (id) => calls.push(`activate:${id}`),
    openShare: (id, kind) => calls.push(`share:${kind}:${id}`),
  }));
  return (
    <table>
      <tbody>
        {FILES.map((file) => (
          <FileTableRow
            key={file.id}
            kind="file"
            file={file}
            selected={false}
            isPreviewActive={file.id === activeFileId}
            isFocused={false}
            visibleColumnIds={["name", "size"]}
            currentUserId="user-1"
            commands={commands}
            isShared={false}
            memberCount={0}
            granteeIds={[].filter(Boolean)}
            parentPath={null}
          />
        ))}
      </tbody>
    </table>
  );
}

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  rowDraws = new Map();
  calls.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const redrawnSince = (before: Map<string, number>) =>
  [...rowDraws].filter(([id, n]) => n > (before.get(id) ?? 0)).map(([id]) => id);

it("a table render that changes nothing a row shows redraws no row", () => {
  act(() => root.render(<Table />));
  expect(rowDraws.size).toBe(FILES.length);
  const before = new Map(rowDraws);
  for (let i = 0; i < 3; i += 1) act(() => bump());
  expect(redrawnSince(before)).toEqual([]);
});

it("opening a file redraws only that row", () => {
  act(() => root.render(<Table />));
  const before = new Map(rowDraws);
  act(() => openFile("file-7"));
  expect(redrawnSince(before)).toEqual(["file-7"]);
});

it("a held row's checkbox reaches the table's commands with its own id", () => {
  act(() => root.render(<Table />));
  act(() => bump());
  const box = container.querySelector<HTMLElement>('[aria-label="Select File 4.pdf"]')!;
  act(() => box.click());
  expect(calls).toEqual(["toggle:file-4"]);
});

it("FileTable hands every row the one stable commands object", () => {
  const table = readFileSync(join(__dirname, "..", "FileTable.tsx"), "utf8");
  expect(table).toContain("commands={rowCommands}");
  expect(table).not.toMatch(/onToggleSelected=\{|onActivate=\{\(\) =>|onOpenShare=\{\(\) =>/);
});
