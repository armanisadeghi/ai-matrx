/**
 * Regression for the cold-boot organization race on the System Jobs page.
 *
 * The page owns when its two org-scoped transports run. Redux and the network
 * are external dependencies: this test holds boot unresolved, then supplies
 * an organization, and requires both requests to start only after admission.
 * A page that fires on mount fails the first assertion; a page that merely
 * waits forever fails the second.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const listSystemTasks = jest.fn();
const listDbJobs = jest.fn();

let gate = {
  organizationId: null as string | null,
  canLoad: false,
  organizationRequired: false,
  resolving: true,
};

jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => gate,
}));

jest.mock("@/features/scheduling/service/schedulerClient", () => ({
  listSystemTasks: (...args: unknown[]) => listSystemTasks(...args),
  listDbJobs: (...args: unknown[]) => listDbJobs(...args),
  patchDbJob: jest.fn(),
  patchSystemTask: jest.fn(),
  runSystemTaskNow: jest.fn(),
}));

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: ({ data }: { data: unknown[] }) => (
    <div data-testid="table-row-count">{data.length}</div>
  ),
}));

jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/features/scheduling/lib/admin-scheduling-scope", () => ({
  definedOnly: (value: unknown) => value,
  useAdminSchedulingScopeSlice: jest.fn(),
}));

jest.mock("@/features/organizations/components/OrganizationRequiredNotice", () => ({
  OrganizationRequiredNotice: () => <div>Choose an organization</div>,
}));

import SystemJobsPage from "./page";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

async function renderPage(): Promise<void> {
  await act(async () => {
    root.render(<SystemJobsPage />);
    await Promise.resolve();
  });
}

describe("SystemJobsPage organization admission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    gate = {
      organizationId: null,
      canLoad: false,
      organizationRequired: false,
      resolving: true,
    };
    listSystemTasks.mockResolvedValue({ tasks: [] });
    listDbJobs.mockResolvedValue({ jobs: [] });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("waits through cold boot, then loads both job registries when the org arrives", async () => {
    await renderPage();

    expect(listSystemTasks).not.toHaveBeenCalled();
    expect(listDbJobs).not.toHaveBeenCalled();

    gate = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      canLoad: true,
      organizationRequired: false,
      resolving: false,
    };
    await renderPage();

    expect(listSystemTasks).toHaveBeenCalledTimes(1);
    expect(listDbJobs).toHaveBeenCalledTimes(1);
  });

  it("reloads both registries when the selected organization changes", async () => {
    gate = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      canLoad: true,
      organizationRequired: false,
      resolving: false,
    };
    await renderPage();
    expect(listSystemTasks).toHaveBeenCalledTimes(1);

    gate = {
      organizationId: "22222222-2222-4222-8222-222222222222",
      canLoad: true,
      organizationRequired: false,
      resolving: false,
    };
    await renderPage();

    expect(listSystemTasks).toHaveBeenCalledTimes(2);
    expect(listDbJobs).toHaveBeenCalledTimes(2);
  });
});
