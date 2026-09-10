"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, FlaskConical, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
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
} from "@/components/official/ConfigurationFields";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import type {
  VariableCustomComponent,
  VariableDefinition,
} from "@/features/agents/types/agent-definition.types";
import { holderOfMandate } from "@/lib/supabase/mandateStorage";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
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
import {
  displayLabelForKey,
  formatVariableDisplayName,
} from "@/features/agents/utils/variable-utils";
import { RunFailureCard } from "@/features/mandates/RunFailureCard";
import { ServerNotes } from "@/components/official/ServerNotes";
import {
  fetchVersionVariableDefinitions,
  saveAdHocResultAsExemplar,
  type MandateDefinitionRow,
} from "./service";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ProJsonTextarea } from "@/components/official/ProJsonTextarea";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";

interface CompletedRun {
  result: MandateTestResponse;
  variables: JsonObject;
  userInput: string | null;
}
const APPLIED_OVERRIDE_COLUMNS = [
  { key: "setting", label: "Applied override" },
  { key: "value", label: "Value" },
];
const ORIGIN_LABEL: Record<ServedInput["origin"], string> = {
  provision: "Provision",
  mandate_input: "Mandate",
  holder: "Holder",
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
  defaultAgentId,
  onSavedTestCase,
  allowPrincipalSelection = false,
}: {
  /** Explicitly opt in on a host that supports testing another principal. */
  allowPrincipalSelection?: boolean;
  mandate: MandateDefinitionRow;
  defaultAgentId: string | null;
  passesUserInput: boolean | undefined;
  onSavedTestCase: () => void;
}) {
  const dispatch = useAppDispatch();
  const { launchMandate } = useAgentLauncher();
  const [testMode, setTestMode] = useState<"server" | "display">("server");
  const viewerUserId = useAppSelector(selectUserId);
  const viewerOrgId = useAppSelector(selectEffectiveOrganizationId);
  const [testContext, setTestContext] = useState<"system" | "viewer">("system");
  const surfaceState = useMandateInputSurface(mandate.mandate_key);
  const surface = surfaceState.status === "ready" ? surfaceState.surface : null;
  const fields = surface?.inputs ?? [];
  const pinnedVersionId = holderOfMandate(mandate).versionId;
  const execution = useAppSelector((state) =>
    defaultAgentId ? selectAgentExecutionPayload(state, defaultAgentId) : null,
  );
  const [versionDefinitions, setVersionDefinitions] = useState<{
    id: string;
    definitions: VariableDefinition[];
  } | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [userInput, setUserInput] = useState("");
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState<CompletedRun | null>(null);
  const [failure, setFailure] = useState<MandateRunFailure | null>(null);
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
            `${displayLabelForKey(field.name, field.label === field.name ? undefined : field.label)} is required.`,
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
          `${displayLabelForKey(field.name, field.label === field.name ? undefined : field.label)} requires a valid ${structured ? "JSON value" : "value"}.`,
        );
      }
    }
    return variables;
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
        await launchMandate(mandate.mandate_key, {
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
      const result = await runMandateAdHocTest(dispatch, mandate.mandate_key, {
        variables,
        userInput: message,
        candidate: {
          candidate_id: crypto.randomUUID(),
          label:
            testContext === "system" ? "System default" : "My effective holder",
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
      });
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

  const inputColumns = [
    { key: "format", label: "Format" },
    { key: "required", label: "Required" },
    { key: "delivery", label: "Entry" },
    { key: "source", label: "Source" },
  ];

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Test inputs</h3>
        <span className="flex items-center gap-1 text-sm">
          Sample data
          <FieldHelp
            label="Sample data"
            triggerLabel="Sample data — unavailable"
            unavailable
            triggerIcon={<FlaskConical className="size-3.5 opacity-50" />}
          >
            Sample-data fill is not available for mandate tests. Use saved test
            cases below, or enter values here.
          </FieldHelp>
        </span>
      </div>
      <PropertyRow
        label="Test mode"
        help={`${allowPrincipalSelection ? "Server test executes the selected test context" : "Server test executes the system default"} and returns diagnostics. My display preview executes your resolved holder with saved display defaults; it does not reproduce the original feature. Test inputs come from the signed-in organization, so cross-principal input compatibility has not been verified.`}
        value={
          <Select
            value={testMode}
            onValueChange={(value: "server" | "display") => setTestMode(value)}
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
      {allowPrincipalSelection ? (
        <PropertyRow
          label="Test context"
          value={
            testMode === "display" ? (
              "My effective holder"
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
                  <SelectItem value="viewer">My effective holder</SelectItem>
                </SelectContent>
              </Select>
            )
          }
          help="System default preserves the administrator bench. My effective holder includes your organization and personal binding overrides. Both execute as the signed-in administrator."
        />
      ) : null}
      {surfaceState.status === "loading" ? (
        <div role="status" className="flex items-center gap-2 text-sm">
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
      <div className="grid min-w-0 gap-3">
        {fields.map((field) => {
          const definition = agentDefinitions.find(
            (item) => item.name === field.name,
          );
          const structured =
            !SCALAR_VALUE_KINDS.has(field.kind) &&
            !MEDIA_VALUE_KINDS.has(field.kind);
          const label = displayLabelForKey(
            field.name,
            field.label === field.name ? undefined : field.label,
          );
          return (
            <div
              key={field.name}
              className="min-w-0 space-y-2 rounded-lg border border-border p-3"
            >
              <h4 className="flex items-center gap-2 text-sm font-medium">
                {label}
                {field.help ? (
                  <FieldHelp label={label}>{field.help}</FieldHelp>
                ) : null}
              </h4>
              <ConfigurationTable
                label={`${label} input properties`}
                columns={inputColumns}
              >
                <ConfigurationTableRow
                  columns={inputColumns}
                  cells={{
                    format: formatVariableDisplayName(field.kind),
                    required: field.sourcing !== "optional" ? "Yes" : "No",
                    delivery: field.pinned ? "Automatic" : "Manual",
                    source: ORIGIN_LABEL[field.origin],
                  }}
                />
              </ConfigurationTable>
              {field.pinned ? (
                <PropertyRow
                  label="Value"
                  value={
                    field.pinnedValue == null
                      ? "Provided at run time"
                      : typeof field.pinnedValue === "string"
                        ? field.pinnedValue
                        : JSON.stringify(field.pinnedValue)
                  }
                />
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
                  variableName={label}
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
          );
        })}
      </div>
      {surface && fields.length === 0 ? (
        <PropertyRow label="Declared inputs" value="None" />
      ) : null}
      <div className="min-w-0 space-y-2 rounded-lg border border-border p-3">
        <h4 className="flex items-center gap-2 text-sm font-medium">
          User message
          <FieldHelp label="User message">
            Optional text from the person running the test. Provision values are
            sent separately.
          </FieldHelp>
        </h4>
        <ConfigurationTable
          label="User message properties"
          columns={inputColumns}
        >
          <ConfigurationTableRow
            columns={inputColumns}
            cells={{
              format: "Text",
              required: "No",
              delivery: "Manual",
              source: "User",
            }}
          />
        </ConfigurationTable>
        {surface?.acceptsUserInput ? (
          <ProTextarea
            aria-label="User message"
            value={userInput}
            onChange={(event) => setUserInput(event.target.value)}
            placeholder="User message"
            className="min-h-32 text-sm"
            minHeight={128}
            autoFocus={false}
          />
        ) : (
          <PropertyRow
            label="User message"
            value={surface ? "Not accepted" : "Unknown"}
          />
        )}
      </div>
      <Button
        size="sm"
        disabled={running || !surface}
        onClick={() => void run()}
      >
        {running ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <FlaskConical className="mr-2 size-4" />
        )}
        Run test
      </Button>
      {failure ? <RunFailureCard failure={failure} /> : null}
      {result ? (
        <section className="space-y-3 rounded-lg border border-border p-3">
          <h3 className="text-sm font-semibold">Test result</h3>
          <PropertyRow
            label="Execution"
            value={
              <StatusToken
                status={result.error ? "error" : "ok"}
                label={result.error ? "Failed" : "Completed"}
              />
            }
          />
          <PropertyRow
            label="Output structure"
            value={
              <StatusToken
                status={
                  !structure?.checked
                    ? "unknown"
                    : structure.ok
                      ? "ok"
                      : "error"
                }
                label={
                  !structure?.checked
                    ? "Not yet evaluated"
                    : structure.ok
                      ? "Passed"
                      : "Failed"
                }
              />
            }
          />
          <PropertyRow
            label="Full validation"
            value={<StatusToken status="neutral" label="Not yet evaluated" />}
          />
          <PropertyRow
            label="Duration"
            value={`${((result.duration_ms ?? 0) / 1000).toFixed(1)} seconds`}
          />
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
                      setting: formatVariableDisplayName(key),
                      value:
                        key === "model" && typeof value === "string" ? (
                          <EntityRef token="ai_model" id={value} />
                        ) : typeof value === "boolean" ? (
                          value ? (
                            "Yes"
                          ) : (
                            "No"
                          )
                        ) : typeof value === "string" ? (
                          value
                        ) : (
                          JSON.stringify(value)
                        ),
                    }}
                  />
                ),
              )
            ) : (
              <ConfigurationTableRow
                columns={APPLIED_OVERRIDE_COLUMNS}
                cells={{ setting: "None", value: "Holder defaults" }}
              />
            )}
          </ConfigurationTable>
          <PropertyRow
            label="Resolution source"
            value={
              result.provenance
                ? displayLabelForKey(result.provenance)
                : "Unknown"
            }
          />
          <PropertyRow
            label="Holder type"
            value={runHolder?.holderType === "workflow" ? "Workflow" : "Agent"}
          />
          {runHolder?.holderType === "workflow" ? (
            <PropertyRow
              label="Workflow run"
              value={
                runHolder.runId ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/workflows/runs/${runHolder.runId}`}>
                      <ExternalLink className="mr-2 size-4" />
                      Open run
                    </Link>
                  </Button>
                ) : (
                  "Unavailable"
                )
              }
            />
          ) : (
            <PropertyRow
              label="Executed agent"
              value={
                ranAgentId ? (
                  <EntityRef
                    token="agent"
                    id={ranAgentId}
                    href={`/agents/go/${ranAgentId}`}
                    openInNewTab
                    wrap
                  />
                ) : (
                  "Unavailable"
                )
              }
            />
          )}
          <ServerNotes
            heading="Run notes"
            notes={result.notes ?? []}
            testId="try-it-now-run-notes"
            folded
          />
          {result.error ? (
            <div className="whitespace-pre-wrap break-words text-sm text-destructive">
              {result.error}
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
              />
              <PropertyRow
                label="Inputs changed since test"
                value={inputsChanged ? "Yes" : "No"}
                help="Saving uses the completed run's exact input snapshot."
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
                size="sm"
                onClick={() => void saveAsTestCase()}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Save className="mr-2 size-4" />
                )}
                Save test case and reference
              </Button>
            </>
          )}
        </section>
      ) : null}
    </section>
  );
}
