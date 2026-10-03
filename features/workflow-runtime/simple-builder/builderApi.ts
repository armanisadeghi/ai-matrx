// features/workflow-runtime/simple-builder/builderApi.ts
//
// THE SIMPLE WORKFLOW BUILDER'S DOORS — aidream `/workflow-builder/*` (lane 11 wave 2;
// aidream `aidream/api/routers/workflow_builder.py`). Every call goes through `callApi`, the
// canonical transport, with the TABLE'S organization as the call's scope (never the active one).
//
// 🚨 LOCAL PATH LITERALS — delete the casts on the next `@ai-matrx/agents` release. The routes
// are in aidream's regenerated contract (commits 8c0cf0ea0e, dab3b103c1) but the package that
// carries it to this app was not on npm yet. `as keyof paths` is the repo's precedent for exactly
// this window (`MANDATE_DEFAULT_HOLDER_PATH`). The shapes below mirror the generated schemas
// `BuilderSpecView`, `TableWorkflows`, `BuilderRuns`, `PublishedBuilder`, `OnOff`,
// `FireResponse`; swap them for `components["schemas"][…]` aliases then.

import type { paths } from "@ai-matrx/agents/generated/api-types";
import { callApi } from "@/lib/api/call-api";
import { parseCallApiError } from "@/lib/api/errors";
import type { AppDispatch } from "@/lib/redux/store";
import type { BuilderSpec } from "./builderSpec";

const P = {
  create: "/workflow-builder/workflows" as keyof paths,
  one: "/workflow-builder/workflows/{workflow_id}" as keyof paths,
  publish: "/workflow-builder/workflows/{workflow_id}/publish" as keyof paths,
  on: "/workflow-builder/workflows/{workflow_id}/on" as keyof paths,
  off: "/workflow-builder/workflows/{workflow_id}/off" as keyof paths,
  test: "/workflow-builder/workflows/{workflow_id}/test" as keyof paths,
  runs: "/workflow-builder/workflows/{workflow_id}/runs" as keyof paths,
  recordRuns: "/workflow-builder/records/{record_id}/runs" as keyof paths,
  tableWorkflows:
    "/workflow-builder/tables/{table_id}/workflows" as keyof paths,
};

export interface BuilderView {
  workflow_id: string;
  name: string;
  version: number;
  updated_at?: string | null;
  table_id?: string | null;
  spec?: BuilderSpec | null;
  detached?: boolean;
  detached_says?: string | null;
  trigger_id?: string | null;
  is_on?: boolean;
  bound_version_id?: string | null;
  /** Whether this reader may change it; `can_edit_says` is why not. */
  can_edit?: boolean;
  can_edit_says?: string | null;
}

export type TableWorkflowKind =
  | "agent_on_change"
  | "button"
  | "digest"
  | "enrich"
  | "notify"
  | "stage_rule"
  | "webhook"
  | "workflow";

export interface TableWorkflowRow {
  kind: TableWorkflowKind;
  name: string;
  is_on: boolean;
  last_run_at?: string | null;
  /** `{editor, …ids}` — the existing editor that opens this row. */
  open: Record<string, unknown>;
}

export interface TableWorkflowList {
  table_id: string;
  workflows: TableWorkflowRow[];
  /** Features whose list could not be read (their names). */
  unavailable?: string[];
}

export type RunStepStatus =
  | "done"
  | "failed"
  | "waiting_for_approval"
  | "waiting"
  | "condition_not_met"
  | "stopped_loop_cap"
  | "off";

export interface RunStep {
  node_id: string;
  label: string;
  status: RunStepStatus;
  status_label: string;
  says?: string | null;
}

export interface BuilderRun {
  run_id?: string | null;
  workflow_id?: string | null;
  record_id?: string | null;
  status: string;
  status_label: string;
  started_at?: string | null;
  finished_at?: string | null;
  says?: string | null;
  steps: RunStep[];
}

/** A refusal in the server's own words, plus its per-field issues on a 422. */
export class BuilderRefusal extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null,
    readonly issues: { field: string; says: string }[],
  ) {
    super(message);
  }
}

function refusalOf(error: {
  message: string;
  status?: number;
  serverDetail?: unknown;
  code?: string;
}): BuilderRefusal {
  const parsed = parseCallApiError(error);
  const detail = (error.serverDetail ?? null) as { detail?: unknown } | null;
  const body = (
    detail && typeof detail === "object" && "detail" in detail
      ? detail.detail
      : detail
  ) as { error?: unknown; user_message?: unknown; issues?: unknown } | null;
  const sentence =
    body && typeof body === "object" && typeof body.user_message === "string"
      ? body.user_message
      : parsed.userMessage;
  const issues = Array.isArray(body?.issues)
    ? (body.issues as unknown[]).filter(
        (i): i is { field: string; says: string } =>
          !!i &&
          typeof (i as { field?: unknown }).field === "string" &&
          typeof (i as { says?: unknown }).says === "string",
      )
    : [];
  const code =
    body && typeof body.error === "string" ? body.error : (error.code ?? null);
  return new BuilderRefusal(sentence, error.status ?? null, code, issues);
}

