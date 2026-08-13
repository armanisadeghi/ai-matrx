"use client";

/**
 * Owner bench for agent slots — "is this change going to break the agent?"
 *
 * Two jobs, no generic runner framing:
 * 1. Run every saved test case through the current setup and anything the
 *    admin wants to compare it against (latest version, a specific version,
 *    another agent), side by side.
 * 2. Promote any concrete result into the exemplar's reference.
 *
 * Runs execute as the signed-in admin and their org — the same way every
 * admin surface works. There is no identity picker here on purpose
 * (2026-08-12 ruling), and settings overrides use the canonical model +
 * thinking-level controls, never a raw JSON field.
 */

import { useEffect, useMemo, useState } from "react";
import {
  FlaskConical,
  History,
  Loader2,
  Plus,
  Save,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { SmartModelSelect } from "@/features/ai-models/components/smart/SmartModelSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fileIdFromUserFilesUrl } from "@/lib/media/durability";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { isJsonObject, type JsonValue } from "@/types/json";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  AGENT_SLOTS_SURFACE_NAME,
  AGENT_SLOTS_WRITE_TARGETS,
} from "@/features/surfaces/manifests/agent-slots.manifest";
import { parseSlotContract } from "@/features/agents/slots/overrides";
import {
  THINKING_LEVELS,
  type ThinkingLevel,
} from "@/features/agents/slots/components/SlotOverrideEditor";
import {
  clearSlotBenchSnapshot,
  nextSlotBenchId,
  publishSlotBenchSnapshot,
  readSlotBenchOwner,
} from "./bench-draft";
import {
  createSlotExemplar,
  deleteSlotExemplar,
  fetchAgentVersions,
  fetchSlotExemplars,
  parseSlotTestHistory,
  promoteSlotTestResult,
  resolveSlotDefaultAgentId,
  runSlotTests,
  saveSlotTestVerdictNote,
  type SlotDefinitionRow,
  type SlotExemplarRow,
  type SlotTestBatchResponse,
  type SlotTestCandidate,
  type SlotTestResponse,
  type SlotVersionInfo,
} from "./service";

type CandidateSelection = NonNullable<SlotTestCandidate["selection"]>;

interface CandidateDraft {
  draftId: string;
  selection: CandidateSelection;
  agentId: string | null;
  versionId: string | null;
  /** Version number behind `versionId` — captured at pick time so the
   * comparison can be labelled without refetching. */
  versionNumber: number | null;
  model: string | null;
  thinking: ThinkingLevel | null;
  settingsOpen: boolean;
}

const SELECTION_LABEL: Record<CandidateSelection, string> = {
  current: "Current setup (what users get now)",
  slot_pinned: "Pinned version",
  latest: "Latest version",
  agent: "Different system agent",
  version: "Specific saved version",
};

const THINKING_UNSET = "__default__";

function latestCandidate(): CandidateDraft {
  return {
    draftId: crypto.randomUUID(),
    selection: "latest",
    agentId: null,
    versionId: null,
    versionNumber: null,
    model: null,
    thinking: null,
    settingsOpen: false,
  };
}

function newCandidate(): CandidateDraft {
  return { ...latestCandidate(), selection: "current" };
}

/** Comparison names are derived — nobody labels their own columns. */
function candidateLabel(draft: CandidateDraft): string {
  switch (draft.selection) {
    case "current":
      return "Current setup";
    case "slot_pinned":
      return "Pinned version";
    case "latest":
      return "Latest version";
    case "agent":
      return "Different agent";
    case "version":
      return draft.versionNumber != null
        ? `v${draft.versionNumber}`
        : "Specific version";
  }
}

