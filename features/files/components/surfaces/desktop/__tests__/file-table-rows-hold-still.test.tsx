/**
 * OPENING ONE FILE NEVER REDRAWS EVERY ROW OF THE FILES TABLE.
 *
 * 🚨 Measured live on /files/all (2026-10-07): clicking one file redrew 50 of
 * 51 rows — the list flickered and every row's hover state jumped. The list now
 * runs on the shared `MatrxDataTable` (2026-10-09), whose row memo holds a row
 * still unless something that row SHOWS changed. That only works while the host
 * hands it stable inputs: one `commands` object, one `rowWrapper`, memoised
 * columns. This harness mounts the real table exactly the way `FileTable` does
 * and counts row draws (the row shell's context menu draws once per row draw).
 *
 * The third case plants the classic shift — a `commands` object rebuilt on
 * every render (what FileTable did before 2026-10-07) — and proves the counter
 * sees it, so a green run means the rows truly held still.
 */
import React, { act, useCallback, useMemo, useState } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let rowDraws = new Map<string, number>();

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => null,
  useAppDispatch: () => () => undefined,
}));
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
  ...jest.requireActual("@dnd-kit/core"),
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
jest.mock("../AccessCell", () => ({ AccessCell: () => null }));
jest.mock("../OwnerCell", () => ({ OwnerCell: () => null }));
jest.mock("../RagStatusCell", () => ({ RagStatusCell: () => null }));
jest.mock("../FileContextCell", () => ({ FileContextCell: () => null }));
jest.mock("../FileTypeBadge", () => ({ FileTypeBadge: () => null }));
jest.mock("../FolderIconWithMembers", () => ({ FolderIconWithMembers: () => null }));

import {
  FileTableCell,
  FileTableRowShell,
  type FileListRow,
  type FileTableRowCommands,
} from "../FileTableRow";
import type { CloudFileRecord } from "@/features/files/types";

const NAMES = [
  "Harbor Dental lease 2026.pdf",
  "Q3 patient intake summary.xlsx",
  "Front desk script.docx",
  "Hygienist schedule October.pdf",
  "Insurance remittance 0914.pdf",
  "Waiting room remodel quote.pdf",
  "Sterilization log week 40.pdf",
  "New patient welcome packet.pdf",
];

const ROWS: FileListRow[] = NAMES.map((fileName, i) => ({
  id: `file-${i}`,
  item: {
    kind: "file",
    file: {
      id: `file-${i}`,
      fileName,
      fileSize: 48_000 + i * 1_024,
      mimeType: "application/pdf",
      ownerId: "user-1",
      parentFolderId: null,
      visibility: "private",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      metadata: {},
      source: { kind: "real" },
      deletedAt: null,
    } as unknown as CloudFileRecord,
  },
  isShared: false,
  memberCount: 0,
  granteeIds: [],
  parentPath: null,
}));

let openFile: (id: string | null) => void = () => undefined;
let bump: () => void = () => undefined;
const calls: string[] = [];

/** Mirrors FileTable: one stable commands object, one stable row shell, memoised columns. */
function FilesTableHarness({ plantShift = false }: { plantShift?: boolean }) {
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  openFile = setActiveFileId;
  bump = () => setTick((t) => t + 1);
  const [stableCommands] = useState<FileTableRowCommands>(() => ({
    activate: (id) => calls.push(`activate:${id}`),
    openShare: (id, kind) => calls.push(`share:${kind}:${id}`),
  }));
  const commands: FileTableRowCommands = plantShift
    ? {
        activate: (id) => calls.push(`activate:${id}`),
        openShare: (id, kind) => calls.push(`share:${kind}:${id}`),
      }
    : stableCommands;
  const columns = useMemo<MatrxColumnDef<FileListRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        accessorFn: (row) => (row.item.kind === "file" ? row.item.file.fileName : row.item.folder.folderName),
        cell: (row) => <FileTableCell id="name" row={row} currentUserId="user-1" commands={commands} />,
      },
    ],
    [commands],
  );
  const rowWrapper = useCallback(
    (row: FileListRow, children: React.ReactNode) => (
      <FileTableRowShell row={row}>{children}</FileTableRowShell>
    ),
    [],
  );
  return (
    <MatrxDataTable<FileListRow>
      tableId="files-list-hold-still"
      data={ROWS}
      columns={columns}
      getRowId={(row) => row.id}
      detail={{ enabled: false }}
      selectedId={activeFileId}
      rowWrapper={rowWrapper}
      pageSize={0}
    />
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
  act(() => root.render(<FilesTableHarness />));
  expect(rowDraws.size).toBe(ROWS.length);
  const before = new Map(rowDraws);
  for (let i = 0; i < 3; i += 1) act(() => bump());
  expect(redrawnSince(before)).toEqual([]);
});

it("opening a file redraws only that row", () => {
  act(() => root.render(<FilesTableHarness />));
  const before = new Map(rowDraws);
  act(() => openFile("file-5"));
  expect(redrawnSince(before)).toEqual(["file-5"]);
});

it("the counter catches a planted shift: commands rebuilt every render redraw every row", () => {
  act(() => root.render(<FilesTableHarness plantShift />));
  const before = new Map(rowDraws);
  act(() => bump());
  expect(redrawnSince(before)).toHaveLength(ROWS.length);
});

it("FileTable hands the table the same stable pieces this harness proves", () => {
  const table = readFileSync(join(__dirname, "..", "FileTable.tsx"), "utf8");
  expect(table).toContain("const [commands] = useState<FileTableRowCommands>");
  expect(table).toContain("rowWrapper={rowWrapper}");
  expect(table).toMatch(/const rowWrapper = useCallback\(/);
  expect(table).toMatch(/const columns = useMemo<MatrxColumnDef<FileListRow>\[\]>/);
  expect(table).toContain("commands={commands}");
});
