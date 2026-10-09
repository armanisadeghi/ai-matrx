"use client";

import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";
import { normalizeTransferJson } from "@ai-matrx/alchemy/operate";
import { useMandateAlchemyTabCapture } from "../workspace/MandateAlchemy";
import { storedMandateKey } from "@ai-matrx/agents/mandates";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, FlaskConical, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PropertyRow,
  CONFIGURATION_CHOICE_SIZE,
  ConfigurationTable,
  ConfigurationTableRow,
  FieldHelp,
  StatusToken,
} from "@ai-matrx/design-system/controls";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { VariableInputComponent } from "@ai-matrx/chat/agents/components/inputs/input-components/VariableInputComponent";
import { fetchAgentExecutionMinimal } from "@ai-matrx/chat/agents/redux/agent-definition/thunks";
import { selectAgentExecutionPayload } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import type {
  VariableCustomComponent,
  VariableDefinition,
} from "@ai-matrx/chat/agents/types/agent-definition.types";
import {
  holderOfMandate,
  type HolderRef,
} from "@/lib/supabase/mandateStorage";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { adminDoorOpen } from "@/lib/api/adminDoor";
import { toast } from "@/lib/toast";
import { isJsonObject, type JsonObject, type JsonValue } from "@/types/json";
import { OutputPreview } from "./bench-output-preview";
import {
  describeMandateRunFailure,
  readMandateRunHolder,
  runMandateAdHocTest,
  type MandateRunFailure,
  type MandateTestResponse,
} from "@/features/mandates/test-run";
import { useMandateInputSurface } from "@/features/mandates/input-surface";
import {
  MEDIA_VALUE_KINDS,
  SCALAR_VALUE_KINDS,
  kindPhrase,
} from "@/features/mandates/provision-shapes";
import type { ServedInput } from "@/features/workflow-runtime/served-form/served-input";
import { RunFailureCard } from "@ai-matrx/chat/mandates/RunFailureCard";
import { ServerNotes } from "@/components/official/ServerNotes";
import {
  fetchVersionVariableDefinitions,
  saveAdHocResultAsExemplar,
  type MandateDefinitionRow,
} from "./service";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ProJsonTextarea } from "@/components/official/ProJsonTextarea";
import { AgentSamplesManager } from "@/features/agents/components/samples/AgentSamplesManager";
import {
  sampleAttachmentParts,
  sampleInputText,
  type AgentSampleRow,
} from "@/features/agents/samples/service";
import { resolveMandate } from "@ai-matrx/chat/mandates/service";
import { sampleInputsForMandate } from "./sample-inputs";
import { useAgentLauncher } from "@ai-matrx/chat/agents/hooks/useAgentLauncher";
import { formatCount, formatDurationMs } from "@ai-matrx/kit/format";
import { costWords } from "@/features/mandates/run-history/format";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { ErrorNotice } from "@ai-matrx/design-system";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { humanizeIdentifier, displayLabel } from "@ai-matrx/kit/text-case";

interface CompletedRun {
  result: MandateTestResponse;
  variables: JsonObject;
  userInput: string | null;
}
const INPUT_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "value", label: "Value" },
  { key: "source", label: "Source" },
];
const RESULT_COLUMNS = [
  { key: "status", label: "Status" },
  { key: "structure", label: "Structure" },
  { key: "duration", label: "Duration" },
  { key: "cost", label: "Cost" },
  { key: "tokens", label: "Tokens" },
  { key: "ran", label: "Ran" },
];
const APPLIED_OVERRIDE_COLUMNS = [
  { key: "setting", label: "Applied override" },
  { key: "value", label: "Value" },
];
const ORIGIN_LABEL: Record<ServedInput["origin"], string> = {
  provision: "Provision",
  mandate_input: "Mandate",
  holder: "Mandate Holder",
  variable: "Variable declaration",
  field: "Field declaration",
  binding_prompt: "Binding",
};
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function isBlank(value: unknown): boolean {
  return (
    value == null ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && !value.length) ||
    (isJsonObject(value) && !Object.keys(value).length)
  );
}
function componentForKind(kind: string): VariableCustomComponent | undefined {
  if (kind === "number" || kind === "integer") return { type: "number" };
  if (kind === "boolean") return { type: "toggle" };
  if (kind === "markdown") return { type: "markdown" };
  if (kind === "file" || kind === "file_list") return { type: "document" };
  return undefined;
}

