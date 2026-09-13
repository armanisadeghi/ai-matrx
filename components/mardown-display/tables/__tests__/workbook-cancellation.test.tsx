import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const ensureOrganizationContext = jest.fn();
const isOrganizationSelectionCancelled = jest.fn();
const pushTableToWorkbook = jest.fn();
const pushToWorkbook = jest.fn();
const toastError = jest.fn();

jest.mock("@/lib/organization/organization-gate", () => ({
  ensureOrganizationContext: (...args: unknown[]) =>
    ensureOrganizationContext(...args),
  isOrganizationSelectionCancelled: (error: unknown) =>
    isOrganizationSelectionCancelled(error),
}));
jest.mock("@/features/data-tables/export-targets", () => ({
  pushTableToWorkbook: (...args: unknown[]) => pushTableToWorkbook(...args),
}));
jest.mock("@/features/page-extraction/data-review/export-targets", () => ({
  pushToWorkbook: (...args: unknown[]) => pushToWorkbook(...args),
  pushToDataset: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => jest.fn() }));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuSeparator: () => null,
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: (event: { preventDefault: () => void }) => void }) => (
    <button onClick={() => onSelect?.({ preventDefault: () => {} })}>{children}</button>
  ),
}));

import { SendToWorkbookButton } from "../SendToWorkbookButton";
import { CatalogRowActions } from "@/features/page-extraction/data-review/CatalogRowActions";
import { SendToMenu } from "@/features/page-extraction/data-review/SendToMenu";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

async function render(node: ReactNode) {
  await act(async () => root.render(node));
}

async function flush() {
  await act(async () => await Promise.resolve());
}

function cancelled() {
  const error = new Error("not now");
  error.name = "OrganizationSelectionCancelled";
  return error;
}

function clickByText(text: string) {
  const button = [...document.body.querySelectorAll<HTMLElement>("button")].find(
    (element) => element.textContent?.includes(text),
  );
  expect(button).toBeTruthy();
  act(() => button!.click());
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  jest.clearAllMocks();
  isOrganizationSelectionCancelled.mockImplementation(
    (error: unknown) => error instanceof Error && error.name === "OrganizationSelectionCancelled",
  );
  ensureOrganizationContext.mockRejectedValue(cancelled());
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("keeps the markdown table workbook action quiet when organization selection is cancelled", async () => {
  await render(<SendToWorkbookButton headers={["Amount"]} rows={[["12"]]} />);

  clickByText("Workbook");
  await flush();

  expect(pushTableToWorkbook).not.toHaveBeenCalled();
  expect(toastError).not.toHaveBeenCalled();
});

it("keeps the catalog workbook action quiet when organization selection is cancelled", async () => {
  await render(<CatalogRowActions jobId="job-1" rowCount={1} />);

  clickByText("Workbook");
  await flush();

  expect(pushToWorkbook).not.toHaveBeenCalled();
  expect(toastError).not.toHaveBeenCalled();
});

it("keeps the dataset Send to workbook action quiet when organization selection is cancelled", async () => {
  await render(
    <SendToMenu
      name="Quarterly report"
      columns={[{ key: "amount", label: "Amount" }]}
      rows={[{ amount: 12 }]}
    />,
  );

  clickByText("Workbook");
  await flush();

  expect(pushToWorkbook).not.toHaveBeenCalled();
  expect(toastError).not.toHaveBeenCalled();
});
