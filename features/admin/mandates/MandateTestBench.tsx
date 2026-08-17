"use client";

/**
 * Owner bench for mandates — "is this change going to break the agent?"
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

import { useEffect, useMemo, useRef, useState } from "react";
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
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { RunConfigOverrides } from "@/features/agents/components/run-controls/RunConfigOverrides";
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
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { isJsonObject, toJsonRecord } from "@/types/json";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  MANDATES_SURFACE_NAME,
  AGENT_MANDATES_WRITE_TARGETS,
} from "@/features/surfaces/manifests/mandates.manifest";
import { parseMandateContract } from "@/features/agents/mandates/overrides";
import { fetchAgentExecutionFull } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentCustomExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import { initInstanceOverrides } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import {
  selectInstanceOverrideState,
  selectOverriddenKeys,
  selectSettingsOverridesForApi,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { buildInstanceBaseSettings } from "@/features/agents/redux/execution-system/instance-model-overrides/base-settings";
import { OutputPreview } from "./bench-output-preview";
import { TryItNowPanel } from "./TryItNowPanel";
import {
  clearMandateBenchSnapshot,
  nextMandateBenchId,
  publishMandateBenchSnapshot,
  readMandateBenchOwner,
} from "./bench-draft";
import {
  createMandateExemplar,
  deleteMandateExemplar,
  fetchAgentVersions,
  fetchMandateExemplars,
  parseMandateTestHistory,
  promoteMandateTestResult,
  resolveMandateDefaultAgentId,
  runMandateTests,
  saveMandateTestVerdictNote,
  type MandateDefinitionRow,
  type MandateExemplarRow,
  type MandateTestBatchResponse,
  type MandateTestCandidate,
  type MandateTestResponse,
  type MandateVersionInfo,
} from "./service";

type CandidateSelection = NonNullable<MandateTestCandidate["selection"]>;

interface CandidateDraft {
  draftId: string;
  selection: CandidateSelection;
  agentId: string | null;
  versionId: string | null;
  /** Version number behind `versionId` — captured at pick time so the
   * comparison can be labelled without refetching. */
  versionNumber: number | null;
  settingsOpen: boolean;
}

/** Each comparison's settings ride the CANONICAL overrides layer — the same
 * `instanceModelOverrides` slice + `RunConfigOverrides` editor the chat's
 * smart input uses, keyed by this synthetic id. The API selector re-diffs
 * against the agent's base, so a base-equal value never reaches the wire
 * (the backend rejects defaults disguised as overrides). */
function benchOverridesId(draftId: string): string {
  return `mandate-bench-${draftId}`;
}

const SELECTION_LABEL: Record<CandidateSelection, string> = {
  current: "Current setup (what users get now)",
  slot_pinned: "Pinned version",
  latest: "Latest version",
  agent: "Different system agent",
  version: "Specific saved version",
};

