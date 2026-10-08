// features/mandates/runs/service.ts
//
// THE MANDATE RUNS DOORS — one stored run (left), the placement preview and the
// streamed test run / exact replay (right). Contract: "Mandate Runs" (owner
// session c00067c6, 2026-10-07). Placement is stored ONCE per run at
// chat.conversation.metadata.mandate_run.placement and is never re-derived
// here: every row this screen paints comes from the server's own trace.
//
// The four routes are new on aidream and not yet in the generated api-types,
// so `contractCall` is the ONE place their path is cast to the typed callApi
// config. When `pnpm sync-types` carries them, delete the cast and the helper.

import { callApi, type ApiCallConfig } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import { isJsonObject, type JsonObject, type JsonValue } from "@/types/json";
import type { TypedStreamEvent } from "@ai-matrx/agents/generated/stream-events";
import { streamErrorText } from "@ai-matrx/agents/matrx";
import { adoptForeignStream } from "@ai-matrx/chat/agents/redux/execution-system/thunks/adopt-foreign-stream";

// ── Shapes (the contract, verbatim field names) ──────────────────────────────

export type PlacementChannel = "variable" | "context" | "pinned_context" | "media" | "unconsumed";

export interface PlacementLanding {
  channel: PlacementChannel;
  target: string | null;
  joined: boolean;
}

export interface PlacementProvision {
  name: string;
  kind: string | null;
  supplied: boolean;
  /** Absent when a delivered copy is identical (`value_ref` names it). */
  value: JsonValue | undefined;
  truncated: boolean;
  valueRef: string | null;
  landed: PlacementLanding[];
}

export interface PlacementVariable {
  variable: string;
  verdict: string;
  codeName: string | null;
  message: string;
  caution: boolean;
  blocking: boolean;
  lossy: boolean;
}

export interface RunHolder {
  type: "agent" | "workflow";
  id: string | null;
  versionId: string | null;
}

export interface MandatePlacement {
  provisions: PlacementProvision[];
  variables: PlacementVariable[];
  settings: { modelId: string | null; configOverrides: JsonObject };
  holder: RunHolder;
  testRun: boolean;
  replayOf: string | null;
}

export interface PlacementProblem {
  severity: "error" | "warning";
  provision: string | null;
  variable: string | null;
  message: string;
}

export interface PlacementPreview {
  placement: MandatePlacement;
  problems: PlacementProblem[];
}

/** One supplied value as the run record holds it (value_ref already resolved). */
export interface RunProvisionValue {
  name: string;
  kind: string | null;
  value: JsonValue | undefined;
  truncated: boolean;
}

export interface StoredRun {
  conversationId: string;
  createdAt: string | null;
  ranBy: string | null;
  holder: RunHolder & { name: string | null; versionNumber: number | null };
  modelId: string | null;
  configOverrides: JsonObject;
  success: boolean | null;
  error: string | null;
  cost: number | null;
  durationMs: number | null;
  output: string | null;
  /** null = recorded before placement was saved. */
  placement: MandatePlacement | null;
  provisions: RunProvisionValue[];
  /** Old runs only: what the record delivered. */
  delivered: { variables: JsonObject; context: JsonObject; userInput: string | null } | null;
}

/** Variable fates the contract paints red. */
const PROBLEM_VERDICTS = new Set(["required_unmapped", "dropped", "type_mismatch"]);

export function verdictIsProblem(v: PlacementVariable): boolean {
  return v.blocking || v.lossy || PROBLEM_VERDICTS.has(v.verdict);
}

// ── Parsers: the answer is JSON; every field is narrowed, never cast ─────────

function str(v: JsonValue | undefined): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: JsonValue | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function obj(v: JsonValue | undefined): JsonObject {
  return isJsonObject(v) ? v : {};
}

function list(v: JsonValue | undefined): JsonValue[] {
  return Array.isArray(v) ? v : [];
}

const CHANNELS: readonly PlacementChannel[] = ["variable", "context", "pinned_context", "media", "unconsumed"];

function parseLanding(v: JsonValue): PlacementLanding | null {
  if (!isJsonObject(v)) return null;
  const channel = CHANNELS.find((c) => c === v.channel);
  if (!channel) return null;
  return { channel, target: str(v.target), joined: v.joined === true };
}

