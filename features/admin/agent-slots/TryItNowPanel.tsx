"use client";

/**
 * "Try it now" — run a slot with inputs typed right now, no stored test case.
 *
 * This is the cold-start half of the owner bench. 94 of ~148 live slots have
 * no exemplar at all, so the batch bench has literally nothing to run for
 * them: the only way in is to run the slot once by hand and keep the result.
 * So this panel does exactly two things:
 *
 *   1. Scaffold a form from what the slot ALREADY declares — the contract's
 *      required variables plus the resolved agent's own variable definitions
 *      (so the admin never guesses a variable name or its input type), with
 *      the user message field for chat-shaped slots.
 *   2. On any successful run, "Save as test case" writes the inputs AND the
 *      run — as the reference — into one new exemplar. The slot is benchable
 *      from that click on.
 *
 * Fields render with the CANONICAL `VariableInputComponent`, so a picklist,
 * media, or slider variable gets its real control here exactly as it does in
 * chat — never a JSON textarea.
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
import {
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
  /** Code truth: does any call site pass a user message to this slot? */
  passesUserInput: boolean;
  onSavedTestCase: () => void;
}) {
  const dispatch = useAppDispatch();
  const contract = useMemo(() => parseSlotContract(slot.contract), [slot]);
  const execution = useAppSelector((state) =>
    defaultAgentId
      ? selectAgentExecutionPayload(state, defaultAgentId)
      : null,
  );
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [userInput, setUserInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SlotTestResponse | null>(null);
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

  const fields: BenchField[] = useMemo(() => {
    const definitions = execution?.variableDefinitions ?? [];
    const byName = new Map<string, VariableDefinition>();
    for (const definition of definitions) byName.set(definition.name, definition);
    const names = [
      ...contract.requiredVariables,
      ...definitions
        .map((definition) => definition.name)
        .filter((name) => !contract.requiredVariables.includes(name)),
    ];
    return names.map((name) => ({
      name,
      definition: byName.get(name) ?? null,
      requiredByContract: contract.requiredVariables.includes(name),
    }));
  }, [contract.requiredVariables, execution?.variableDefinitions]);

  const showsUserInput = passesUserInput || fields.length === 0;

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
    if (Object.keys(variables).length === 0 && !userInput.trim()) {
      toast.error("Give the slot something to run on — fill an input or a user message.");
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const response = await runSlotAdHocTest(dispatch, slot.slot_key, {
        variables,
        userInput: showsUserInput ? userInput : null,
      });
      setResult(response);
      if (response.error) {
        toast.error(`The run failed: ${response.error}`);
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
    if (!result || result.error) return;
    const variables = buildVariables();
    if (!variables) return;
    setSaving(true);
    try {
      await saveAdHocResultAsExemplar({
        slotId: slot.id,
        label: saveLabel.trim() || "First test case",
        variables,
        userInput: showsUserInput && userInput.trim() ? userInput : null,
        result,
      });
      setResult(null);
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

  const structural = result?.structural;
  const ranAgentId = result?.definition_agent_id ?? result?.agent_id ?? null;

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
          {fields.map((field) => (
            <div key={field.name} className="rounded border border-border bg-card p-2">
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
          placeholder="User message — what the person using this slot would say"
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
            result.error ? "border-destructive/60 bg-destructive/5" : "border-border bg-card"
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
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-[11px]">
                {result.artifact != null
                  ? JSON.stringify(result.artifact, null, 1)
                  : result.output || "(empty)"}
              </pre>
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
                  disabled={saving}
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
                  Keeps these inputs and makes this output the reference.
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