function latestCandidate(): CandidateDraft {
  return {
    draftId: crypto.randomUUID(),
    selection: "latest",
    agentId: null,
    versionId: null,
    versionNumber: null,
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

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  result: MandateTestResponse;
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
      await saveMandateTestVerdictNote(result.exemplar_id, result.id, note);
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
      await promoteMandateTestResult(result.exemplar_id, result);
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

function CandidateEditor({
  mandate,
  draft,
  defaultAgentId,
  onChange,
  onRemove,
}: {
  mandate: MandateDefinitionRow;
  draft: CandidateDraft;
  defaultAgentId: string | null;
  onChange: (next: CandidateDraft) => void;
  onRemove: () => void;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [versions, setVersions] = useState<MandateVersionInfo[]>([]);
  const [versionsForAgentId, setVersionsForAgentId] = useState<string | null>(
    null,
  );
  const versionAgentId = draft.agentId ?? defaultAgentId;
  const needsVersion = draft.selection === "version";

  // Canonical per-comparison settings: this draft's entry in the
  // instanceModelOverrides slice, edited by the same RunConfigOverrides the
  // chat uses. Seeded lazily the first time Settings opens.
  const overridesId = benchOverridesId(draft.draftId);
  const overridesReady = useAppSelector((state) =>
    Boolean(selectInstanceOverrideState(overridesId)(state)),
  );
  const overriddenKeys = useAppSelector(selectOverriddenKeys(overridesId));
  const overriddenCount =
    (overriddenKeys?.changed.length ?? 0) +
    (overriddenKeys?.removed.length ?? 0);

  async function toggleSettings() {
    if (draft.settingsOpen) {
      onChange({ ...draft, settingsOpen: false });
      return;
    }
    onChange({ ...draft, settingsOpen: true });
    if (overridesReady) return;
    // Seed the base from the agent this comparison actually runs, so the
    // editor shows the agent's model's real controls and effective values —
    // and so the API diff has a base to compare against.
    const agentId = draft.agentId ?? defaultAgentId;
    let baseSettings = {};
    if (agentId) {
      try {
        await dispatch(fetchAgentExecutionFull(agentId)).unwrap();
        const payload = selectAgentCustomExecutionPayload(
          store.getState(),
          agentId,
        );
        if (payload.isReady) {
          baseSettings = buildInstanceBaseSettings(
            payload.settings,
            payload.modelId,
          );
        }
      } catch (error: unknown) {
        toast.error(
          `Couldn't load the agent's settings (${describeError(error)}) — starting from a blank base.`,
        );
      }
    }
    dispatch(initInstanceOverrides({ conversationId: overridesId, baseSettings }));
  }

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
                    !mandate.default_agent_version_id
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
            consumerId={`mandate-bench-candidate-${draft.draftId}`}
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
          variant={overriddenCount > 0 ? "secondary" : "ghost"}
          className="h-8 gap-1 text-[11px] text-muted-foreground"
          onClick={() => void toggleSettings()}
        >
          <SlidersHorizontal className="h-3 w-3" />
          {overriddenCount > 0
            ? `Settings (${overriddenCount} overridden)`
            : "Settings"}
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

      {draft.settingsOpen &&
        (overridesReady ? (
          <div className="rounded-md bg-muted/20">
            <RunConfigOverrides conversationId={overridesId} />
          </div>
        ) : (
          <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading the agent&apos;s settings…
          </div>
        ))}
    </div>
  );
}

function ReferenceRow({ exemplar }: { exemplar: MandateExemplarRow }) {
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

export function MandateTestBench({
  mandate,
  baselineLabel = "Current — what users get now",
  presetLatestCandidate = false,
  autoRunSignal = 0,
  passesUserInput,
}: {
  mandate: MandateDefinitionRow;
  /** Code truth: some call site sends this mandate a user message, so the ad-hoc
   * runner offers one. `undefined` = code truth could not answer, which is NOT
   * the same as "no" — the runner offers the field anyway. */
  passesUserInput?: boolean;
  /** Names the baseline column after the mandate's actual pin state. */
  baselineLabel?: string;
  /** Version-drift mandates start armed with a pinned-vs-latest comparison. */
  presetLatestCandidate?: boolean;
  /** Bumped by "Test old vs new first" — the bench RUNS the armed comparison
   * (a button that only scrolled here read as doing nothing). */
  autoRunSignal?: number;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [exemplars, setExemplars] = useState<MandateExemplarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateDraft[]>(() =>
    presetLatestCandidate ? [latestCandidate()] : [],
  );
  // The mandate's declared inputs — shown beside the composer so a test case can
  // be written without guessing the variable names.
  const contract = useMemo(() => parseMandateContract(mandate.contract), [mandate]);
  const [running, setRunning] = useState(false);
  const [batch, setBatch] = useState<MandateTestBatchResponse | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newVariables, setNewVariables] = useState("{}");
  const [newUserInput, setNewUserInput] = useState("");

  function loadExemplars() {
    return fetchMandateExemplars(mandate.id)
      .then(setExemplars)
      .catch((error: unknown) =>
        toast.error(`Failed to load test cases: ${describeError(error)}`),
      )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    void loadExemplars();
    resolveMandateDefaultAgentId(mandate)
      .then(setDefaultAgentId)
      .catch((error: unknown) =>
        toast.error(
          `Failed to resolve the mandate agent: ${describeError(error)}`,
        ),
      );
  }, [mandate.id]);

  function updateCandidate(draftId: string, next: CandidateDraft) {
    setCandidates((current) =>
      current.map((draft) => (draft.draftId === draftId ? next : draft)),
    );
  }

  function parseCandidate(draft: CandidateDraft): MandateTestCandidate | null {
    const label = candidateLabel(draft);
    // The canonical API-overrides selector: genuine deltas only (base-equal
    // values are re-diffed away; removals travel as explicit nulls).
    const overrides = selectSettingsOverridesForApi(
      benchOverridesId(draft.draftId),
    )(store.getState());
    const configOverrides: MandateTestCandidate["config_overrides"] =
      overrides && isJsonObject(overrides) ? toJsonRecord(overrides) : undefined;
    if (draft.selection === "agent" && !draft.agentId) {
      toast.error(`${label}: choose a system agent.`);
      return null;
    }
    if (draft.selection === "version" && !draft.versionId) {
      toast.error(`${label}: choose a saved version.`);
      return null;
    }
    if (draft.selection === "slot_pinned" && !mandate.default_agent_version_id) {
      toast.error(`${label}: this mandate is not pinned to a version.`);
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
    const parsedCandidates: MandateTestCandidate[] = [];
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
      const response = await runMandateTests(dispatch, mandate.slot_key, {
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

  // "Test old vs new first" runs the armed comparison the moment the bench is
  // ready — a click that only scrolled here correctly read as a dead button.
  const autoRanRef = useRef(0);
  useEffect(() => {
    if (!autoRunSignal || autoRunSignal === autoRanRef.current) return;
    if (loading || running) return;
    autoRanRef.current = autoRunSignal;
    if (exemplars.length === 0) {
      toast.info(
        "Add a test case first — the comparison needs sample inputs to run.",
      );
      return;
    }
    if (candidates.length === 0) {
      toast.info(
        "Add a comparison first — a batch runs the current setup against something.",
      );
      return;
    }
    // Deferred so the batch kickoff's setState never runs inside the effect
    // body (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => void runAll(), 0);
    return () => clearTimeout(timer);
  });

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
      await createMandateExemplar({
        mandateId: mandate.id,
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
  // `mandate_exemplar_draft` is registered here rather than on the console's
  // provider — `resolveHandlers` merges it over the console's base refusal
  // layer for exactly as long as a mandate workbench is open. The console reads
  // the snapshot below inside `getScope()` to emit `mandate_exemplar_draft` and
  // `selected_mandate_exemplars`, the read twins of that target.
  // Lazy state, not a ref: the id is stable for this bench's whole life and is
  // read inside a handler, and a ref cannot be initialized during render.
  const [benchId] = useState(nextMandateBenchId);

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
    publishMandateBenchSnapshot(benchId, {
      mandateId: mandate.id,
      open: adding,
      label: newLabel,
      variables: newVariables,
      user_input: newUserInput,
      exemplars: exemplarSnapshots,
    });
  });

  useEffect(() => () => clearMandateBenchSnapshot(benchId), [benchId]);

  useSurfaceWriteHandlers(MANDATES_SURFACE_NAME, {
    // Validate-then-apply: a test case is composed of three interdependent
    // fields, so NOTHING is staged until the whole object has passed. A throw
    // here becomes an error envelope the agent reads verbatim, which is why
    // each message names the legal shape rather than just saying "invalid".
    [AGENT_MANDATES_WRITE_TARGETS.exemplarDraft]: (value: unknown) => {
      // Am I still the composer on screen? Handlers are resolved before the
      // first confirm dialog, so a write staged alongside a `select_mandate` that
      // applied first would otherwise land in THIS bench's setters after the
      // workbench had already remounted for another mandate.
      if (readMandateBenchOwner() !== benchId) {
        throw new Error(
          "The workbench moved to a different mandate after this write was staged, so this exemplar composer is no longer on screen. Re-read `selected_mandate_id` and send the exemplar again for the mandate that is actually open.",
        );
      }
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(
          "mandate_exemplar_draft takes an object with at least one of { label, variables, user_input }.",
        );
      }
      const input = value as Record<string, unknown>;
      const known = ["label", "variables", "user_input"];
      const unknownKeys = Object.keys(input).filter((k) => !known.includes(k));
      if (unknownKeys.length > 0) {
        throw new Error(
          `mandate_exemplar_draft does not accept ${unknownKeys.join(", ")}. Accepted keys: ${known.join(", ")}.`,
        );
      }
      if (Object.keys(input).length === 0) {
        throw new Error(
          `mandate_exemplar_draft needs at least one of ${known.join(", ")} — an empty object changes nothing.`,
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
            "variables must be a JSON OBJECT of the mandate's declared inputs (send `{}` for a mandate whose contract declares none) — not a string, and not an array.",
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
            "user_input must be a string — the end-user message this exemplar replays. Use an empty string for mandates driven purely by variables.",
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
      await deleteMandateExemplar(exemplarId);
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
              <span>Variables this mandate expects:</span>
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

      <TryItNowPanel
        mandate={mandate}
        defaultAgentId={defaultAgentId}
        passesUserInput={passesUserInput}
        onSavedTestCase={() => void loadExemplars()}
      />

      <div className="space-y-2">
        {candidates.map((candidate) => (
          <CandidateEditor
            key={candidate.draftId}
            mandate={mandate}
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
        // A batch is a COMPARISON: the server requires at least one column
        // beside the baseline. Without this the click reached the API and
        // came back as a raw "body.candidates: List should have at least 1
        // item" validation error.
        disabled={running || exemplars.length === 0 || candidates.length === 0}
        title={
          exemplars.length === 0
            ? "Add a test case first — there is nothing to run yet."
            : candidates.length === 0
              ? "Add a comparison first — a batch runs your current setup against something. To run the current setup on its own, use “Try it now”."
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
          No test cases yet — run the mandate once with &ldquo;Try it now&rdquo;
          above and save that run, or write one by hand with &ldquo;+ Test
          case&rdquo;. Production runs also save real examples automatically
          over time.
        </div>
      ) : (
        exemplars.map((exemplar) => {
          const currentGroup = batch?.exemplars.find(
            (group) => group.exemplar_id === exemplar.id,
          );
          const history = parseMandateTestHistory(exemplar.metadata);
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