function parseProvision(v: JsonValue): PlacementProvision | null {
  if (!isJsonObject(v)) return null;
  const name = str(v.name);
  if (!name) return null;
  return {
    name,
    kind: str(v.kind),
    supplied: v.supplied !== false,
    value: "value" in v ? v.value : undefined,
    truncated: v.truncated === true,
    valueRef: str(v.value_ref),
    landed: list(v.landed).map(parseLanding).filter((l): l is PlacementLanding => l !== null),
  };
}

function parseVariable(v: JsonValue): PlacementVariable | null {
  if (!isJsonObject(v)) return null;
  const variable = str(v.variable);
  if (!variable) return null;
  return {
    variable,
    verdict: str(v.verdict) ?? "ok",
    codeName: str(v.code_name),
    message: typeof v.message === "string" ? v.message : "",
    caution: v.caution === true,
    blocking: v.blocking === true,
    lossy: v.lossy === true,
  };
}

function parseHolder(v: JsonValue | undefined): RunHolder {
  const h = obj(v);
  return {
    type: h.type === "workflow" ? "workflow" : "agent",
    id: str(h.id),
    versionId: str(h.version_id),
  };
}

export function parsePlacement(v: JsonValue | undefined): MandatePlacement | null {
  if (!isJsonObject(v)) return null;
  const settings = obj(v.settings);
  return {
    provisions: list(v.provisions).map(parseProvision).filter((p): p is PlacementProvision => p !== null),
    variables: list(v.variables).map(parseVariable).filter((p): p is PlacementVariable => p !== null),
    settings: { modelId: str(settings.model_id), configOverrides: obj(settings.config_overrides) },
    holder: parseHolder(v.holder),
    testRun: v.test_run === true,
    replayOf: str(v.replay_of),
  };
}

function parseProblem(v: JsonValue): PlacementProblem | null {
  if (!isJsonObject(v)) return null;
  const message = str(v.message);
  if (!message) return null;
  return {
    severity: v.severity === "warning" ? "warning" : "error",
    provision: str(v.provision),
    variable: str(v.variable),
    message,
  };
}

function parseStoredRun(conversationId: string, data: unknown): StoredRun {
  if (!isJsonObject(data as JsonValue)) throw new Error("The run answer was empty.");
  const d = data as JsonObject;
  const holder = obj(d.holder);
  const settings = obj(d.settings);
  const ranBy = isJsonObject(d.ran_by) ? (str(d.ran_by.name) ?? str(d.ran_by.id)) : str(d.ran_by);
  const delivered = isJsonObject(d.delivered)
    ? {
        variables: obj(d.delivered.variables),
        context: obj(d.delivered.context),
        userInput: str(d.delivered.user_input),
      }
    : null;
  const provisions: RunProvisionValue[] = [];
  for (const item of list(d.provisions)) {
    if (!isJsonObject(item)) continue;
    const name = str(item.name);
    if (!name) continue;
    provisions.push({
      name,
      kind: str(item.kind),
      value: "value" in item ? item.value : undefined,
      truncated: item.truncated === true,
    });
  }
  return {
    conversationId: str(d.conversation_id) ?? conversationId,
    createdAt: str(d.created_at),
    ranBy,
    holder: {
      ...parseHolder(d.holder),
      name: str(holder.name),
      versionNumber: num(holder.version_number),
    },
    modelId: str(settings.model_id) ?? str(d.model_id),
    configOverrides: obj(settings.config_overrides),
    success: typeof d.success === "boolean" ? d.success : null,
    error: str(d.error),
    cost: num(d.cost),
    durationMs: num(d.duration_ms),
    output: typeof d.output === "string" ? d.output : null,
    placement: parsePlacement(d.placement),
    provisions,
    delivered,
  };
}

// ── The calls ────────────────────────────────────────────────────────────────

interface ContractCall {
  path: string;
  method: "GET" | "POST";
  body?: JsonObject;
  stream?: boolean;
  consumeStream?: ApiCallConfig["consumeStream"];
}