function candidateSettingsSummary(draft: CandidateDraft): string | null {
  const parts: string[] = [];
  if (draft.model) parts.push(draft.model);
  if (draft.thinking) parts.push(`${draft.thinking} thinking`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function OutputPreview({
  output,
  artifact,
}: {
  output: string;
  artifact: unknown;
}) {
  const fileId = output ? fileIdFromUserFilesUrl(output.trim()) : null;
  if (fileId) {
    return <InlineMediaRef ref={fileId} size="xl" fit="cover" />;
  }
  const text = artifact != null ? JSON.stringify(artifact, null, 1) : output;
  return (
    <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-[11px]">
      {text
        ? text.length > 3200
          ? `${text.slice(0, 3200)}…`
          : text
        : "(empty)"}
    </pre>
  );
}

/**
 * One run result, collapsed to a verdict line. The summary answers "did it
 * work?" at a glance; the full output, verdict note, and promote action live
 * behind the click.
 */
function ResultRow({
  result,
  onChanged,
}: {
  result: SlotTestResponse;
  onChanged: () => void;
}) {
  const [note, setNote] = useState(result.verdict_note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const structural = result.structural;
  const agentId = result.definition_agent_id ?? result.agent_id ?? null;

  async function saveNote() {
    if (!result.id || !result.exemplar_id) {
      toast.error("This result is missing its persisted identity.");
      return;
    }
    setSavingNote(true);
    try {
      await saveSlotTestVerdictNote(result.exemplar_id, result.id, note);
      toast.success("Verdict note saved.");
      onChanged();
    } catch (error: unknown) {
      toast.error(`Couldn't save verdict: ${describeError(error)}`);
    } finally {
      setSavingNote(false);
    }
  }

  async function promote() {
    if (!result.id || !result.exemplar_id) {
      toast.error("This result is missing its persisted identity.");
      return;
    }
    setPromoting(true);
    try {
      await promoteSlotTestResult(result.exemplar_id, result);
      toast.success("This result is now the test case's reference output.");
      onChanged();
    } catch (error: unknown) {
      toast.error(`Couldn't update the reference: ${describeError(error)}`);
    } finally {
      setPromoting(false);
    }
  }

  return (
    <details
      className={`rounded-md border ${
        result.error ? "border-destructive/60 bg-destructive/5" : "border-border"
      }`}
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-1.5 px-2 py-1.5 text-xs hover:bg-accent/40">
        <span className="font-semibold">{result.candidate_label}</span>
        {result.error ? (
          <Badge variant="destructive">failed</Badge>
        ) : structural.checked && !structural.ok ? (
          <Badge variant="destructive">wrong structure</Badge>
        ) : (
          <Badge variant="secondary">ran</Badge>
        )}
        <Badge variant="outline">
          {((result.duration_ms ?? 0) / 1000).toFixed(1)}s
        </Badge>
        {result.promoted_to_reference_at && (
          <Badge variant="secondary" className="gap-1">
            <Star className="h-3 w-3" /> reference
          </Badge>
        )}
      </summary>

      <div className="space-y-2 border-t border-border p-2">
        {agentId && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Ran:
            <EntityRef
              token="agent"
              id={agentId}
              name={agentId}
              href={`/agents/${agentId}`}
              openInNewTab
              wrap
              className="min-w-0"
              labelClassName="font-mono text-[10px]"
            />
          </div>
        )}

        {result.error ? (
          <div className="rounded bg-destructive/10 p-2 text-[11px] text-destructive">
            {result.error}
          </div>
        ) : (
          <>
            {(structural.errors ?? []).length > 0 && (
              <div className="text-[11px] text-destructive">
                {(structural.errors ?? []).slice(0, 4).join("; ")}
              </div>
            )}
            {structural.degraded_reason && (
              <div className="text-[11px] text-muted-foreground">
                {structural.degraded_reason}
              </div>
            )}
            <OutputPreview
              output={result.output ?? ""}
              artifact={result.artifact}
            />
          </>
        )}

        <div className="space-y-1">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Your verdict: better, worse, or still uncertain?"
            className="min-h-14 text-xs"
          />
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[11px]"
              disabled={savingNote}
              onClick={() => void saveNote()}
            >
              {savingNote ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Save verdict
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1 text-[11px]"
              disabled={promoting || Boolean(result.error)}
              onClick={() => void promote()}
            >
              {promoting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Star className="h-3 w-3" />
              )}
              Set as reference
            </Button>
          </div>
        </div>
      </div>
    </details>
  );
}

/** Optional per-comparison settings — the canonical model + thinking-level
 * controls, same pair the slot override editor uses. Never a JSON field. */
function CandidateSettings({
  draft,
  onChange,
}: {
  draft: CandidateDraft;
  onChange: (next: CandidateDraft) => void;
}) {
  return (
    <div className="grid gap-2 rounded-md bg-muted/20 p-2 sm:grid-cols-2">
      <label className="block">
        <span className="text-[11px] font-medium text-muted-foreground">
          Model
        </span>
        <div className="mt-1 flex items-center gap-1.5">
          <SmartModelSelect
            value={draft.model}
            onValueChange={(id) => onChange({ ...draft, model: id })}
            placeholder="Agent's own model"
            className="flex-1"
          />
          {draft.model && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => onChange({ ...draft, model: null })}
            >
              Reset
            </Button>
          )}
        </div>
      </label>
      <label className="block">
        <span className="text-[11px] font-medium text-muted-foreground">
          Thinking level
        </span>
        <Select
          value={draft.thinking ?? THINKING_UNSET}
          onValueChange={(value) =>
            onChange({
              ...draft,
              thinking:
                value === THINKING_UNSET ? null : (value as ThinkingLevel),
            })
          }
        >
          <SelectTrigger className="mt-1 h-8 text-[13px]">
            <SelectValue placeholder="Agent default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={THINKING_UNSET}>Agent default</SelectItem>
            {THINKING_LEVELS.map((level) => (
              <SelectItem key={level} value={level}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <p className="text-[11px] text-muted-foreground sm:col-span-2">
        Optional — leave both unset to run with the agent&apos;s own settings.
      </p>
    </div>
  );
}

function CandidateEditor({
  slot,
  draft,
  defaultAgentId,
  onChange,
  onRemove,
}: {
  slot: SlotDefinitionRow;
  draft: CandidateDraft;
  defaultAgentId: string | null;
  onChange: (next: CandidateDraft) => void;
  onRemove: () => void;
}) {
  const [versions, setVersions] = useState<SlotVersionInfo[]>([]);
  const [versionsForAgentId, setVersionsForAgentId] = useState<string | null>(
    null,
  );
  const versionAgentId = draft.agentId ?? defaultAgentId;
  const needsVersion = draft.selection === "version";

  useEffect(() => {
    if (!needsVersion || !versionAgentId) return;
    let cancelled = false;
    fetchAgentVersions(versionAgentId)
      .then((rows) => {
        if (!cancelled) {
          setVersions(rows);
          setVersionsForAgentId(versionAgentId);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(`Couldn't load agent versions: ${describeError(error)}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [needsVersion, versionAgentId]);

  const visibleVersions = versionsForAgentId === versionAgentId ? versions : [];
  const showsAgentPicker =
    draft.selection === "agent" || draft.selection === "version";
  const settingsSummary = candidateSettingsSummary(draft);

  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          value={draft.selection}
          onValueChange={(selection: CandidateSelection) =>
            onChange({
              ...draft,
              selection,
              versionId: selection === "version" ? draft.versionId : null,
              versionNumber:
                selection === "version" ? draft.versionNumber : null,
            })
          }
        >
          <SelectTrigger size="sm" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SELECTION_LABEL) as CandidateSelection[]).map(
              (selection) => (
                <SelectItem
                  key={selection}
                  value={selection}
                  disabled={
                    selection === "slot_pinned" &&
                    !slot.default_agent_version_id
                  }
                >
                  {SELECTION_LABEL[selection]}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        {showsAgentPicker && (
          <AgentListDropdown
            consumerId={`slot-bench-candidate-${draft.draftId}`}
            onSelect={(agentId) =>
              onChange({ ...draft, agentId, versionId: null, versionNumber: null })
            }
            activeAgentId={draft.agentId}
            label={draft.agentId ? undefined : "Choose system agent"}
            initialTab="system"
            visibleTabs={["system"]}
            systemTabLabel="System"
            contentSide="left"
            className="h-8 w-56 min-w-0"
          />
        )}

        {draft.selection === "version" && (
          <Select
            value={draft.versionId ?? undefined}
            onValueChange={(versionId) =>
              onChange({
                ...draft,
                versionId,
                versionNumber:
                  visibleVersions.find((version) => version.id === versionId)
                    ?.versionNumber ?? null,
              })
            }
            disabled={!versionAgentId || visibleVersions.length === 0}
          >
            <SelectTrigger size="sm" className="w-32">
              <SelectValue placeholder="Version" />
            </SelectTrigger>
            <SelectContent>
              {visibleVersions.map((version) => (
                <SelectItem key={version.id} value={version.id}>
                  v{version.versionNumber}
                  {version.name ? ` — ${version.name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1 text-[11px] text-muted-foreground"
          onClick={() =>
            onChange({ ...draft, settingsOpen: !draft.settingsOpen })
          }
        >
          <SlidersHorizontal className="h-3 w-3" />
          {settingsSummary ?? "Settings"}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="ml-auto h-8 w-8"
          aria-label="Remove comparison"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {draft.settingsOpen && (
        <CandidateSettings draft={draft} onChange={onChange} />
      )}
    </div>
  );
}

function ReferenceRow({ exemplar }: { exemplar: SlotExemplarRow }) {
  return (
    <details className="rounded-md border border-border">
      <summary className="flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-xs font-semibold hover:bg-accent/40">
        <Star className="h-3.5 w-3.5" /> Reference output
        {!exemplar.reference_output && !exemplar.reference_artifact && (
          <Badge variant="outline">none yet</Badge>
        )}
      </summary>
      <div className="border-t border-border p-2">
        {exemplar.reference_output || exemplar.reference_artifact ? (
          <OutputPreview
            output={exemplar.reference_output ?? ""}
            artifact={exemplar.reference_artifact}
          />
        ) : (
          <div className="rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
            No reference yet. Mark any good result with &ldquo;Set as
            reference&rdquo; and it becomes the bar every later run is judged
            against.
          </div>
        )}
      </div>
    </details>
  );
}

export function SlotTestBench({
  slot,
  baselineLabel = "Current — what users get now",
  presetLatestCandidate = false,
}: {
  slot: SlotDefinitionRow;
  /** Names the baseline column after the slot's actual pin state. */
  baselineLabel?: string;
  /** Version-drift slots start armed with a pinned-vs-latest comparison. */
  presetLatestCandidate?: boolean;
}) {
  const dispatch = useAppDispatch();
  const [exemplars, setExemplars] = useState<SlotExemplarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateDraft[]>(() =>
    presetLatestCandidate ? [latestCandidate()] : [],
  );
  // The slot's declared inputs — shown beside the composer so a test case can
  // be written without guessing the variable names.
  const contract = useMemo(() => parseSlotContract(slot.contract), [slot]);
  const [running, setRunning] = useState(false);
  const [batch, setBatch] = useState<SlotTestBatchResponse | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newVariables, setNewVariables] = useState("{}");
  const [newUserInput, setNewUserInput] = useState("");

  function loadExemplars() {
    return fetchSlotExemplars(slot.id)
      .then(setExemplars)
      .catch((error: unknown) =>
        toast.error(`Failed to load test cases: ${describeError(error)}`),
      )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    void loadExemplars();
    resolveSlotDefaultAgentId(slot)
      .then(setDefaultAgentId)
      .catch((error: unknown) =>
        toast.error(
          `Failed to resolve the slot agent: ${describeError(error)}`,
        ),
      );
  }, [slot.id]);

  function updateCandidate(draftId: string, next: CandidateDraft) {
    setCandidates((current) =>
      current.map((draft) => (draft.draftId === draftId ? next : draft)),
    );
  }

  function parseCandidate(draft: CandidateDraft): SlotTestCandidate | null {
    const label = candidateLabel(draft);
    let configOverrides: SlotTestCandidate["config_overrides"];
    const overrides: Record<string, JsonValue> = {};
    if (draft.model) overrides.model = draft.model;
    if (draft.thinking) overrides.thinking_level = draft.thinking;
    if (Object.keys(overrides).length > 0) configOverrides = overrides;
    if (draft.selection === "agent" && !draft.agentId) {
      toast.error(`${label}: choose a system agent.`);
      return null;
    }
    if (draft.selection === "version" && !draft.versionId) {
      toast.error(`${label}: choose a saved version.`);
      return null;
    }
    if (draft.selection === "slot_pinned" && !slot.default_agent_version_id) {
      toast.error(`${label}: this slot is not pinned to a version.`);
      return null;
    }
    return {
      candidate_id: draft.draftId,
      label,
      selection: draft.selection,
      agent_id:
        draft.selection === "agent" || draft.selection === "latest"
          ? draft.agentId
          : undefined,
      agent_version_id:
        draft.selection === "version" ? draft.versionId : undefined,
      config_overrides: configOverrides,
    };
  }

  async function runAll() {
    const parsedCandidates: SlotTestCandidate[] = [];
    for (const draft of candidates) {
      const parsed = parseCandidate(draft);
      if (!parsed) return;
      parsedCandidates.push(parsed);
    }
    // Two comparisons of the same kind get numbered so their result rows
    // stay tellable apart.
    const seen = new Map<string, number>();
    for (const candidate of parsedCandidates) {
      const count = (seen.get(candidate.label ?? "") ?? 0) + 1;
      seen.set(candidate.label ?? "", count);
      if (count > 1) candidate.label = `${candidate.label} (${count})`;
    }
    setRunning(true);
    try {
      const response = await runSlotTests(dispatch, slot.slot_key, {
        baseline: {
          candidate_id: "baseline",
          label: baselineLabel,
          selection: "current",
        },
        candidates: parsedCandidates,
      });
      setBatch(response);
      await loadExemplars();
      toast.success(
        `Ran ${response.exemplar_count} test case${response.exemplar_count === 1 ? "" : "s"} through ${response.columns.length} setup${response.columns.length === 1 ? "" : "s"}.`,
      );
    } catch (error: unknown) {
      toast.error(`Test run failed: ${describeError(error)}`);
    } finally {
      setRunning(false);
    }
  }

  async function addExemplar() {
    let variables;
    try {
      const parsed: unknown = JSON.parse(newVariables || "{}");
      if (!isJsonObject(parsed)) throw new Error("must be a JSON object");
      variables = parsed;
    } catch (error: unknown) {
      toast.error(`Variables ${describeError(error)}`);
      return;
    }
    try {
      await createSlotExemplar({
        slotId: slot.id,
        label: newLabel.trim() || "Manual test case",
        variables,
        userInput: newUserInput.trim() || null,
      });
      setAdding(false);
      setNewLabel("");
      setNewVariables("{}");
      setNewUserInput("");
      await loadExemplars();
      toast.success("Test case saved.");
    } catch (error: unknown) {
      toast.error(`Failed to save test case: ${describeError(error)}`);
    }
  }

  // ── Surface seam: publish the composer upward, accept writes into it ──────
  //
  // This component owns the exemplar composer, so the LIVE handler for
  // `slot_exemplar_draft` is registered here rather than on the console's
  // provider — `resolveHandlers` merges it over the console's base refusal
  // layer for exactly as long as a slot workbench is open. The console reads
  // the snapshot below inside `getScope()` to emit `slot_exemplar_draft` and
  // `selected_slot_exemplars`, the read twins of that target.
  // Lazy state, not a ref: the id is stable for this bench's whole life and is
  // read inside a handler, and a ref cannot be initialized during render.
  const [benchId] = useState(nextSlotBenchId);

  const exemplarSnapshots = useMemo(
    () =>
      exemplars.map((row) => ({
        id: row.id,
        label: row.label,
        variables: isJsonObject(row.variables) ? row.variables : null,
        user_input: row.user_input,
      })),
    [exemplars],
  );

  useEffect(() => {
    publishSlotBenchSnapshot(benchId, {
      slotId: slot.id,
      open: adding,
      label: newLabel,
      variables: newVariables,
      user_input: newUserInput,
      exemplars: exemplarSnapshots,
    });
  });

  useEffect(() => () => clearSlotBenchSnapshot(benchId), [benchId]);

  useSurfaceWriteHandlers(AGENT_SLOTS_SURFACE_NAME, {
    // Validate-then-apply: a test case is composed of three interdependent
    // fields, so NOTHING is staged until the whole object has passed. A throw
    // here becomes an error envelope the agent reads verbatim, which is why
    // each message names the legal shape rather than just saying "invalid".
    [AGENT_SLOTS_WRITE_TARGETS.exemplarDraft]: (value: unknown) => {
      // Am I still the composer on screen? Handlers are resolved before the
      // first confirm dialog, so a write staged alongside a `select_slot` that
      // applied first would otherwise land in THIS bench's setters after the
      // workbench had already remounted for another slot.
      if (readSlotBenchOwner() !== benchId) {
        throw new Error(
          "The workbench moved to a different slot after this write was staged, so this exemplar composer is no longer on screen. Re-read `selected_slot_id` and send the exemplar again for the slot that is actually open.",
        );
      }
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(
          "slot_exemplar_draft takes an object with at least one of { label, variables, user_input }.",
        );
      }
      const input = value as Record<string, unknown>;
      const known = ["label", "variables", "user_input"];
      const unknownKeys = Object.keys(input).filter((k) => !known.includes(k));
      if (unknownKeys.length > 0) {
        throw new Error(
          `slot_exemplar_draft does not accept ${unknownKeys.join(", ")}. Accepted keys: ${known.join(", ")}.`,
        );
      }
      if (Object.keys(input).length === 0) {
        throw new Error(
          `slot_exemplar_draft needs at least one of ${known.join(", ")} — an empty object changes nothing.`,
        );
      }

      let nextLabel: string | undefined;
      let nextVariables: string | undefined;
      let nextUserInput: string | undefined;

      if ("label" in input) {
        const label = input.label;
        if (typeof label !== "string" || label.trim() === "") {
          throw new Error(
            "label must be a non-empty string — a short name saying what this test case exercises.",
          );
        }
        nextLabel = label.trim();
      }

      if ("variables" in input) {
        const variables = input.variables;
        // An OBJECT, not a JSON string: the inline-tool layer parses a
        // JSON-looking argument before it ever reaches here, so accepting a
        // string would train the agent into double-encoding. The textarea's
        // string form is ours to produce.
        if (
          typeof variables !== "object" ||
          variables === null ||
          Array.isArray(variables)
        ) {
          throw new Error(
            "variables must be a JSON OBJECT of the slot's declared inputs (send `{}` for a slot whose contract declares none) — not a string, and not an array.",
          );
        }
        if (!isJsonObject(variables)) {
          throw new Error(
            "variables must contain only JSON values (strings, numbers, booleans, null, arrays, objects).",
          );
        }
        nextVariables = JSON.stringify(variables, null, 2);
      }

      if ("user_input" in input) {
        const userInput = input.user_input;
        if (typeof userInput !== "string") {
          throw new Error(
            "user_input must be a string — the end-user message this exemplar replays. Use an empty string for slots driven purely by variables.",
          );
        }
        nextUserInput = userInput;
      }

      // Everything validated — now stage it, and expand the composer so the
      // admin actually sees what landed.
      setAdding(true);
      if (nextLabel !== undefined) setNewLabel(nextLabel);
      if (nextVariables !== undefined) setNewVariables(nextVariables);
      if (nextUserInput !== undefined) setNewUserInput(nextUserInput);
    },
  });

  async function removeExemplar(exemplarId: string) {
    try {
      await deleteSlotExemplar(exemplarId);
      await loadExemplars();
      toast.success("Test case removed.");
    } catch (error: unknown) {
      toast.error(`Failed to remove test case: ${describeError(error)}`);
    }
  }

  return (
    <div className="space-y-3 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <FlaskConical className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <div className="text-sm font-semibold">Compare runs side by side</div>
          <div className="text-[11px] text-muted-foreground">
            Each saved test case runs through the current setup and every
            comparison you add. Runs execute as you.
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-8 gap-1 text-xs"
          onClick={() => setAdding((current) => !current)}
        >
          <Plus className="h-3.5 w-3.5" /> Test case
        </Button>
      </div>

      {adding && (
        <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-2">
          {contract.requiredVariables.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <span>Variables this slot expects:</span>
              {contract.requiredVariables.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] hover:bg-accent"
                  title={`Add "${name}" to the variables JSON`}
                  onClick={() =>
                    setNewVariables((current) => {
                      try {
                        const parsed: unknown = JSON.parse(current || "{}");
                        if (!isJsonObject(parsed) || name in parsed)
                          return current;
                        return JSON.stringify(
                          { ...parsed, [name]: "" },
                          null,
                          2,
                        );
                      } catch {
                        return current;
                      }
                    })
                  }
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <Input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Test case name — what does it exercise?"
            className="h-8 text-xs"
          />
          <Textarea
            value={newVariables}
            onChange={(event) => setNewVariables(event.target.value)}
            placeholder='Variables JSON, e.g. {"image_description": "…"}'
            className="min-h-20 font-mono text-xs"
          />
          <Textarea
            value={newUserInput}
            onChange={(event) => setNewUserInput(event.target.value)}
            placeholder="User message (optional)"
            className="min-h-16 text-xs"
          />
          <Button
            size="sm"
            className="h-7 w-fit text-xs"
            onClick={() => void addExemplar()}
          >
            Save test case
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {candidates.map((candidate) => (
          <CandidateEditor
            key={candidate.draftId}
            slot={slot}
            draft={candidate}
            defaultAgentId={defaultAgentId}
            onChange={(next) => updateCandidate(candidate.draftId, next)}
            onRemove={() =>
              setCandidates((current) =>
                current.filter((draft) => draft.draftId !== candidate.draftId),
              )
            }
          />
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-xs"
          onClick={() =>
            setCandidates((current) => [...current, newCandidate()])
          }
        >
          <Plus className="h-3.5 w-3.5" /> Add comparison
        </Button>
      </div>

      <Button
        size="sm"
        className="h-9 gap-1.5"
        disabled={running || exemplars.length === 0}
        title={
          exemplars.length === 0
            ? "Add a test case first — there is nothing to run yet."
            : undefined
        }
        onClick={() => void runAll()}
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FlaskConical className="h-4 w-4" />
        )}
        {exemplars.length > 1
          ? `Run ${exemplars.length} test cases`
          : "Run test case"}
      </Button>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading test cases…
        </div>
      ) : exemplars.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          No test cases yet — add one with &ldquo;+ Test case&rdquo; above.
          Production runs also save real examples automatically over time.
        </div>
      ) : (
        exemplars.map((exemplar) => {
          const currentGroup = batch?.exemplars.find(
            (group) => group.exemplar_id === exemplar.id,
          );
          const history = parseSlotTestHistory(exemplar.metadata);
          return (
            <section
              key={exemplar.id}
              className="space-y-2 rounded-md border border-border p-2"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold">{exemplar.label}</span>
                <Badge variant="outline">{exemplar.source}</Badge>
                <details className="text-muted-foreground">
                  <summary className="cursor-pointer">inputs</summary>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-1.5 text-[10px]">
                    {JSON.stringify(exemplar.variables, null, 1)}
                    {exemplar.user_input
                      ? `\nuser_input: ${exemplar.user_input}`
                      : ""}
                  </pre>
                </details>
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-auto h-7 w-7"
                  aria-label={`Delete ${exemplar.label}`}
                  onClick={() => void removeExemplar(exemplar.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>

              <div className="space-y-1.5">
                <ReferenceRow exemplar={exemplar} />
                {currentGroup?.results.map((result) => (
                  <ResultRow
                    key={result.id ?? result.candidate_id}
                    result={result}
                    onChanged={() => void loadExemplars()}
                  />
                ))}
              </div>

              {history.length > 0 && (
                <details>
                  <summary className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <History className="h-3.5 w-3.5" /> Past runs (
                    {history.length})
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {history.map((result) => (
                      <ResultRow
                        key={
                          result.id ??
                          `${result.candidate_id}-${result.created_at ?? "unknown"}`
                        }
                        result={result}
                        onChanged={() => void loadExemplars()}
                      />
                    ))}
                  </div>
                </details>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
