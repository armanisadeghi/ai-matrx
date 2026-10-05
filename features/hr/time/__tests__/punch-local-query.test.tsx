import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table/types";
import type { PunchRow } from "../api/types";
import { PunchRegister } from "../punches/PunchRegister";
import { getPunchRegister } from "../api/service";

let mockTableProps: MatrxDataTableProps<PunchRow>;
let mockPageSize = 10;
const mockSetPrefs = jest.fn((patch: { pageSize: number }) => { mockPageSize = patch.pageSize; });
jest.mock("@ai-matrx/design-system/data-table", () => ({ MatrxDataTable: (props: MatrxDataTableProps<PunchRow>) => { mockTableProps = props; return null; } }));
jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock("@/features/hr/mock/transport", () => ({ hrMockEnabled: () => false }));
jest.mock("@/features/hr/shared/useHrContext", () => ({ useHrContext: () => ({ orgRef: "employer", active: { organization_id: "employer" } }) }));
jest.mock("@/lib/list-views/useListViewPrefs", () => ({ useListViewPrefs: () => ({ prefs: { pageSize: mockPageSize }, setPrefs: mockSetPrefs }) }));
jest.mock("../api/service", () => ({ getPunchRegister: jest.fn(async () => ({ rows: [], totalRows: 100 })) }));
jest.mock("../punches/PunchRegisterScopePicker", () => ({ PunchRegisterScopePicker: () => null }));
jest.mock("../punches/PunchCorrectionDialog", () => ({ PunchCorrectionDialog: () => null }));
jest.mock("../shared/RefusalNotice", () => ({ HrTimeReadState: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({ NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("../shared/punch-menu", () => ({ punchMenuContent: jest.fn(), buildPunchMenuSection: jest.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps local controls local while paging reaches the source and persists row size", async () => {
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<PunchRegister orgScope />));
    expect(getPunchRegister).toHaveBeenCalledTimes(1);
    expect(getPunchRegister).toHaveBeenLastCalledWith({ employmentIds: undefined, organizationId: "employer" }, { page: 1, pageSize: 10 }, expect.any(Object));
    const query = mockTableProps.query;
    if (!query || query.mode !== "controlled") throw new Error("Expected counted source query");
    expect(query.sourceProcessing).toEqual({ search: "local", sort: "local", columnFilters: "local" });
    expect(mockTableProps.coverage).toEqual({ answeredBy: "client", total: 100, noun: "punch" });
    await act(async () => query.onStateChange({ ...query.state, search: "clock", sort: { id: "source", direction: "asc" }, columnFilters: { source: { kind: "text", value: "clock" } } }));
    expect(getPunchRegister).toHaveBeenCalledTimes(1);
    const next = mockTableProps.query;
    if (!next || next.mode !== "controlled") throw new Error("Expected controlled query");
    await act(async () => next.onStateChange({ ...next.state, page: 2 }));
    expect(getPunchRegister).toHaveBeenCalledTimes(2);
    const sized = mockTableProps.query;
    if (!sized || sized.mode !== "controlled") throw new Error("Expected controlled query");
    await act(async () => sized.onStateChange({ ...sized.state, page: 1, pageSize: 25 }));
    expect(mockSetPrefs).toHaveBeenCalledWith({ pageSize: 25 });
    expect(getPunchRegister).toHaveBeenCalledTimes(3);
    expect(getPunchRegister).toHaveBeenLastCalledWith(expect.any(Object), { page: 1, pageSize: 25 }, expect.any(Object));
  } finally { await act(async () => root.unmount()); }
});
