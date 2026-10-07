import { renderToStaticMarkup } from "react-dom/server";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";
import type { AgentUsageRow } from "@/features/agents/redux/usages/usages.types";
import type { ImpactVerdict } from "@/features/mandates/admin/impact";
import type { UnifiedUsageRow } from "../unified-rows";
import { AgentUsagesEngine } from "../AgentUsagesEngine";

let tableProps: MatrxDataTableProps<UnifiedUsageRow> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<UnifiedUsageRow>) => {
    tableProps = props;
    return null;
  },
}));
jest.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
}));
jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => ({ status: "idle" }),
}));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  recordToast: { success: jest.fn() },
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("@/features/agents/hooks/useAgentUsages", () => ({
  useAgentUsages: () => ({
    groups: [{ items: [immutableUsage, eligibleUsage] }],
    aggregates: [],
    loading: false,
    refresh: jest.fn(),
  }),
}));
jest.mock("@/features/agents/redux/usages/usages.thunks", () => ({
  updateAllUsagesToActive: jest.fn(),
  updateUsageToActive: jest.fn(),
}));
jest.mock("@/features/agents/redux/usages/usages.selectors", () => ({
  makeSelectRowMutation: jest.fn(),
  selectBulkState: () => ({ status: "idle" }),
}));
jest.mock("@/features/mandates/admin/impact-cells", () => ({
  VerdictDetail: () => null,
}));
jest.mock("@/features/mandates/admin/impact-advance", () => ({
  useImpactAdvance: () => ({
    batches: [],
    busy: null,
    advance: jest.fn(),
    revert: jest.fn(),
  }),
}));
jest.mock("@/features/overlays/openers/impactBatchWindow", () => ({
  useOpenImpactBatchWindow: () => jest.fn(),
}));
jest.mock("@/features/mandates/candidate-dialog/TryAsCandidateButton", () => ({
  TryAsCandidateButton: () => null,
}));
jest.mock("../NotifyOwnerDialog", () => ({ NotifyOwnerDialog: () => null }));
jest.mock("../UsageKpiStrip", () => ({
  UsageKpiStrip: () => null,
  HistoryDetail: () => null,
  useHistoryCounts: () => ({}),
}));
jest.mock("../UsageNameCell", () => ({ UsageNameCell: () => null }));
jest.mock("../UsageRowDetail", () => ({ UsageRowDetail: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({
  ErrorAlchemyMenu: () => null,
}));

const immutableUsage = {
  rowKind: "usage",
  usageType: "shortcut",
  usageId: "immutable",
  nodeId: null,
  label: "Immutable shortcut",
  ownerUserId: null,
  organizationId: null,
  organizationName: null,
  orgManagerUserIds: [],
  agentId: "agent-1",
  agentName: "Agent",
  currentVersion: 2,
  pinMode: "pinned",
  pinnedVersionId: "v1",
  pinnedVersionNumber: 1,
  versionsBehind: 1,
  stalePin: true,
  isUsageActive: true,
  worstSeverity: "info",
  findings: [],
  config: null,
  managedByCaller: false,
  usageUpdatedAt: null,
} satisfies AgentUsageRow;

const eligibleUsage = {
  ...immutableUsage,
  usageId: "eligible",
  label: "Eligible shortcut",
  managedByCaller: true,
};

const immutableMandate = {
  holder_kind: "mandate_default",
  row_id: "immutable-mandate",
  mandate_key: "mandate.immutable",
  principal: { kind: "org", organization_id: "org-1", subject_user_id: null },
  agent_id: "agent-1",
  agent_name: "Agent",
  lineage_path: [],
  pinned_version_id: null,
  pinned_version_number: null,
  latest_version_id: "v2",
  latest_version_number: 2,
  grade: "green",
  blocker: "tracks_latest",
  set_aside_reason: null,
  findings: [],
  settings_drift: { capability_checked: true, capability: [], keys: [] },
  changed_columns: [],
  apply_token: {
    holder_kind: "mandate_default",
    row_id: "immutable-mandate",
    expected_pinned_version_id: null,
    target_version_id: null,
  },
  auto_advance_eligible: false,
} satisfies ImpactVerdict;

const eligibleMandate = {
  ...immutableMandate,
  row_id: "eligible-mandate",
  mandate_key: "mandate.eligible",
  blocker: null,
  pinned_version_id: "v1",
  pinned_version_number: 1,
  apply_token: {
    holder_kind: "mandate_default",
    row_id: "eligible-mandate",
    expected_pinned_version_id: "v1",
    target_version_id: "v2",
  },
} satisfies ImpactVerdict;

jest.mock("../useAgentMandateImpact", () => ({
  useAgentMandateImpact: () => ({
    impact: {
      verdicts: [immutableMandate, eligibleMandate],
      withheldSentences: [],
    },
    loading: false,
    refresh: jest.fn(),
  }),
}));

describe("AgentUsagesEngine selection", () => {
  beforeEach(() => {
    tableProps = null;
  });

  it("keeps selection controlled for immutable rows and only exposes moves for eligible targets", () => {
    renderToStaticMarkup(<AgentUsagesEngine agentId="agent-1" mode="user" />);
    if (!tableProps?.selection)
      throw new Error("Expected controlled selection");
    expect(tableProps.selection.isRowSelectable).toBeUndefined();
    expect(tableProps.selection.selectedIds).toEqual([]);

    const rows = tableProps.data;
    const immutableOnly = tableProps.selection.actions?.(
      rows.filter((row) => row.id.includes("immutable")),
      rows.filter((row) => row.id.includes("immutable")).map((row) => row.id),
    );
    expect(renderToStaticMarkup(<>{immutableOnly}</>)).not.toContain("Move ");

    const mixed = tableProps.selection.actions?.(
      rows,
      rows.map((row) => row.id),
    );
    expect(renderToStaticMarkup(<>{mixed}</>)).toContain("Move 1 mandate pin");
    expect(renderToStaticMarkup(<>{mixed}</>)).toContain("Move 1 usage");
    expect(renderToStaticMarkup(<>{mixed}</>)).not.toContain(
      "Move 2 mandate pin",
    );
    expect(renderToStaticMarkup(<>{mixed}</>)).not.toContain("Move 2 usages");
  });
  it("hands the shared table icon descriptors for the mandate move and candidate actions", () => {
    renderToStaticMarkup(<AgentUsagesEngine agentId="agent-1" mode="user" />);
    if (!tableProps?.rowActions) throw new Error("Missing standard icon actions");
    const eligible = tableProps.data.find((row) => row.verdict?.row_id === "eligible-mandate");
    const immutable = tableProps.data.find((row) => row.verdict?.row_id === "immutable-mandate");
    if (!eligible || !immutable) throw new Error("Missing mandate usage fixtures");
    const actions = tableProps.rowActions(eligible, {} as never);
    expect(actions.map((action) => action.id)).toEqual(expect.arrayContaining(["advance", "candidate"]));
    expect(actions.find((action) => action.id === "candidate")?.label).toBe("Try as candidate");
    for (const action of actions) {
      expect(action.icon).toBeDefined();
      expect(action.onClick).toEqual(expect.any(Function));
      expect(action).not.toHaveProperty("children");
      expect(action).not.toHaveProperty("render");
    }
    expect(tableProps.rowActions(immutable, {} as never).map((action) => action.id)).not.toContain("advance");
  });

});

jest.mock("@/features/mandates/candidate-dialog/SetCandidateDialog", () => ({ SetCandidateDialog: () => null }));
