/**
 * features/scheduling/service/workflowTriggers.ts
 *
 * The Triggers manager's data: every live workflow trigger (cron, event,
 * webhook) joined with its cost rollup, plus the three controls — pause,
 * resume, archive (soft-delete). Both database calls are permission-checked in
 * the database: a platform admin sees and acts on every organization, an
 * organization admin only on their own.
 *
 * Costs, models, turns and the spend red flags come from automationCosts.ts —
 * the one rollup shared with the Costs tab — never recomputed here.
 */
import { supabase } from "@/utils/supabase/client";
import { schedulerDb } from "@/utils/supabase/schedulerDb";
import { pgErrorToError } from "@ai-matrx/data";
import {
  fetchAutomationCosts,
  type AutomationCostRow,
} from "@/features/scheduling/service/automationCosts";

export interface WorkflowTriggerOverview {
  trigger_id: string;
  kind: string;
  cron_expression: string | null;
  timezone: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  created_by_email: string | null;
  organization_id: string | null;
  definition_id: string | null;
  workflow_name: string | null;
  last_fired_at: string | null;
  next_run_at: string | null;
  fire_count: number;
  event_source: Record<string, unknown> | null;
}

export interface ManagedTrigger {
  overview: WorkflowTriggerOverview;
  /** The shared cost rollup row (always present for a live trigger). */
  cost: AutomationCostRow;
}

export type TriggerAction = "pause" | "resume" | "archive";

// The two RPCs were added after the generated types; call them through a
// minimal typed seam rather than casting the result.
interface LooseRpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: Parameters<typeof pgErrorToError>[0] | null }>;
}
const rpcClient = () => schedulerDb(supabase) as unknown as LooseRpcClient;

/** `orgId` null = every organization (platform admin, admin lane only). */
export async function fetchManagedTriggers(orgId: string | null): Promise<ManagedTrigger[]> {
  const [costs, overview] = await Promise.all([
    fetchAutomationCosts(orgId),
    rpcClient().rpc("workflow_trigger_overview", { p_org_id: orgId }),
  ]);
  if (overview.error) throw pgErrorToError(overview.error);
  const byId = new Map(
    costs.filter((c) => c.automation_kind === "workflow_trigger").map((c) => [c.automation_id, c]),
  );
  const list = (overview.data ?? []) as WorkflowTriggerOverview[];
  return list.map((o) => ({ overview: o, cost: byId.get(o.trigger_id) ?? emptyCost(o) }));
}

/** A trigger that has never run has no rollup row: say so with zeros, not a gap. */
function emptyCost(o: WorkflowTriggerOverview): AutomationCostRow {
  return {
    automation_kind: "workflow_trigger",
    automation_id: o.trigger_id,
    name: o.workflow_name ?? o.trigger_id,
    description: null,
    trigger_type: o.kind,
    trigger_config: o.cron_expression ? { cron: o.cron_expression, timezone: o.timezone } : null,
    enabled: o.is_active,
    approval: null,
    approved_by: null,
    approved_at: null,
    owner_user_id: o.created_by,
    owner_email: o.created_by_email,
    owner_is_platform_admin: false,
    organization_id: o.organization_id,
    organization_name: null,
    organization_is_system: false,
    workflow_definition_id: o.definition_id,
    runs: 0,
    runs_7d: 0,
    cost: 0,
    cost_7d: 0,
    last_run_at: null,
    last_run_cost: null,
    avg_run_cost: null,
    max_run_cost: null,
    est_monthly_cost: 0,
    avg_turns: 0,
    max_turns: 0,
    max_loop: 0,
    models: [],
    premium_models: [],
    agents: [],
    mandates: [],
  };
}

export async function setWorkflowTriggerState(triggerId: string, action: TriggerAction) {
  const { error } = await rpcClient().rpc("set_workflow_trigger_state", {
    p_trigger_id: triggerId,
    p_action: action,
  });
  if (error) throw pgErrorToError(error);
}

// ── Flags the spend board does not carry ────────────────────────────────────

export interface TriggerExtraFlag {
  id: "disposable" | "test_account" | "no_approval";
  label: string;
  detail: string;
  severity: "critical" | "warning";
}

const DISPOSABLE_NAME = /\[disposable\]|\bwalk\b|\btest\b|\bverify\b|\bdemo\b|\bscratch\b/i;
const TEST_ACCOUNT_EMAIL = /^(admin@admin\.com|test@test\.com)$/i;

export function triggerExtraFlags(t: ManagedTrigger): TriggerExtraFlag[] {
  const flags: TriggerExtraFlag[] = [];
  const name = t.cost.name;
  if (DISPOSABLE_NAME.test(name)) {
    flags.push({
      id: "disposable",
      label: "Disposable / test",
      detail: "The name looks like a test or throwaway trigger, yet it is firing on its own",
      severity: "critical",
    });
  }
  const email = t.overview.created_by_email ?? "";
  if (t.cost.owner_is_platform_admin || TEST_ACCOUNT_EMAIL.test(email)) {
    flags.push({
      id: "test_account",
      label: "Admin / test account",
      detail: `Runs as ${email || "an admin account"}; the spend lands on that account, not on the organization it serves`,
      severity: "warning",
    });
  }
  if (t.overview.is_active && !t.cost.approval && !t.cost.approved_by) {
    flags.push({
      id: "no_approval",
      label: "No approval",
      detail: "Firing on its own with no approval recorded on it",
      severity: "warning",
    });
  }
  return flags;
}

export const triggerManagerHref = (orgSlug?: string) =>
  orgSlug ? `/organizations/${orgSlug}/admin/triggers` : "/administration/automation/scheduling/triggers";