// The statuses the builder answers in sentences the screen shows (owner edits, detached, a
// refused spec, not found). They are outcomes, not incidents.
const EXPECTED = [400, 403, 404, 409, 422] as const;

async function call<T>(
  dispatch: AppDispatch,
  organizationId: string,
  config: {
    path: keyof paths;
    method: "GET" | "POST" | "PUT";
    pathParams?: Record<string, string>;
    queryParams?: Record<string, string | number | boolean>;
    body?: Record<string, unknown>;
  },
): Promise<T> {
  const result = await dispatch(
    callApi({
      path: config.path,
      method: config.method as never,
      ...(config.pathParams ? { pathParams: config.pathParams as never } : {}),
      ...(config.queryParams ? { queryParams: config.queryParams } : {}),
      ...(config.body ? { body: config.body as never } : {}),
      scopeOverrides: { organization_id: organizationId },
      // The builder's reads compose several store reads per Workflow; a test fire waits for
      // the run to be accepted. Both outlast the 15 s default on a busy server.
      connectTimeoutMs: 60_000,
      totalTimeoutMs: 90_000,
      expectedErrorStatuses: EXPECTED,
    }),
  );
  if (result.error) throw refusalOf(result.error);
  return result.data as T;
}

export function listTableWorkflows(
  dispatch: AppDispatch,
  organizationId: string,
  tableId: string,
) {
  return call<TableWorkflowList>(dispatch, organizationId, {
    path: P.tableWorkflows,
    method: "GET",
    pathParams: { table_id: tableId },
    queryParams: { organization_id: organizationId },
  });
}

export function readBuilderWorkflow(
  dispatch: AppDispatch,
  organizationId: string,
  workflowId: string,
) {
  return call<BuilderView>(dispatch, organizationId, {
    path: P.one,
    method: "GET",
    pathParams: { workflow_id: workflowId },
  });
}

export function createBuilderWorkflow(
  dispatch: AppDispatch,
  organizationId: string,
  name: string,
  spec: BuilderSpec,
) {
  return call<BuilderView>(dispatch, organizationId, {
    path: P.create,
    method: "POST",
    body: { name, spec, organization_id: organizationId },
  });
}

export function saveBuilderWorkflow(
  dispatch: AppDispatch,
  organizationId: string,
  workflowId: string,
  spec: BuilderSpec,
  name: string,
  expectedUpdatedAt: string | null | undefined,
) {
  return call<BuilderView>(dispatch, organizationId, {
    path: P.one,
    method: "PUT",
    pathParams: { workflow_id: workflowId },
    body: {
      spec,
      name,
      ...(expectedUpdatedAt ? { expected_updated_at: expectedUpdatedAt } : {}),
    },
  });
}

/** "Turn on" is ONE press for the person: publish, then bind that exact version. */
export async function turnBuilderWorkflowOn(
  dispatch: AppDispatch,
  organizationId: string,
  workflowId: string,
) {
  const published = await call<{ published_version_id: string | null }>(
    dispatch,
    organizationId,
    {
      path: P.publish,
      method: "POST",
      pathParams: { workflow_id: workflowId },
      body: {},
    },
  );
  if (!published.published_version_id) {
    throw new BuilderRefusal(
      "This Workflow couldn't be published.",
      null,
      "not_published",
      [],
    );
  }
  return call<{ is_on: boolean }>(dispatch, organizationId, {
    path: P.on,
    method: "POST",
    pathParams: { workflow_id: workflowId },
    body: { published_version_id: published.published_version_id },
  });
}

export function turnBuilderWorkflowOff(
  dispatch: AppDispatch,
  organizationId: string,
  workflowId: string,
) {
  return call<{ is_on: boolean }>(dispatch, organizationId, {
    path: P.off,
    method: "POST",
    pathParams: { workflow_id: workflowId },
    body: {},
  });
}

export function testBuilderWorkflow(
  dispatch: AppDispatch,
  organizationId: string,
  workflowId: string,
  recordId: string,
) {
  return call<{ run_id: string }>(dispatch, organizationId, {
    path: P.test,
    method: "POST",
    pathParams: { workflow_id: workflowId },
    body: { record_id: recordId },
  });
}

export function listBuilderRuns(
  dispatch: AppDispatch,
  organizationId: string,
  workflowId: string,
) {
  return call<{ runs: BuilderRun[] }>(dispatch, organizationId, {
    path: P.runs,
    method: "GET",
    pathParams: { workflow_id: workflowId },
  });
}

export function listRecordRuns(
  dispatch: AppDispatch,
  organizationId: string,
  recordId: string,
) {
  return call<{ runs: BuilderRun[] }>(dispatch, organizationId, {
    path: P.recordRuns,
    method: "GET",
    pathParams: { record_id: recordId },
    queryParams: { organization_id: organizationId },
  });
}
