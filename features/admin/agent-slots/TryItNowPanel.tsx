"use client";

/**
 * "Try it now" — run a slot with inputs typed right now, no stored test case.
 *
 * This is the cold-start half of the owner bench. Most live slots have no
 * exemplar at all, so the batch bench has literally nothing to run for them:
 * the only way in is to run the slot once by hand and keep the result. So this
 * panel does exactly two things:
 *
 *   1. Scaffold a form from what the slot ALREADY declares — the contract's
 *      required variables plus the variable definitions of the agent that
 *      actually runs (the PINNED VERSION's when the slot pins one, not the
 *      latest definition's), so the admin never guesses a variable name or its
 *      input type, with the user message field for chat-shaped slots.
 *   2. On any successful run, "Save as test case" writes the inputs AND the
 *      run — as the reference — into one new exemplar. The slot is benchable
 *      from that click on.
 *
 * Fields render with the CANONICAL `VariableInputComponent`, so a picklist,
 * media, or slider variable gets its real control here exactly as it does in
 * chat — never a JSON textarea. Output renders through the shared
 * `OutputPreview`, so a media result is an image and not a raw expiring URL.
 *
 * 🚨 **The saved test case carries the inputs THAT RUN received**, captured
 * with the result — never whatever is in the form at save time. Re-reading the
 * live form would silently pair edited inputs with an older output, and this
 * is the FIRST test case of a cold slot: the bar every later run is judged
 * against.
 *
 * No progress UI: `POST /agent-slots/{slot_key}/test` returns one completed
 * result and exposes no requestId, so there is no stream to render. When that
 * endpoint learns to stream, this panel adopts it and renders the canonical
 * LiveRunWindow — it must never grow a hand-rolled progress bar instead.
 */

import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Loader2, Play, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { parseSlotContract } from "@/features/agents/slots/overrides";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { isJsonObject, type JsonObject, type JsonValue } from "@/types/json";
import { OutputPreview } from "./bench-output-preview";
import {
  fetchVersionVariableDefinitions,
  runSlotAdHocTest,
  saveAdHocResultAsExemplar,
  type SlotDefinitionRow,
  type SlotTestResponse,
} from "./service";

/** One scaffolded field: a slot-declared variable, an agent-declared one, or
 * both (the common case — the union is deliberate, because either side alone
 * has silently missed inputs the run actually needs). */
interface BenchField {
  name: string;
  definition: VariableDefinition | null;
  /** Declared in the slot's contract — blank is a refusal, not a default. */
  requiredByContract: boolean;
}

/** A completed run TOGETHER with the exact inputs it received. Saving reads
 * this, never the live form. */
interface CompletedRun {
  result: SlotTestResponse;
  variables: JsonObject;
  userInput: string | null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Anything the canonical inputs emit (string, number, MediaRef object …)
 * becomes a JSON value; unserializable input is refused loudly. */
function toJsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  const round: unknown = JSON.parse(JSON.stringify(value));
  return round as JsonValue;
}

function isBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isJsonObject(value)) return Object.keys(value).length === 0;
  return false;
}

