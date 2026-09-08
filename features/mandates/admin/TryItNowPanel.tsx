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

interface CompletedRun {
  result: MandateTestResponse;
  variables: JsonObject;
  userInput: string | null;
}
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
}: {
  mandate: MandateDefinitionRow;
  defaultAgentId: string | null;
  passesUserInput: boolean | undefined;
  onSavedTestCase: () => void;
}) {
  const dispatch = useAppDispatch();
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

  return (
    <section className="min-w-0 space-y-4">
      <h3 className="text-sm font-semibold">Test inputs</h3>
      <PropertyRow
        label="Test context"
        value={
          <Select
            value={testContext}
            onValueChange={(value: "system" | "viewer") =>
              setTestContext(value)
            }
          >
            <SelectTrigger className="w-full max-w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System default</SelectItem>
              <SelectItem value="viewer">My effective holder</SelectItem>
            </SelectContent>
          </Select>
        }
        help="System default preserves the administrator bench. My effective holder includes your organization and personal binding overrides. Both execute as the signed-in administrator."
      />
      <PropertyRow
        label="Input declaration scope"
        value="Signed-in organization"
        source="Served input surface"
      />
      <PropertyRow
        label="Input / test scope match"
        value={<StatusToken status="unknown" label="Not verified" />}
        help="The input-surface endpoint has no test-principal selector. Its declarations may differ from the holder selected by the test context. The result reports the actual holder."
      />
      <PropertyRow
        label="Sample-data fill"
        value="Not available"
        help="Agent Builder sample-data support is tracked for a later pass. Saved test cases remain available below."
      />
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
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
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
              <PropertyRow
                label="Format"
                value={formatVariableDisplayName(field.kind)}
              />
              <PropertyRow
                label="Required"
                value={field.sourcing !== "optional" ? "Yes" : "No"}
              />
              <PropertyRow
                label="Delivery"
                value={field.pinned ? "Automatic" : "Entered for test"}
                source={ORIGIN_LABEL[field.origin]}
              />
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
                <ProTextarea
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
                  className="min-h-24 font-mono text-sm"
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
      <PropertyRow
        label="User message accepted"
        value={surface ? (surface.acceptsUserInput ? "Yes" : "No") : "Unknown"}
      />
      {surface?.acceptsUserInput ? (
        <label className="block space-y-1 text-sm">
          <span>User message</span>
          <ProTextarea
            value={userInput}
            onChange={(event) => setUserInput(event.target.value)}
            placeholder="User message"
            className="min-h-20"
            autoFocus={false}
          />
        </label>
      ) : null}
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