/** One ad-hoc bench form. Served inputs are authoritative; holder declarations
 * supply rich controls only. Saving always uses the completed run's snapshot. */
export function TryItNowPanel({
  mandate,
  effectiveHolder,
  defaultAgentId,
  onSavedTestCase,
  allowPrincipalSelection = false,
  consumptionMap,
}: {
  /** Explicitly opt in on a host that supports testing another principal. */
  allowPrincipalSelection?: boolean;
  consumptionMap?: unknown;
  mandate: MandateDefinitionRow;
  /**
   * The Holder actually in force for this bench — a binding's Holder when one
   * answers, otherwise the mandate's own. The bench used to express this by
   * building a mandate row with the three `default_holder_*` columns
   * overwritten; that literal is the write shape `default-holder-has-one-road`
   * forbids in client code, so the Holder travels as a Holder.
   */
  effectiveHolder?: HolderRef;
  defaultAgentId: string | null;
  passesUserInput: boolean | undefined;
  onSavedTestCase: () => void;
}) {
  const { unit: costUnit, rate: costRate } = useCostDisplay();
  const dispatch = useAppDispatch();
  const { launchMandate } = useAgentLauncher();
  const [testMode, setTestMode] = useState<"server" | "display">("server");
  // THE ADMIN SEAT (Arman, 2026-09-26): in the admin section nobody acts as
  // themselves, so the "My display preview" (the signed-in admin's own
  // resolved Holder) is not offered there — the bench tests the record's
  // system default only.
  const adminSeat = adminDoorOpen();
  const viewerUserId = useAppSelector(selectUserId);
  // The org this test RUNS UNDER goes on the wire (principal.organization_id),
  // so it must be the org the transport itself would send — the EXPLICIT
  // selection. The effective selector could hand the personal org to a request
  // the transport refuses, which is the "the header says I have an org but
  // nothing loads" class (2026-09-12). Boot now always ends with a selection.
  const viewerOrgId = useAppSelector(selectOrganizationId);
  const [testContext, setTestContext] = useState<"system" | "viewer">("system");
  const surfaceState = useMandateInputSurface(storedMandateKey(mandate.mandate_key));
  const surface = surfaceState.status === "ready" ? surfaceState.surface : null;
  const fields = surface?.inputs ?? [];
  const pinnedVersionId = (effectiveHolder ?? holderOfMandate(mandate))
    .versionId;
  const execution = useAppSelector((state) =>
    defaultAgentId ? selectAgentExecutionPayload(state, defaultAgentId) : null,
  );
  const [versionDefinitions, setVersionDefinitions] = useState<{
    id: string;
    definitions: VariableDefinition[];
  } | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [userInput, setUserInput] = useState("");
  const sampleRequest = useRef(0);
  const [sampleSource, setSampleSource] = useState<{
    agentId: string;
    map: unknown;
  } | null>(null);
  const [readingSamples, setReadingSamples] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState<CompletedRun | null>(null);
  const [failure, setFailure] = useState<MandateRunFailure | null>(null);
  useEffect(() => {
    sampleRequest.current += 1;
    setSampleSource(null);
    setSampleError(null);
    setReadingSamples(false);
  }, [
    defaultAgentId,
    consumptionMap,
    testContext,
    testMode,
    viewerOrgId,
    mandate.id,
  ]);
  const [saveLabel, setSaveLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!defaultAgentId) return;
    dispatch(fetchAgentExecutionMinimal(defaultAgentId))
      .unwrap()
      .catch((error: unknown) =>
        toast.error(`Input controls unavailable: ${describeError(error)}`),
      );
  }, [defaultAgentId, dispatch]);
  useEffect(() => {
    if (!pinnedVersionId) return;
    let cancelled = false;
    fetchVersionVariableDefinitions(pinnedVersionId)
      .then((definitions) => {
        if (!cancelled)
          setVersionDefinitions({
            id: pinnedVersionId,
            definitions: definitions ?? [],
          });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          toast.error(
            `Pinned input controls unavailable: ${describeError(error)}`,
          );
      });
    return () => {
      cancelled = true;
    };
  }, [pinnedVersionId]);
  const agentDefinitions = pinnedVersionId
    ? versionDefinitions?.id === pinnedVersionId
      ? versionDefinitions.definitions
      : []
    : (execution?.variableDefinitions ?? []);
  function currentValue(field: ServedInput): unknown {
    return values[field.name] ?? "";
  }
  function buildVariables(): JsonObject {
    const variables: JsonObject = {};
    for (const field of fields) {
      if (field.pinned) continue;
      const value = currentValue(field);
      if (isBlank(value)) {
        if (field.sourcing !== "optional")
          throw new Error(
            `${displayLabel(field.label === field.name ? undefined : field.label, field.name)} is required.`,
          );
        continue;
      }
      const structured =
        !SCALAR_VALUE_KINDS.has(field.kind) &&
        !MEDIA_VALUE_KINDS.has(field.kind);
      try {
        variables[field.name] =
          structured && typeof value === "string"
            ? (JSON.parse(value) as JsonValue)
            : (JSON.parse(JSON.stringify(value)) as JsonValue);
      } catch {
        throw new Error(
          `${displayLabel(field.label === field.name ? undefined : field.label, field.name)} requires a valid ${structured ? "JSON value" : "value"}.`,
        );
      }
    }
    return variables;
  }
  async function openSamples() {
    const request = ++sampleRequest.current;
    setReadingSamples(true);
    setSampleError(null);
    try {
      if (
        testMode === "display" ||
        (allowPrincipalSelection && testContext === "viewer")
      ) {
        const resolved = await resolveMandate(
          storedMandateKey(mandate.mandate_key),
        );
        if (request !== sampleRequest.current) return;
        setSampleSource({
          agentId: resolved.agentId,
          map: resolved.consumptionMap,
        });
      } else if (defaultAgentId)
        setSampleSource({ agentId: defaultAgentId, map: consumptionMap });
      else throw new Error("Assign an agent before choosing its samples.");
    } catch (error) {
      if (request === sampleRequest.current)
        setSampleError(describeError(error));
    } finally {
      if (request === sampleRequest.current) setReadingSamples(false);
    }
  }
  function fillSample(sample: AgentSampleRow) {
    try {
      if (!sampleSource || sample.agent_id !== sampleSource.agentId)
        throw new Error("The selected Mandate Holder changed. Reopen its samples.");
      if (sampleAttachmentParts(sample).length)
        throw new Error(
          "This sample contains attachments. The mandate test endpoint cannot accept those message parts yet; no inputs were changed.",
        );
      const { values: next, skipped } = sampleInputsForMandate(
        sample,
        mandate.id,
        fields,
        sampleSource?.map,
      );
      const text = sampleInputText(sample);
      if (text && !surface?.acceptsUserInput)
        throw new Error(
          "This sample includes a user message that this mandate does not accept. No inputs were changed.",
        );
      if (!Object.keys(next).length && !(surface?.acceptsUserInput && text))
        throw new Error(
          "No sample values map to this mandate's editable inputs. Check Provision Mapping or use the sample preview.",
        );
      setValues((current) => ({ ...current, ...next }));
      if (surface?.acceptsUserInput) setUserInput(text);
      setSampleSource(null);
      setSampleError(null);
      if (skipped.length)
        toast.info(
          `Filled ${Object.keys(next).length} inputs. Not used: ${skipped.map((name) => (humanizeIdentifier(name) || name)).join(", ")}. Review before running.`,
        );
      else toast.success("Sample filled. Review inputs before running.");
    } catch (error) {
      setSampleError(describeError(error));
    }
  }
  async function run() {
    if (!surface) return;
    let variables: JsonObject;
    try {
      variables = buildVariables();
    } catch (error) {
      toast.error(describeError(error));
      return;
    }
    const message =
      surface.acceptsUserInput && userInput.trim() ? userInput : null;
    setRunning(true);
    setCompleted(null);
    setFailure(null);
    try {
      if (testMode === "display") {
        await launchMandate(storedMandateKey(mandate.mandate_key), {
          surfaceKey: `mandate-test:${mandate.mandate_key}`,
          sourceFeature: "agent-runner",
          apiEndpointMode: "agent",
          runtime: {
            variables,
            userInput: message ?? undefined,
            surfaceName: null,
          },
        });
        return;
      }
      const result = await runMandateAdHocTest(
        dispatch,
        storedMandateKey(mandate.mandate_key),
        {
          variables,
          userInput: message,
          candidate: {
            candidate_id: crypto.randomUUID(),
            label:
              testContext === "system"
                ? "System default"
                : "My effective Mandate Holder",
            selection: "current",
          },
          ...(testContext === "viewer"
            ? {
                principal: {
                  user_id: viewerUserId,
                  organization_id: viewerOrgId,
                },
              }
            : {}),
        },
      );
      setCompleted({ result, variables, userInput: message });
      if (result.error) toast.error(`Test failed: ${result.error}`);
    } catch (error: unknown) {
      setFailure(describeMandateRunFailure(error));
      toast.error(`Test failed: ${describeError(error)}`);
    } finally {
      setRunning(false);
    }
  }
  async function saveAsTestCase() {
    if (!completed || completed.result.error) return;
    setSaving(true);
    try {
      await saveAdHocResultAsExemplar({
        mandate,
        label: saveLabel.trim() || "First test case",
        variables: completed.variables,
        userInput: completed.userInput,
        result: completed.result,
      });
      setCompleted(null);
      setSaveLabel("");
      onSavedTestCase();
      toast.success("Test case and reference saved.");
    } catch (error: unknown) {
      toast.error(`Test case could not be saved: ${describeError(error)}`);
    } finally {
      setSaving(false);
    }
  }
  const result = completed?.result;
  const runHolder = result ? readMandateRunHolder(result) : null;
  const ranAgentId = result?.definition_agent_id ?? result?.agent_id;
  const structure = result?.structural;
  let inputsChanged = false;
  if (completed) {
    try {
      inputsChanged =
        JSON.stringify(buildVariables()) !==
          JSON.stringify(completed.variables) ||
        (surface?.acceptsUserInput && userInput.trim() ? userInput : null) !==
          completed.userInput;
    } catch {
      inputsChanged = true;
    }
  }

  useMandateAlchemyTabCapture("test", {
    status: "ready",
    data: normalizeTransferJson({
      mode: testMode,
      context: testContext,
      holder: effectiveHolder ?? holderOfMandate(mandate),
      input_surface: surfaceState,
      current_inputs: values,
      human_input: userInput,
      running,
      result: completed,
      failure,
      inputs_changed_since_run: inputsChanged,
      sample_error: sampleError,
      unsaved_changes: { test_case_label: saveLabel, inputs: values, human_input: userInput },
    }),
  }, "run_once");


  return (
    <section className="min-w-0 space-y-4">
      {/* Run sits in the header row, always in view (UX punch list
          2026-09-26: it was below a screen of input fields — Postman keeps
          Send beside the request, never under it). */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="type-title">Run once</h3>
        <div className="flex items-center gap-2">
        <Button
          icon={running ? (
            <Loader2 className="animate-spin" />
          ) : (
            <FlaskConical />
          )}
          variant="primary"
          disabled={running || !surface}
          onClick={() => void run()}
        >
          Run test
        </Button>
        <Button
          icon={readingSamples ? (
            <Loader2 className="animate-spin" />
          ) : (
            <FlaskConical />
          )}
          variant="outline"
          disabled={readingSamples || !surface}
          onClick={() =>
            sampleSource ? setSampleSource(null) : void openSamples()
          }
        >
          Agent samples
        </Button>
        </div>
      </div>
      {sampleError ? (
        <ErrorNotice size="inline" className="type-body" message={sampleError} />
      ) : null}
      {sampleSource ? (
        <section
          className="space-y-3 rounded-lg border border-border p-3"
          aria-label="Agent samples"
        >
          <div className="flex items-center justify-between">
            <h4 className="type-title">Agent samples</h4>
            <Button
              variant="quiet"
              onClick={() => setSampleSource(null)}
            >
              Close
            </Button>
          </div>
          <AgentSamplesManager
            agentId={sampleSource.agentId}
            onUseSample={fillSample}
          />
        </section>
      ) : null}
      {adminSeat ? null : (
      <PropertyRow
        label="Test mode"
        help="Server test runs the job; display preview runs your saved holder."
        value={
            <Select
              value={testMode}
              onValueChange={(value: "server" | "display") => {
                setTestMode(value);
                setSampleSource(null);
                setSampleError(null);
              }}
            >
              <SelectTrigger
                className={`${CONFIGURATION_CHOICE_SIZE} w-full max-w-72`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="server">Server test</SelectItem>
                <SelectItem value="display">My display preview</SelectItem>
              </SelectContent>
            </Select>
        }
      />
      )}
      {allowPrincipalSelection && !adminSeat ? (
        <PropertyRow
          label="Test as"
          value={
            testMode === "display" ? (
              "My effective Mandate Holder"
            ) : (
              <Select
                value={testContext}
                onValueChange={(value: "system" | "viewer") =>
                  setTestContext(value)
                }
              >
                <SelectTrigger
                  className={`${CONFIGURATION_CHOICE_SIZE} w-full max-w-72`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System default</SelectItem>
                  <SelectItem value="viewer">My effective Mandate Holder</SelectItem>
                </SelectContent>
              </Select>
            )
          }
          help="Both run as you."
        />
      ) : null}
      {surfaceState.status === "loading" ? (
        <div role="status" className="flex items-center gap-2 type-body">
          <Loader2 className="size-4 animate-spin" />
          Reading input declaration
        </div>
      ) : surfaceState.status === "error" ? (
        <PropertyRow
          label="Input declaration"
          value={<StatusToken status="error" label="Unavailable" />}
          help={surfaceState.message}
        />
      ) : null}
      <ServerNotes
        heading="Input declaration notes"
        notes={surface?.notes ?? []}
        testId="test-input-surface-notes"
        folded
      />
      {/* INPUTS — one row per input: name, value, source. */}
      <ConfigurationTable label="Inputs" columns={INPUT_COLUMNS}>
        {fields.map((field) => {
          const definition = agentDefinitions.find(
            (item) => item.name === field.name,
          );
          const structured =
            !SCALAR_VALUE_KINDS.has(field.kind) &&
            !MEDIA_VALUE_KINDS.has(field.kind);
          const label = displayLabel(field.label === field.name ? undefined : field.label, field.name);
          // A binding prompt left blank runs on the holder's own default
          // (guard: features/mandates/__tests__/invoke-supplied-values.test.ts).
          const blankUsesDefault =
            field.origin === "binding_prompt" &&
            field.sourcing === "optional" &&
            !field.pinned;
          return (
            <ConfigurationTableRow
              key={field.name}
              columns={INPUT_COLUMNS}
              cells={{
                name: (
                  <span className="inline-flex items-center gap-1">
                    {label}
                    {field.help ? <FieldHelp label={label}>{field.help}</FieldHelp> : null}
                  </span>
                ),
                value: (
                  <div className="min-w-0">
              {field.pinned ? (
                <>{
                    field.pinnedValue == null ? (
                      "Provided at run time"
                    ) : typeof field.pinnedValue === "object" ||
                      typeof field.pinnedValue === "string" ? (
                      <AnswerValueView
                        value={field.pinnedValue}
                        density="inline"
                        emptyText="Empty"
                      />
                    ) : (
                      String(field.pinnedValue)
                    )
                  }</>
              ) : structured ? (
                <ProJsonTextarea
                  aria-label={label}
                  value={
                    typeof currentValue(field) === "string"
                      ? String(currentValue(field))
                      : JSON.stringify(currentValue(field), null, 2)
                  }
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: event.target.value,
                    }))
                  }
                  placeholder="JSON value"
                  className="min-h-32 text-sm"
                  minHeight={128}
                  enableTextStats={false}
                  autoFocus={false}
                />
              ) : ["text", "string", "markdown"].includes(field.kind) &&
                (!definition?.customComponent ||
                  (["textarea", "markdown"].includes(
                    definition.customComponent.type,
                  ) &&
                    !definition.customComponent.pick_list &&
                    !definition.customComponent.structured_list &&
                    !definition.customComponent.picklist &&
                    !definition.customComponent.assignment)) ? (
                <ProTextarea
                  aria-label={label}
                  value={String(currentValue(field))}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: event.target.value,
                    }))
                  }
                  placeholder={label}
                  className="min-h-32 text-sm"
                  minHeight={128}
                  autoFocus={false}
                />
              ) : (
                <VariableInputComponent
                  variableName={field.name}
                  label={label}
                  value={currentValue(field)}
                  onChange={(value: unknown) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: value,
                    }))
                  }
                  customComponent={
                    definition?.customComponent ?? componentForKind(field.kind)
                  }
                  hideLabel
                  compact
                  autoFocus={false}
                />
              )}
                  </div>
                ),
                source: (
                  <span title={blankUsesDefault ? "Blank uses the holder's default" : undefined}>
                    {ORIGIN_LABEL[field.origin]}
                    {field.sourcing !== "optional" ? " · Required" : ""}
                    {field.pinned ? " · Automatic" : ""}
                    {blankUsesDefault ? " · Blank uses default" : ""}
                  </span>
                ),
              }}
            />
          );
        })}
        <ConfigurationTableRow
          columns={INPUT_COLUMNS}
          cells={{
            name: "User message",
            value: surface?.acceptsUserInput ? (
              <ProTextarea
                aria-label="User message"
                value={userInput}
                onChange={(event) => setUserInput(event.target.value)}
                placeholder="User message"
                className="min-h-24 text-sm"
                minHeight={96}
                autoFocus={false}
              />
            ) : surface ? (
              "Not accepted"
            ) : (
              "—"
            ),
            source: "User",
          }}
        />
      </ConfigurationTable>
      {failure ? <RunFailureCard failure={failure} /> : null}
      {result ? (
        <section className="space-y-3 rounded-lg border border-border p-3">
          <h3 className="type-title">Result</h3>
          <ConfigurationTable label="Result" columns={RESULT_COLUMNS}>
            <ConfigurationTableRow
              columns={RESULT_COLUMNS}
              cells={{
                status: (
                  <StatusToken
                    status={result.error ? "error" : "ok"}
                    label={result.error ? "Failed" : "Succeeded"}
                  />
                ),
                structure: (
                  <StatusToken
                    status={!structure?.checked ? "neutral" : structure.ok ? "ok" : "error"}
                    label={!structure?.checked ? "—" : structure.ok ? "Passed" : "Failed"}
                  />
                ),
                duration: formatDurationMs(result.duration_ms ?? 0, { style: "compact" }),
                cost: costWords(result.accounting?.total_cost_usd ?? null, costRate, costUnit),
                tokens:
                  result.accounting && (result.accounting.input_tokens != null || result.accounting.output_tokens != null)
                    ? formatCount((result.accounting.input_tokens ?? 0) + (result.accounting.output_tokens ?? 0))
                    : "—",
                ran:
                  runHolder?.holderType === "workflow" ? (
                    runHolder.runId ? (
                      <Link href={`/workflows/runs/${runHolder.runId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        Workflow run
                        <ExternalLink className="size-3" />
                      </Link>
                    ) : (
                      "—"
                    )
                  ) : ranAgentId ? (
                    <EntityRef token="agent" id={ranAgentId} href={`/agents/go/${ranAgentId}`} openInNewTab wrap />
                  ) : (
                    "—"
                  ),
              }}
            />
          </ConfigurationTable>
          <ConfigurationTable
            label="Applied model overrides"
            columns={APPLIED_OVERRIDE_COLUMNS}
          >
            {Object.entries(result.applied_config_overrides ?? {}).length ? (
              Object.entries(result.applied_config_overrides ?? {}).map(
                ([key, value]) => (
                  <ConfigurationTableRow
                    key={key}
                    columns={APPLIED_OVERRIDE_COLUMNS}
                    cells={{
                      setting: (humanizeIdentifier(key) || key),
                      value:
                        key === "model" && typeof value === "string" ? (
                          <EntityRef token="ai_model" id={value} />
                        ) : typeof value === "boolean" ? (
                          value ? (
                            "Yes"
                          ) : (
                            "No"
                          )
                        ) : value !== null &&
                          (typeof value === "object" ||
                            typeof value === "string") ? (
                          <AnswerValueView
                            value={value}
                            density="inline"
                            emptyText="Empty"
                          />
                        ) : (
                          String(value)
                        ),
                    }}
                  />
                ),
              )
            ) : (
              <ConfigurationTableRow
                columns={APPLIED_OVERRIDE_COLUMNS}
                cells={{ setting: "None", value: "Mandate Holder defaults" }}
              />
            )}
          </ConfigurationTable>
          <ServerNotes
            heading="Run notes"
            notes={result.notes ?? []}
            testId="try-it-now-run-notes"
            folded
          />
          {result.error ? (
            <div className="whitespace-pre-wrap break-words type-body text-destructive">
              {result.error}
              <ErrorAlchemyMenu error={result.error} />
            </div>
          ) : (
            <>
              {structure?.errors?.length ? (
                <PropertyRow
                  label="Structure errors"
                  value={structure.errors.join("; ")}
                />
              ) : null}
              <OutputPreview
                output={result.output ?? ""}
                artifact={result.artifact}
                outputKind={structure?.output_kind ?? null}
              />
              <PropertyRow
                label="Inputs changed since run"
                value={inputsChanged ? "Yes" : "No"}
              />
              <label className="block space-y-1 text-sm">
                <span>Test case name</span>
                <Input
                  value={saveLabel}
                  onChange={(event) => setSaveLabel(event.target.value)}
                  placeholder="Test case name"
                />
              </label>
              <Button
                icon={saving ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Save />
                )}
                variant="primary"
                onClick={() => void saveAsTestCase()}
                disabled={saving}
              >
                Save test case and reference
              </Button>
            </>
          )}
        </section>
      ) : null}
    </section>
  );
}
