"use client";

/**
 * Slot test bench — live in-place candidate testing inside the Agent Slots
 * console. Exemplars (real captured or hand-authored inputs, with reference
 * outputs) run against a CANDIDATE (different agent / pinned version /
 * config overrides) via aidream POST /agent-slots/{slot_key}/test; results
 * render side-by-side with a content-IR structural verdict. "Latest" is an
 * opinion — this is how it becomes a fact. See FEATURE.md.
 */

import React, { useCallback, useEffect, useState } from "react";
import { FlaskConical, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { isJsonObject } from "@/types/json";
import { fileIdFromUserFilesUrl } from "@/lib/media/durability";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { SearchableAgentSelect } from "@/features/agent-apps/components/SearchableAgentSelect";
import {
  createSlotExemplar,
  deleteSlotExemplar,
  fetchSlotExemplars,
  runSlotTest,
  type SlotAgentOption,
  type SlotDefinitionRow,
  type SlotExemplarRow,
  type SlotTestCandidate,
  type SlotTestResponse,
} from "./service";

function OutputPreview({ output, artifact }: { output: string; artifact: unknown }) {
  const fileId = output ? fileIdFromUserFilesUrl(output.trim()) : null;
  if (fileId) {
    return (
      <div className="flex items-start gap-2">
        <InlineMediaRef ref={fileId} size="xl" fit="cover" />
        <span className="text-[10px] text-muted-foreground font-mono break-all">
          file_id: {fileId}
        </span>
      </div>
    );
  }
  const text =
    artifact != null ? JSON.stringify(artifact, null, 1) : output;
  return (
    <pre className="text-[11px] whitespace-pre-wrap break-words max-h-48 overflow-auto bg-muted/40 rounded p-1.5">
      {text ? (text.length > 2400 ? `${text.slice(0, 2400)}…` : text) : "(empty)"}
    </pre>
  );
}

function ResultCard({
  title,
  result,
}: {
  title: string;
  result: SlotTestResponse;
}) {
  const s = result.structural;
  return (
    <div className="flex-1 min-w-[240px] border border-border rounded-md p-2">
      <div className="flex items-center gap-2 flex-wrap text-xs mb-1">
        <span className="font-medium">{title}</span>
        <Badge variant="outline">{(result.duration_ms / 1000).toFixed(1)}s</Badge>
        {s.checked ? (
          <Badge variant={s.ok ? "secondary" : "destructive"}>
            {s.ok ? "structure OK" : "structure FAILED"}
          </Badge>
        ) : (
          <Badge variant="outline">structure unchecked</Badge>
        )}
        {s.degraded_reason && (
          <span className="text-muted-foreground">{s.degraded_reason}</span>
        )}
      </div>
      {s.errors.length > 0 && (
        <div className="text-[11px] text-destructive mb-1">
          {s.errors.slice(0, 4).join("; ")}
        </div>
      )}
      <OutputPreview output={result.output} artifact={result.artifact} />
    </div>
  );
}

export function SlotTestBench({
  slot,
  agentOptions,
}: {
  slot: SlotDefinitionRow;
  agentOptions: SlotAgentOption[];
}) {
  const [exemplars, setExemplars] = useState<SlotExemplarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [candidateAgentId, setCandidateAgentId] = useState<string | null>(null);
  const [overridesText, setOverridesText] = useState("");
  const [results, setResults] = useState<Record<string, SlotTestResponse>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newVariables, setNewVariables] = useState("{}");

  // Every setState lives in an async callback — never synchronously in the
  // effect (react-hooks/set-state-in-effect). Initial state is loading=true;
  // the button-driven reload may flip it synchronously (event handler).
  const fetchData = useCallback(() => {
    fetchSlotExemplars(slot.id)
      .then(setExemplars)
      .catch((error: unknown) =>
        toast.error(
          `Failed to load exemplars: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
      .finally(() => setLoading(false));
  }, [slot.id]);

  const reload = useCallback(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const buildCandidate = useCallback((): SlotTestCandidate | null => {
    const candidate: SlotTestCandidate = {};
    if (candidateAgentId) candidate.agent_id = candidateAgentId;
    const trimmed = overridesText.trim();
    if (trimmed) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (!isJsonObject(parsed)) throw new Error("must be a JSON object");
        candidate.config_overrides = parsed;
      } catch (error: unknown) {
        toast.error(
          `config_overrides is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    }
    return candidate;
  }, [candidateAgentId, overridesText]);

  const runTest = useCallback(
    async (exemplar: SlotExemplarRow) => {
      const candidate = buildCandidate();
      if (candidate === null) return;
      setRunning((r) => ({ ...r, [exemplar.id]: true }));
      try {
        const result = await runSlotTest(slot.slot_key, {
          exemplarId: exemplar.id,
          candidate,
        });
        setResults((r) => ({ ...r, [exemplar.id]: result }));
      } catch (error: unknown) {
        toast.error(
          `Test failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        setRunning((r) => ({ ...r, [exemplar.id]: false }));
      }
    },
    [buildCandidate, slot.slot_key],
  );

  const addExemplar = useCallback(async () => {
    let variables: unknown;
    try {
      variables = JSON.parse(newVariables || "{}");
      if (!isJsonObject(variables)) throw new Error("must be a JSON object");
    } catch (error: unknown) {
      toast.error(
        `Variables must be a JSON object: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    try {
      await createSlotExemplar({
        slotId: slot.id,
        label: newLabel.trim() || "Manual exemplar",
        variables,
      });
      setAdding(false);
      setNewLabel("");
      setNewVariables("{}");
      reload();
    } catch (error: unknown) {
      toast.error(
        `Failed to save exemplar: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }, [newLabel, newVariables, slot.id, reload]);

  return (
    <div className="border-t border-border px-3 py-2">
      <div className="flex items-center gap-2 mb-2">
        <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">Test bench</span>
        <span className="text-[11px] text-muted-foreground">
          Run a candidate on stored inputs and compare against the reference —
          structure AND substance.
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 gap-1 text-xs"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus className="w-3.5 h-3.5" /> Exemplar
        </Button>
      </div>

      {adding && (
        <div className="mb-2 grid gap-1.5 border border-border rounded-md p-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Exemplar label"
            className="h-7 text-xs"
          />
          <Textarea
            value={newVariables}
            onChange={(e) => setNewVariables(e.target.value)}
            placeholder='Variables JSON, e.g. {"image_description": "…"}'
            className="text-xs font-mono min-h-20"
          />
          <div>
            <Button size="sm" className="h-6 text-xs" onClick={() => void addExemplar()}>
              Save exemplar
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-2 md:grid-cols-[minmax(240px,320px)_1fr] mb-2">
        <div>
          <div className="text-[11px] font-medium text-muted-foreground mb-1">
            Candidate agent (blank = current default)
          </div>
          <SearchableAgentSelect
            agents={agentOptions.map((a) => ({
              id: a.id,
              name: a.name,
              description: a.description,
              category: a.category,
            }))}
            value={candidateAgentId}
            onChange={(id) =>
              setCandidateAgentId((current) => (current === id ? null : id))
            }
            placeholder="Search system agents…"
          />
        </div>
        <div>
          <div className="text-[11px] font-medium text-muted-foreground mb-1">
            config_overrides JSON (optional — e.g. {"{"}"model": "…", "thinking_level":
            "low"{"}"})
          </div>
          <Textarea
            value={overridesText}
            onChange={(e) => setOverridesText(e.target.value)}
            placeholder="{}"
            className="text-xs font-mono min-h-16"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading exemplars…
        </div>
      ) : exemplars.length === 0 ? (
        <div className="text-xs text-muted-foreground py-1">
          No exemplars yet — production runs self-capture up to 3, or add one
          manually.
        </div>
      ) : (
        exemplars.map((exemplar) => {
          const result = results[exemplar.id];
          const isRunning = Boolean(running[exemplar.id]);
          return (
            <div key={exemplar.id} className="border border-border rounded-md p-2 mb-2">
              <div className="flex items-center gap-2 text-xs mb-1.5">
                <span className="font-medium">{exemplar.label}</span>
                <Badge variant="outline">{exemplar.source}</Badge>
                <details className="text-muted-foreground">
                  <summary className="cursor-pointer">inputs</summary>
                  <pre className="text-[10px] whitespace-pre-wrap break-words max-h-40 overflow-auto bg-muted/40 rounded p-1.5 mt-1">
                    {JSON.stringify(exemplar.variables, null, 1)}
                    {exemplar.user_input ? `\nuser_input: ${exemplar.user_input}` : ""}
                  </pre>
                </details>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    size="sm"
                    className="h-6 text-xs gap-1"
                    disabled={isRunning}
                    onClick={() => void runTest(exemplar)}
                  >
                    {isRunning ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FlaskConical className="w-3.5 h-3.5" />
                    )}
                    Run test
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5"
                    onClick={() =>
                      void deleteSlotExemplar(exemplar.id).then(reload)
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="flex-1 min-w-[240px] border border-border rounded-md p-2">
                  <div className="text-xs font-medium mb-1">
                    Reference{" "}
                    {exemplar.captured_model_id && (
                      <span className="text-muted-foreground font-normal">
                        ({exemplar.captured_model_id})
                      </span>
                    )}
                  </div>
                  {exemplar.reference_output || exemplar.reference_artifact ? (
                    <OutputPreview
                      output={exemplar.reference_output ?? ""}
                      artifact={exemplar.reference_artifact}
                    />
                  ) : (
                    <div className="text-[11px] text-muted-foreground">
                      No reference yet — run a test with the current default and
                      judge from there.
                    </div>
                  )}
                </div>
                {result && <ResultCard title="Candidate" result={result} />}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