function contractCall(dispatch: AppDispatch, call: ContractCall) {
  // CONTRACT ROUTES: not in the generated `paths` yet (see header).
  const config = {
    ...call,
    expectedErrorStatuses: [400, 401, 403, 404, 409, 422],
  } as unknown as ApiCallConfig<"/ai/mandates/{mandate_key}", "POST">;
  return dispatch(callApi(config));
}

const seg = encodeURIComponent;

export async function fetchStoredRun(dispatch: AppDispatch, conversationId: string): Promise<StoredRun> {
  const res = await contractCall(dispatch, { path: `/mandates/runs/${seg(conversationId)}`, method: "GET" });
  if (res.error) throw new Error(res.error.message || "The run could not be read.");
  return parseStoredRun(conversationId, res.data);
}

export interface TestHolder {
  type: "agent" | "workflow";
  id: string;
  version_id: string | null;
}

export async function previewPlacement(
  dispatch: AppDispatch,
  mandateKey: string,
  input: { provisions: JsonObject; holder: TestHolder; configOverrides: JsonObject },
): Promise<PlacementPreview> {
  const res = await contractCall(dispatch, {
    path: `/mandates/${seg(mandateKey)}/placement`,
    method: "POST",
    body: {
      provisions: input.provisions,
      holder: { ...input.holder },
      ...(Object.keys(input.configOverrides).length ? { config_overrides: input.configOverrides } : {}),
    },
  });
  if (res.error) throw new Error(res.error.message || "The placement could not be read.");
  const d = isJsonObject(res.data as JsonValue) ? (res.data as JsonObject) : {};
  const placement = parsePlacement(d.placement);
  if (!placement) throw new Error("The placement answer had no placement.");
  return {
    placement,
    problems: list(d.problems).map(parseProblem).filter((p): p is PlacementProblem => p !== null),
  };
}

export interface StreamedRun {
  ok: boolean;
  error: string | null;
  conversationId: string | null;
  durationMs: number;
}

async function streamContract(
  dispatch: AppDispatch,
  call: { path: string; body: JsonObject },
  onAdopted: (ids: { requestId: string; conversationId: string }) => void,
): Promise<StreamedRun> {
  const started = performance.now();
  let failure: string | null = null;
  let conversationId: string | null = null;
  const consumeStream = dispatch(
    adoptForeignStream({
      onAdopted: (ids) => {
        conversationId = ids.conversationId;
        onAdopted(ids);
      },
      onEvent: (event: TypedStreamEvent) => {
        if (event.event === "error") failure = streamErrorText(event) ?? "The run stopped.";
      },
    }),
  );
  const res = await contractCall(dispatch, {
    path: call.path,
    method: "POST",
    body: call.body,
    stream: true,
    consumeStream,
  });
  const durationMs = Math.round(performance.now() - started);
  if (res.error) return { ok: false, error: res.error.message || "The run did not start.", conversationId, durationMs };
  return { ok: failure === null, error: failure, conversationId, durationMs };
}

/** POST /ai/mandates/{key} with `test_holder` — stored as a test run. */
export function streamTestRun(
  dispatch: AppDispatch,
  mandateKey: string,
  input: { provisions: JsonObject; holder: TestHolder; configOverrides: JsonObject; userInput: string | null },
  onAdopted: (ids: { requestId: string; conversationId: string }) => void,
): Promise<StreamedRun> {
  return streamContract(
    dispatch,
    {
      path: `/ai/mandates/${seg(mandateKey)}`,
      body: {
        conversation_id: crypto.randomUUID(),
        is_new: true,
        store: true,
        stream: true,
        variables: input.provisions,
        ...(input.userInput ? { user_input: input.userInput } : {}),
        ...(Object.keys(input.configOverrides).length ? { config_overrides: input.configOverrides } : {}),
        test_holder: { ...input.holder },
      },
    },
    onAdopted,
  );
}

/** POST /mandates/runs/{id}/replay — same holder version, model, settings, values. */
export function streamReplay(
  dispatch: AppDispatch,
  conversationId: string,
  onAdopted: (ids: { requestId: string; conversationId: string }) => void,
): Promise<StreamedRun> {
  return streamContract(dispatch, { path: `/mandates/runs/${seg(conversationId)}/replay`, body: {} }, onAdopted);
}
