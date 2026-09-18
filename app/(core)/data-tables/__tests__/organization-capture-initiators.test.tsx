import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const push = jest.fn();
const toast = jest.fn();
const ensureOrganizationContext = jest.fn();
const createDocument = jest.fn();
const createWorkbook = jest.fn();
const saveSnapshot = jest.fn();
const listAccessibleDocuments = jest.fn();
const listAccessibleWorkbooks = jest.fn();
const xlsxToUniverWorkbook = jest.fn();
const upload = jest.fn();
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let selectedOrganizationId: string | null = null;
let host: HTMLDivElement;
let root: Root;

async function renderPage(node: ReactNode) {
  await act(async () => root.render(node));
}

async function flush() {
  await act(async () => await Promise.resolve());
}

function click(element: Element) {
  act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function chooseFile(input: HTMLInputElement, file: File) {
  act(() => {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => selectedOrganizationId,
}));
jest.mock("@/lib/organization/organization-gate", () => ({
  ensureOrganizationContext: (...args: unknown[]) =>
    ensureOrganizationContext(...args),
  isOrganizationSelectionCancelled: (error: unknown) =>
    error instanceof Error && error.name === "OrganizationSelectionCancelled",
}));
jest.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => toast(...args),
}));
jest.mock("@/features/data-tables/document-service", () => ({
  createDocument: (...args: unknown[]) => createDocument(...args),
  deleteDocument: jest.fn(),
  listAccessibleDocuments: (...args: unknown[]) =>
    listAccessibleDocuments(...args),
}));
jest.mock("@/features/data-tables/workbook-service", () => ({
  createWorkbook: (...args: unknown[]) => createWorkbook(...args),
  deleteWorkbook: jest.fn(),
  discardFailedWorkbook: jest.fn(),
  listAccessibleWorkbooks: (...args: unknown[]) =>
    listAccessibleWorkbooks(...args),
  saveSnapshot: (...args: unknown[]) => saveSnapshot(...args),
}));
jest.mock("@/features/data-tables/xlsx-to-univer", () => ({
  xlsxToUniverWorkbook: (...args: unknown[]) => xlsxToUniverWorkbook(...args),
}));
jest.mock("@/features/files/handler/handler", () => ({
  fileHandler: { upload: (...args: unknown[]) => upload(...args) },
}));
jest.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CardContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/features/shell/components/header/RouteHeader", () => ({
  __esModule: true,
  default: ({ right }: { right: React.ReactNode }) => <header>{right}</header>,
}));
jest.mock("@ai-matrx/tap-target", () => ({
  TapTargetButtonSolid: ({
    label,
    onClick,
    disabled,
  }: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {label}
    </button>
  ),
  TapTargetButton: ({
    ariaLabel,
    onClick,
  }: {
    ariaLabel: string;
    onClick: () => void;
  }) => <button aria-label={ariaLabel} onClick={onClick} />,
}));
jest.mock("@/features/data-tables/components/DocumentListCard", () => ({
  DocumentListCard: () => null,
}));
jest.mock("@/features/data-tables/components/DocumentsHubTable", () => ({
  DocumentsHubTable: () => null,
}));
jest.mock("@/features/data-tables/components/DocumentsHubToolbar", () => ({
  DocumentsHubToolbar: () => null,
}));
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock("@/lib/list-views/useListViewPrefs", () => ({
  useListViewPrefs: () => ({ prefs: { view: "cards" }, setView: jest.fn() }),
}));
jest.mock("@/features/data-tables/components/ImportRouteDialog", () => ({
  ImportRouteDialog: () => null,
}));
jest.mock("@ai-matrx/design-system", () => ({
  BottomSheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  BottomSheetHeader: () => null,
  BottomSheetBody: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock("@/components/official/entity-ref/EntityDoorControls", () => ({
  EntityDoorControls: () => null,
}));

import DocumentsLandingPage from "../../documents/page";
import WorkbooksLandingPage from "../../workbooks/page";

const TARGET_ORG = "11111111-1111-4111-8111-111111111111";
const SWITCHED_ORG = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  jest.clearAllMocks();
  selectedOrganizationId = null;
  listAccessibleDocuments.mockResolvedValue({ success: true, data: [] });
  listAccessibleWorkbooks.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

test("Documents create cancels without a document write", async () => {
  const cancelled = new Error("not now");
  cancelled.name = "OrganizationSelectionCancelled";
  ensureOrganizationContext.mockRejectedValue(cancelled);
  await renderPage(<DocumentsLandingPage />);
  click(
    [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "New document",
    )!,
  );
  await flush();
  expect(ensureOrganizationContext).toHaveBeenCalledWith({
    organizationId: null,
  });
  expect(createDocument).not.toHaveBeenCalled();
  expect(toast).not.toHaveBeenCalled();
});

test("Workbook import captures the organization before parsing and retains it across a selected-org switch", async () => {
  let resolveOrganization: (id: string) => void = () => {};
  ensureOrganizationContext.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        resolveOrganization = resolve;
      }),
  );
  xlsxToUniverWorkbook.mockResolvedValue({ id: "snapshot" });
  upload.mockResolvedValue({ fileId: "source-file" });
  createWorkbook.mockResolvedValue({
    success: true,
    data: { id: "workbook-1" },
  });
  saveSnapshot.mockResolvedValue({ success: true, data: {} });
  await renderPage(<WorkbooksLandingPage />);
  await flush();
  expect(listAccessibleWorkbooks).toHaveBeenCalled();
  const input = host.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["sheet"], "budget.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  chooseFile(input, file);
  await flush();
  expect(ensureOrganizationContext).toHaveBeenCalledWith({
    organizationId: null,
  });
  expect(xlsxToUniverWorkbook).not.toHaveBeenCalled();
  selectedOrganizationId = SWITCHED_ORG;
  await act(async () => resolveOrganization(TARGET_ORG));
  await flush();
  expect(createWorkbook).toHaveBeenCalledWith(
    expect.objectContaining({ organizationId: TARGET_ORG }),
  );
  expect(push).toHaveBeenCalledWith("/workbooks/workbook-1");
});

test("Workbook import cancellation retains the selected file and performs no create", async () => {
  const cancelled = new Error("not now");
  cancelled.name = "OrganizationSelectionCancelled";
  ensureOrganizationContext.mockRejectedValue(cancelled);
  await renderPage(<WorkbooksLandingPage />);
  await flush();
  expect(listAccessibleWorkbooks).toHaveBeenCalled();
  const input = host.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["sheet"], "budget.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const inputValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  const clearInput = jest
    .spyOn(HTMLInputElement.prototype, "value", "set")
    .mockImplementation(function setValue(
      this: HTMLInputElement,
      value: string,
    ) {
      inputValue?.set?.call(this, value);
    });
  chooseFile(input, file);
  await flush();
  expect(ensureOrganizationContext).toHaveBeenCalled();
  expect(createWorkbook).not.toHaveBeenCalled();
  expect(clearInput).not.toHaveBeenCalledWith("");
  expect(toast).not.toHaveBeenCalled();
  clearInput.mockRestore();
});