export function TryItNowPanel({
  slot,
  defaultAgentId,
  passesUserInput,
  onSavedTestCase,
}: {
  slot: SlotDefinitionRow;
  /** The agent this slot resolves to — its variable definitions supply the
   * real input types (picklists, media, sliders). */
  defaultAgentId: string | null;
  /** Code truth: does any call site pass a user message to this slot?
   * `undefined` means code truth could not answer (import failure, no code
   * declaration) — UNKNOWN IS NOT NO, so the field is offered. */
  passesUserInput: boolean | undefined;
  onSavedTestCase: () => void;
}) {
  const dispatch = useAppDispatch();
  const contract = useMemo(() => parseSlotContract(slot.contract), [slot]);
  const pinnedVersionId = slot.default_agent_version_id;
  const execution = useAppSelector((state) =>
    defaultAgentId ? selectAgentExecutionPayload(state, defaultAgentId) : null,
  );
  /** Set only for a version-pinned slot: the PINNED version's declarations. */
  const [versionDefinitions, setVersionDefinitions] = useState<
    VariableDefinition[] | null
  >(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [userInput, setUserInput] = useState("");
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState<CompletedRun | null>(null);
  const [saveLabel, setSaveLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!defaultAgentId) return;
    dispatch(fetchAgentExecutionMinimal(defaultAgentId))
      .unwrap()
      .catch((error: unknown) =>
        toast.error(
          `Couldn't load the agent's variables (${describeError(error)}) — the slot's declared inputs are still shown.`,
        ),
      );
  }, [defaultAgentId, dispatch]);

  useEffect(() => {
    // No reset branch: the bench (and this panel with it) is keyed by slot id
    // in SlotDetailPanel, so a different slot means a fresh mount.
    if (!pinnedVersionId) return;
    let cancelled = false;
    fetchVersionVariableDefinitions(pinnedVersionId)
      .then((rows) => {
        if (!cancelled) setVersionDefinitions(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(
            `Couldn't load the pinned version's variables (${describeError(error)}) — showing the latest version's instead.`,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pinnedVersionId]);

  /** The declarations of the agent that ACTUALLY RUNS. A version pin wins;
   * otherwise the live definition (which is also what `use_latest` runs). */
  const agentDefinitions: VariableDefinition[] =
    (pinnedVersionId ? versionDefinitions : null) ??
    execution?.variableDefinitions ??
    [];
  const definitionsSource =
    pinnedVersionId && versionDefinitions ? "pinned version" : "latest version";

  const fields: BenchField[] = useMemo(() => {
    const byName = new Map<string, VariableDefinition>();
    for (const definition of agentDefinitions) {
      byName.set(definition.name, definition);
    }
    const names = [
      ...contract.requiredVariables,
      ...agentDefinitions
        .map((definition) => definition.name)
        .filter((name) => !contract.requiredVariables.includes(name)),
    ];
    return names.map((name) => ({
      name,
      definition: byName.get(name) ?? null,
      requiredByContract: contract.requiredVariables.includes(name),
    }));
  }, [contract.requiredVariables, agentDefinitions]);

  // Unknown code truth offers the field rather than hiding it: a chat-shaped
  // slot whose declaration could not be read would otherwise be benched
  // without the input its real call site sends.
  const showsUserInput = passesUserInput !== false;

  function currentValue(field: BenchField): unknown {
    if (field.name in values) return values[field.name];
    return field.definition?.defaultValue ?? "";
  }

  function buildVariables(): JsonObject | null {
    const out: JsonObject = {};
    for (const field of fields) {
      const raw = currentValue(field);
      if (field.requiredByContract && isBlank(raw)) {
        toast.error(
          `"${field.name}" is a required input for this slot — fill it in before running.`,
        );
        return null;
      }
      if (isBlank(raw) && !field.requiredByContract) continue;
      try {
        const json = toJsonValue(raw);
        if (json !== undefined) out[field.name] = json;
      } catch (error: unknown) {
        toast.error(`"${field.name}" can't be sent: ${describeError(error)}`);
        return null;
      }
    }
    return out;
  }

  async function run() {
    const variables = buildVariables();
    if (!variables) return;
    const message = showsUserInput && userInput.trim() ? userInput : null;
    // A slot that declares nothing legitimately runs as-is; one that declares
    // inputs but got none would just burn a run on an empty prompt.
    if (
      fields.length > 0 &&
      Object.keys(variables).length === 0 &&
      message === null
    ) {
      toast.error(
        "Give the slot something to run on — fill an input or a user message.",
      );
      return;
    }
    setRunning(true);
    setCompleted(null);
    try {
      const result = await runSlotAdHocTest(dispatch, slot.slot_key, {
        variables,
        userInput: message,
        // Name the column the way the bench names every other one — the
        // server's default label is the bare word "Candidate".
        candidate: {
          candidate_id: crypto.randomUUID(),
          label: "Try it now",
          selection: "current",
        },
      });
      setCompleted({ result, variables, userInput: message });
      if (result.error) {
        toast.error(`The run failed: ${result.error}`);
      } else {
        toast.success("Ran once. Keep it as a test case if the output is right.");
      }
    } catch (error: unknown) {
      toast.error(`Couldn't run the slot: ${describeError(error)}`);
    } finally {
      setRunning(false);
    }
  }

  async function saveAsTestCase() {
    if (!completed || completed.result.error) return;
    setSaving(true);
    try {
      await saveAdHocResultAsExemplar({
        slotId: slot.id,
        label: saveLabel.trim() || "First test case",
        // The inputs THIS run received — the form may have been edited since.
        variables: completed.variables,
        userInput: completed.userInput,
        result: completed.result,
      });
      setCompleted(null);
      setSaveLabel("");
      onSavedTestCase();
      toast.success(
        "Saved as a test case — this run is now the reference every later run is judged against.",
      );
    } catch (error: unknown) {
      toast.error(`Couldn't save the test case: ${describeError(error)}`);
    } finally {
      setSaving(false);
    }
  }

  const result = completed?.result ?? null;
  const structural = result?.structural;
  const ranAgentId = result?.definition_agent_id ?? result?.agent_id ?? null;
  const inputsChanged =
    completed != null &&
    JSON.stringify(buildVariablesQuietly()) !==
      JSON.stringify(completed.variables);

  /** Same projection as `buildVariables`, minus the toasts — used only to tell
   * the admin that the form no longer matches the run on screen. */
  function buildVariablesQuietly(): JsonObject {
    const out: JsonObject = {};
    for (const field of fields) {
      const raw = currentValue(field);
      if (isBlank(raw)) continue;
      try {
        const json = toJsonValue(raw);
        if (json !== undefined) out[field.name] = json;
      } catch {
        // A value that cannot be serialized is reported by the real builder.
      }
    }
    return out;
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/10 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Play className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="text-xs font-semibold">Try it now</div>
        <div className="text-[11px] text-muted-foreground">
          Run this slot on inputs you type here — no saved test case needed.
        </div>
      </div>

      {fields.length === 0 && !showsUserInput ? (
        <div className="rounded border border-dashed border-border p-2 text-[11px] text-muted-foreground">
          This slot declares no inputs, so there is nothing to fill in — run it
          as-is.
        </div>
      ) : (
        <div className="space-y-2">
          {fields.length > 0 && agentDefinitions.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              Fields come from this slot&apos;s contract and the{" "}
              {definitionsSource} of the agent that runs it.
            </div>
          )}
          {fields.map((field) => (
            <div
              key={field.name}
              className="rounded border border-border bg-card p-2"
            >
              <div className="mb-1 flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {field.name}
                </span>
                {field.requiredByContract && (
                  <Badge variant="outline" className="h-4 px-1 text-[9px]">
                    required
                  </Badge>
                )}
                {!field.definition && (
                  <Badge variant="outline" className="h-4 px-1 text-[9px]">
                    not declared on the agent
                  </Badge>
                )}
              </div>
              <VariableInputComponent
                variableName={field.name}
                value={currentValue(field)}
                onChange={(value: unknown) =>
                  setValues((current) => ({ ...current, [field.name]: value }))
                }
                customComponent={field.definition?.customComponent}
                helpText={field.definition?.helpText}
                hideLabel
                compact
              />
            </div>
          ))}
        </div>
      )}

      {showsUserInput && (
        <Textarea
          value={userInput}
          onChange={(event) => setUserInput(event.target.value)}
          placeholder={
            passesUserInput
              ? "User message — what the person using this slot would say"
              : "User message (optional — this slot's call site could not be read)"
          }
          className="min-h-16 text-xs"
        />
      )}

      <Button
        size="sm"
        variant="secondary"
        className="h-8 gap-1.5 text-xs"
        disabled={running}
        onClick={() => void run()}
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FlaskConical className="h-3.5 w-3.5" />
        )}
        Run once
      </Button>

      {result && (
        <div
          className={`space-y-2 rounded-md border p-2 ${
            result.error
              ? "border-destructive/60 bg-destructive/5"
              : "border-border bg-card"
          }`}
        >
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold">Result</span>
            {result.error ? (
              <Badge variant="destructive">failed</Badge>
            ) : structural?.checked && !structural.ok ? (
              <Badge variant="destructive">wrong structure</Badge>
            ) : (
              <Badge variant="secondary">ran</Badge>
            )}
            <Badge variant="outline">
              {((result.duration_ms ?? 0) / 1000).toFixed(1)}s
            </Badge>
            {ranAgentId && (
              <EntityRef
                token="agent"
                id={ranAgentId}
                name={ranAgentId}
                href={`/agents/${ranAgentId}`}
                openInNewTab
                wrap
                className="min-w-0"
                labelClassName="font-mono text-[10px]"
              />
            )}
          </div>

          {result.error ? (
            <div className="rounded bg-destructive/10 p-2 text-[11px] text-destructive">
              {result.error}
            </div>
          ) : (
            <>
              {(structural?.errors ?? []).length > 0 && (
                <div className="text-[11px] text-destructive">
                  {(structural?.errors ?? []).slice(0, 4).join("; ")}
                </div>
              )}
              <OutputPreview
                output={result.output ?? ""}
                artifact={result.artifact}
              />
              {inputsChanged && (
                <div className="rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
                  You have edited the inputs since this run. Saving keeps the
                  inputs this run actually received — run again to test the
                  edited ones.
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <Input
                  value={saveLabel}
                  onChange={(event) => setSaveLabel(event.target.value)}
                  placeholder="Test case name — what does it exercise?"
                  className="h-8 max-w-72 text-xs"
                />
                <Button
                  size="sm"
                  className="h-8 gap-1 text-[11px]"
                  disabled={saving || !result.output}
                  title={
                    result.output
                      ? undefined
                      : "This run produced no output to keep as the reference."
                  }
                  onClick={() => void saveAsTestCase()}
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  Save as test case
                </Button>
                <span className="text-[10px] text-muted-foreground">
                  Keeps this run&apos;s inputs and makes this output the
                  reference.
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
