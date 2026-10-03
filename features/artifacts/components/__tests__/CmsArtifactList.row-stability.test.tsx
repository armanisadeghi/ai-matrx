/**
 * THE LIST NEVER REDRAWS EVERY ROW BECAUSE IT RE-RENDERED.
 *
 * `MatrxDataTable` memoises each body row and redraws it only when a function
 * the body draws from (`cell`, `customActions`, `rowClassName`, `getRowId`, the
 * columns array) changes identity. `CmsArtifactList` used to write those inline
 * in its JSX, so every re-render of the list — opening an artifact in the
 * canvas re-renders it twice — redrew all rows: with 560 artifacts, 1,120 row
 * renders and ~2.1s from click to the canvas address moving.
 *
 * This renders the list, re-renders it with nothing changed, and asserts the
 * table received the SAME body functions both times.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type TableProps = {
  columns: Array<{ id: string; customActions?: unknown; cell?: unknown }>;
  getRowId: unknown;
  rowClassName: unknown;
  data: unknown[];
};

const tableCalls: TableProps[] = [];

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: TableProps) => {
    tableCalls.push(props);
    return null;
  },
}));
jest.mock("@ai-matrx/design-system/data-table/uuid-cell", () => ({
  MatrxUuidCell: () => null,
}));
jest.mock("@ai-matrx/design-system", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
jest.mock("@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/surfaces/manifests/artifacts.manifest", () => ({
  ARTIFACTS_SURFACE_NAME: "matrx-user/artifacts",
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({
  ErrorAlchemyMenu: () => null,
}));
jest.mock("@/components/ui/dropdown-menu", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    DropdownMenu: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuItem: Pass,
    DropdownMenuSeparator: Pass,
    DropdownMenuTrigger: Pass,
  };
});
jest.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children?: React.ReactNode }) => <button type="button">{children}</button>,
}));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const router = { push: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/artifacts",
}));
jest.mock("next/link", () => ({ __esModule: true, default: () => null }));

const openItem = jest.fn();
jest.mock("@/features/canvas/hooks/useOpenCanvasItem", () => ({
  useOpenCanvasItem: () => ({ openItem }),
}));
jest.mock("@/features/canvas/hooks/useCanvasArtifactUrlState", () => ({
  useCanvasArtifactUrlState: () => undefined,
}));

const ARTIFACTS = [
  {
    id: "a-1",
    title: "Table 1",
    description: null,
    artifactType: "data_table",
    status: "published",
    updatedAt: "2026-10-01T00:00:00Z",
    canvasItemId: "c-1",
  },
];
jest.mock("@/lib/redux/selectors/artifactSelectors", () => ({
  selectAllArtifacts: () => ARTIFACTS,
  selectArtifactFetchStatus: () => "success",
  selectArtifactFetchError: () => null,
}));
const dispatch = jest.fn();
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: () => unknown) => selector(),
}));
jest.mock("@/lib/redux/thunks/artifactThunks", () => ({
  fetchUserArtifactsThunk: jest.fn(),
  archiveArtifactThunk: jest.fn(),
}));

import { CmsArtifactList } from "../CmsArtifactList";

describe("CmsArtifactList — the table's body functions are stable across re-renders", () => {
  it("hands MatrxDataTable the same columns, row actions, row class and row id on a re-render that changed nothing", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<CmsArtifactList />));
    const first = tableCalls[tableCalls.length - 1];
    act(() => root.render(<CmsArtifactList />));
    const second = tableCalls[tableCalls.length - 1];
    act(() => root.unmount());

    expect(second).not.toBe(first);
    expect(second.columns).toBe(first.columns);
    expect(second.getRowId).toBe(first.getRowId);
    expect(second.rowClassName).toBe(first.rowClassName);
    const actions = (props: TableProps) =>
      props.columns.find((column) => column.id === "custom-actions")?.customActions;
    expect(actions(second)).toBeDefined();
    expect(actions(second)).toBe(actions(first));
  });
});
