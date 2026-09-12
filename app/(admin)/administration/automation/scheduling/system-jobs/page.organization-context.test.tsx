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
import { renderToStaticMarkup } from "react-dom/server";

const listSystemTasks = jest.fn();
const listDbJobs = jest.fn();
const tableProps: Array<Record<string, unknown>> = [];

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
  MatrxDataTable: (props: Record<string, unknown>) => {
    tableProps.push(props);
    return (
      <div data-testid="table-row-count">
        {(props.data as unknown[]).length}
      </div>
    );
  },
}));

jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) =>
    children,
}));

jest.mock("@/features/scheduling/lib/admin-scheduling-scope", () => ({
  definedOnly: (value: unknown) => value,
  useAdminSchedulingScopeSlice: jest.fn(),
}));

jest.mock(
  "@/features/organizations/components/OrganizationRequiredNotice",
  () => ({
    OrganizationRequiredNotice: () => <div>Choose an organization</div>,
  }),
);

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
    tableProps.length = 0;
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

  it("keeps classification visible, searchable, and copyable for both job families", async () => {
    const taxonomyPath = [
      {
        id: "domain-agents",
        slug: "agents",
        name: "Agents",
        level: "domain",
        parent_id: null,
      },
      {
        id: "feature-runtime",
        slug: "execution-runtime",
        name: "Execution Runtime",
        level: "feature",
        parent_id: "domain-agents",
      },
    ];
    const systemJob = {
      id: "system-job",
      title: "Refresh summary",
      description: null,
      tool_name: "refresh_summary",
      enabled: true,
      handler_registered: true,
      handler_gate_pending: false,
      taxonomy_node_id: "feature-runtime",
      taxonomy_path: taxonomyPath,
      trigger: null,
      last_run: null,
    };
    const dbJob = {
      jobid: 25,
      jobname: "refresh_tool_refetch_summary",
      schedule: "17 * * * *",
      command: "REFRESH MATERIALIZED VIEW",
      active: true,
      taxonomy_node_id: "feature-runtime",
      taxonomy_path: taxonomyPath,
      last_run: null,
    };
    gate = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      canLoad: true,
      organizationRequired: false,
      resolving: false,
    };
    listSystemTasks.mockResolvedValue({
      tasks: [systemJob],
      taxonomy_nodes: taxonomyPath,
    });
    listDbJobs.mockResolvedValue({
      jobs: [dbJob],
      taxonomy_nodes: taxonomyPath,
    });

    await renderPage();

    const latestById = new Map<string, Record<string, unknown>>();
    for (const props of tableProps) {
      const id = (props.urlState as { id: string }).id;
      latestById.set(id, props);
    }
    const systemTable = latestById.get("scheduling-system-jobs")!;
    const dbTable = latestById.get("scheduling-db-jobs")!;

    for (const [props, row] of [
      [systemTable, systemJob],
      [dbTable, dbJob],
    ] as const) {
      const classification = (
        props.columns as Array<{
          id: string;
          accessorFn: (value: typeof row) => string;
          cell: (value: typeof row) => React.ReactNode;
        }>
      ).find((column) => column.id === "classification");
      expect(classification?.accessorFn(row)).toBe(
        "Agents / Execution Runtime",
      );
      const classificationMarkup = renderToStaticMarkup(
        <>{classification?.cell(row)}</>,
      );
      expect(classificationMarkup).toContain(
        'href="/administration/utilities/taxonomy?q=execution-runtime"',
      );
      expect(
        (props.toolbar as { searchPlaceholder: string }).searchPlaceholder,
      ).toMatch(/classification/i);
      expect(
        (props.copy as { humanRow: (value: typeof row) => string }).humanRow(
          row,
        ),
      ).toContain("Classification: Agents / Execution Runtime");
      expect(
        (
          props.copy as {
            rowAttributes: (value: typeof row) => Record<string, unknown>;
          }
        ).rowAttributes(row),
      ).toMatchObject({ taxonomy_node_id: "feature-runtime" });
    }
  });
});
