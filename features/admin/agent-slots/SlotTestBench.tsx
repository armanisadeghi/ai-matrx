"use client";

/**
 * Owner bench for agent slots.
 *
 * Three jobs, no generic runner framing:
 * 1. Compare the current binding against one or more named candidates on every
 *    exemplar in one batch.
 * 2. Promote any concrete result into the exemplar's reference.
 * 3. Reproduce what a specific user and/or organization binding resolves.
 */

import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  History,
  Loader2,
  Plus,
  Save,
  Star,
  Trash2,
  UserRoundCog,
  X,
} from "lucide-react";
import SearchableSelect, {
  type Option,
} from "@/components/matrx/SearchableSelect";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { AdminUserRef } from "@/features/admin/users/components/AdminUserRef";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
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
import { isJsonObject, toJsonRecord } from "@/types/json";
import {
  createSlotExemplar,
  deleteSlotExemplar,
  fetchAgentVersions,
  fetchSlotBenchPrincipalDirectory,
  fetchSlotExemplars,
  parseSlotTestHistory,
  promoteSlotTestResult,
  resolveSlotDefaultAgentId,
  runSlotTests,
  saveSlotTestVerdictNote,
  type SlotBenchPrincipalDirectory,
  type SlotDefinitionRow,
  type SlotExemplarRow,
  type SlotTestBatchResponse,
  type SlotTestCandidate,
  type SlotTestPrincipal,
  type SlotTestResponse,
  type SlotVersionInfo,
} from "./service";

type CandidateSelection = NonNullable<SlotTestCandidate["selection"]>;

interface CandidateDraft {
  draftId: string;
  label: string;
  selection: CandidateSelection;
  agentId: string | null;
  versionId: string | null;
  overridesText: string;
}

const SELECTION_LABEL: Record<CandidateSelection, string> = {
  current: "Current agent",
  slot_pinned: "Pinned slot version",
  latest: "Latest version",
  agent: "Different system agent",
  version: "Arbitrary saved version",
};

function newCandidate(index: number): CandidateDraft {
  return {
    draftId: crypto.randomUUID(),
    label: index === 0 ? "Latest version" : `Candidate ${index + 1}`,
    selection: index === 0 ? "latest" : "current",
    agentId: null,
    versionId: null,
    // The second starter candidate deliberately proves the important empty
    // object case: current agent with binding overrides removed.
    overridesText: index === 0 ? "" : "{}",
  };
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

function ResultCard({
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
      toast.success("This result is now the exemplar reference.");
      onChanged();
    } catch (error: unknown) {
      toast.error(`Couldn't update the reference: ${describeError(error)}`);
    } finally {
      setPromoting(false);
    }
  }

  return (
    <div
      className={`min-w-[260px] rounded-md border p-2 ${
        result.error
          ? "border-destructive/60 bg-destructive/5"
          : "border-border"
      }`}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-semibold">{result.candidate_label}</span>
        <Badge variant="outline">
          {((result.duration_ms ?? 0) / 1000).toFixed(1)}s
        </Badge>
        {result.error ? (
          <Badge variant="destructive">run failed</Badge>
        ) : structural.checked ? (
          <Badge variant={structural.ok ? "secondary" : "destructive"}>
            {structural.ok ? "structure OK" : "structure failed"}
          </Badge>
        ) : (
          <Badge variant="outline">structure unchecked</Badge>
        )}
        {result.promoted_to_reference_at && (
          <Badge variant="secondary" className="gap-1">
            <Star className="h-3 w-3" /> reference
          </Badge>
        )}
      </div>

      {agentId && (
        <div className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
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
            <div className="mb-1 text-[11px] text-destructive">
              {(structural.errors ?? []).slice(0, 4).join("; ")}
            </div>
          )}
          {structural.degraded_reason && (
            <div className="mb-1 text-[11px] text-muted-foreground">
              {structural.degraded_reason}
            </div>
          )}
          <OutputPreview
            output={result.output ?? ""}
            artifact={result.artifact}
          />
        </>
      )}

      <div className="mt-2 space-y-1">
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Owner verdict: what is better, worse, or still uncertain?"
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
            Make reference
          </Button>
        </div>
      </div>
    </div>
  );
}

function CandidateEditor({
  slot,
  draft,
  defaultAgentId,
  canRemove,
  onChange,
  onRemove,
}: {
  slot: SlotDefinitionRow;
  draft: CandidateDraft;
  defaultAgentId: string | null;
  canRemove: boolean;
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

  return (
    <div className="grid gap-2 rounded-md border border-border bg-card p-2 lg:grid-cols-[minmax(150px,0.7fr)_minmax(170px,0.8fr)_minmax(220px,1fr)_auto]">
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          Column label
        </label>
        <Input
          value={draft.label}
          onChange={(event) =>
            onChange({ ...draft, label: event.target.value })
          }
          className="h-8 text-xs"
          placeholder="Candidate label"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          What to run
        </label>
        <Select
          value={draft.selection}
          onValueChange={(selection: CandidateSelection) =>
            onChange({
              ...draft,
              selection,
              versionId: selection === "version" ? draft.versionId : null,
            })
          }
        >
          <SelectTrigger size="sm">
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
      </div>
      <div className="space-y-1">
        {showsAgentPicker ? (
          <>
            <label className="text-[11px] font-medium text-muted-foreground">
              {draft.selection === "version"
                ? "System agent and saved version"
                : "System agent"}
            </label>
            <div className="flex gap-1">
              <AgentListDropdown
                consumerId={`slot-bench-candidate-${draft.draftId}`}
                onSelect={(agentId) =>
                  onChange({ ...draft, agentId, versionId: null })
                }
                activeAgentId={draft.agentId}
                label={draft.agentId ? undefined : "Choose system agent"}
                initialTab="system"
                visibleTabs={["system"]}
                systemTabLabel="System"
                contentSide="left"
                className="h-8 min-w-0 flex-1"
              />
              {draft.selection === "version" && (
                <Select
                  value={draft.versionId ?? undefined}
                  onValueChange={(versionId) =>
                    onChange({ ...draft, versionId })
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
            </div>
          </>
        ) : (
          <>
            <label className="text-[11px] font-medium text-muted-foreground">
              Settings override JSON
            </label>
            <Input
              value={draft.overridesText}
              onChange={(event) =>
                onChange({ ...draft, overridesText: event.target.value })
              }
              className="h-8 font-mono text-xs"
              placeholder="Blank = inherit; {} = remove binding settings"
            />
          </>
        )}
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="mt-5 h-8 w-8"
        disabled={!canRemove}
        aria-label="Remove candidate"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
      {showsAgentPicker && (
        <div className="lg:col-span-3">
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Settings override JSON
          </label>
          <Input
            value={draft.overridesText}
            onChange={(event) =>
              onChange({ ...draft, overridesText: event.target.value })
            }
            className="h-8 font-mono text-xs"
            placeholder="Blank = inherit; {} = no settings overrides"
          />
        </div>
      )}
    </div>
  );
}

function PrincipalPicker({
  directory,
  principal,
  onChange,
}: {
  directory: SlotBenchPrincipalDirectory;
  principal: SlotTestPrincipal;
  onChange: (next: SlotTestPrincipal) => void;
}) {
  const userOptions: Option[] = directory.users.map((user) => ({
    value: user.id,
    label: `${user.display_name ?? user.full_name ?? "Unnamed user"} — ${user.email ?? user.id}`,
  }));
  const organizationOptions: Option[] = directory.organizations.map(
    (organization) => ({
      value: organization.id,
      label: organization.name,
    }),
  );
  const selectedUser = directory.users.find(
    (user) => user.id === principal.user_id,
  );
  const selectedOrganization = directory.organizations.find(
    (organization) => organization.id === principal.organization_id,
  );

  return (
    <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-2 md:grid-cols-2">
      <div className="space-y-1">
        <div className="text-[11px] font-medium text-muted-foreground">
          User binding to reproduce
        </div>
        <SearchableSelect
          options={userOptions}
          value={principal.user_id ?? undefined}
          onChange={(option) =>
            onChange({ ...principal, user_id: option.value })
          }
          placeholder="No user binding"
          searchPlaceholder="Search name or email…"
          className="h-9 border"
        />
        {selectedUser && (
          <div className="flex items-center gap-1">
            <AdminUserRef
              userId={selectedUser.id}
              name={selectedUser.display_name ?? selectedUser.full_name}
              email={selectedUser.email}
              hideEmail
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px]"
              onClick={() => onChange({ ...principal, user_id: null })}
            >
              Clear
            </Button>
          </div>
        )}
      </div>
      <div className="space-y-1">
        <div className="text-[11px] font-medium text-muted-foreground">
          Organization binding to reproduce
        </div>
        <SearchableSelect
          options={organizationOptions}
          value={principal.organization_id ?? undefined}
          onChange={(option) =>
            onChange({ ...principal, organization_id: option.value })
          }
          placeholder="No organization binding"
          searchPlaceholder="Search organizations…"
          className="h-9 border"
        />
        {selectedOrganization && (
          <div className="flex items-center gap-1">
            <EntityRef
              token="organization"
              id={selectedOrganization.id}
              name={selectedOrganization.name}
              href={`/administration/users/organizations?org=${selectedOrganization.id}`}
              openInNewTab
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px]"
              onClick={() => onChange({ ...principal, organization_id: null })}
            >
              Clear
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReferenceCard({ exemplar }: { exemplar: SlotExemplarRow }) {
  return (
    <div className="min-w-[260px] rounded-md border border-border p-2">
      <div className="mb-1 flex items-center gap-1 text-xs font-semibold">
        <Star className="h-3.5 w-3.5" /> Owner reference
      </div>
      {exemplar.reference_output || exemplar.reference_artifact ? (
        <OutputPreview
          output={exemplar.reference_output ?? ""}
          artifact={exemplar.reference_artifact}
        />
      ) : (
        <div className="rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
          No reference yet. Promote any successful result with “Make reference.”
        </div>
      )}
    </div>
  );
}

export function SlotTestBench({ slot }: { slot: SlotDefinitionRow }) {
  const dispatch = useAppDispatch();
  const [exemplars, setExemplars] = useState<SlotExemplarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateDraft[]>(() => [
    newCandidate(0),
    newCandidate(1),
  ]);
  const [running, setRunning] = useState(false);
  const [batch, setBatch] = useState<SlotTestBatchResponse | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newVariables, setNewVariables] = useState("{}");
  const [newUserInput, setNewUserInput] = useState("");
  const [principalEnabled, setPrincipalEnabled] = useState(false);
  const [principal, setPrincipal] = useState<SlotTestPrincipal>({});
  const [directory, setDirectory] =
    useState<SlotBenchPrincipalDirectory | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(false);

  function loadExemplars() {
    return fetchSlotExemplars(slot.id)
      .then(setExemplars)
      .catch((error: unknown) =>
        toast.error(`Failed to load exemplars: ${describeError(error)}`),
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

  async function togglePrincipal() {
    if (principalEnabled) {
      setPrincipalEnabled(false);
      return;
    }
    setPrincipalEnabled(true);
    if (directory || directoryLoading) return;
    setDirectoryLoading(true);
    try {
      setDirectory(await fetchSlotBenchPrincipalDirectory());
    } catch (error: unknown) {
      toast.error(`Failed to load principals: ${describeError(error)}`);
    } finally {
      setDirectoryLoading(false);
    }
  }

  function updateCandidate(draftId: string, next: CandidateDraft) {
    setCandidates((current) =>
      current.map((draft) => (draft.draftId === draftId ? next : draft)),
    );
  }

  function parseCandidate(draft: CandidateDraft): SlotTestCandidate | null {
    if (!draft.label.trim()) {
      toast.error("Every comparison column needs a label.");
      return null;
    }
    let configOverrides: SlotTestCandidate["config_overrides"];
    if (draft.overridesText.trim()) {
      try {
        const parsed: unknown = JSON.parse(draft.overridesText);
        if (!isJsonObject(parsed)) throw new Error("must be a JSON object");
        configOverrides = toJsonRecord(parsed);
      } catch (error: unknown) {
        toast.error(
          `${draft.label}: settings override ${describeError(error)}`,
        );
        return null;
      }
    }
    if (draft.selection === "agent" && !draft.agentId) {
      toast.error(`${draft.label}: choose a system agent.`);
      return null;
    }
    if (draft.selection === "version" && !draft.versionId) {
      toast.error(`${draft.label}: choose a saved version.`);
      return null;
    }
    if (draft.selection === "slot_pinned" && !slot.default_agent_version_id) {
      toast.error(`${draft.label}: this slot is not pinned to a version.`);
      return null;
    }
    return {
      candidate_id: draft.draftId,
      label: draft.label.trim(),
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
    setRunning(true);
    try {
      const response = await runSlotTests(dispatch, slot.slot_key, {
        baseline: {
          candidate_id: "baseline",
          label: "Baseline — current binding",
          selection: "current",
        },
        candidates: parsedCandidates,
        principal: principalEnabled ? principal : undefined,
      });
      setBatch(response);
      await loadExemplars();
      toast.success(
        `Compared ${response.columns.length} columns across ${response.exemplar_count} exemplar${response.exemplar_count === 1 ? "" : "s"}.`,
      );
    } catch (error: unknown) {
      toast.error(`Bench batch failed: ${describeError(error)}`);
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
        label: newLabel.trim() || "Manual exemplar",
        variables,
        userInput: newUserInput.trim() || null,
      });
      setAdding(false);
      setNewLabel("");
      setNewVariables("{}");
      setNewUserInput("");
      await loadExemplars();
      toast.success("Exemplar saved.");
    } catch (error: unknown) {
      toast.error(`Failed to save exemplar: ${describeError(error)}`);
    }
  }

  async function removeExemplar(exemplarId: string) {
    try {
      await deleteSlotExemplar(exemplarId);
      await loadExemplars();
      toast.success("Exemplar removed.");
    } catch (error: unknown) {
      toast.error(`Failed to remove exemplar: ${describeError(error)}`);
    }
  }

  return (
    <div className="space-y-3 border-t border-border px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <FlaskConical className="h-4 w-4 text-muted-foreground" />
        <div>
          <div className="text-sm font-semibold">
            Is the new version better?
          </div>
          <div className="text-[11px] text-muted-foreground">
            One click runs the baseline and every candidate against every
            exemplar. Results and owner verdicts persist with the exemplar.
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-8 gap-1 text-xs"
          onClick={() => setAdding((current) => !current)}
        >
          <Plus className="h-3.5 w-3.5" /> Exemplar
        </Button>
      </div>

      {adding && (
        <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-2">
          <Input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Exemplar label"
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
            Save exemplar
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
            canRemove={candidates.length > 1}
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
            setCandidates((current) => [
              ...current,
              newCandidate(current.length),
            ])
          }
        >
          <Plus className="h-3.5 w-3.5" /> Add comparison column
        </Button>
      </div>

      <div className="space-y-2">
        <Button
          size="sm"
          variant={principalEnabled ? "secondary" : "outline"}
          className="h-8 gap-1.5 text-xs"
          onClick={() => void togglePrincipal()}
        >
          <UserRoundCog className="h-3.5 w-3.5" />
          {principalEnabled ? "Testing as a principal" : "Test as principal"}
          {principalEnabled ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </Button>
        {principalEnabled &&
          (directoryLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading users and
              organizations…
            </div>
          ) : directory ? (
            <PrincipalPicker
              directory={directory}
              principal={principal}
              onChange={setPrincipal}
            />
          ) : (
            <div className="text-xs text-destructive">
              Principal directory unavailable.
            </div>
          ))}
      </div>

      <Button
        size="sm"
        className="h-9 gap-1.5"
        disabled={running || exemplars.length === 0}
        onClick={() => void runAll()}
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FlaskConical className="h-4 w-4" />
        )}
        Run all exemplars
      </Button>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading exemplars…
        </div>
      ) : exemplars.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          No exemplars yet. Add one manually now; production runs also capture
          them automatically.
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

              <div className="overflow-x-auto pb-1">
                <div className="flex min-w-max gap-2">
                  <ReferenceCard exemplar={exemplar} />
                  {currentGroup?.results.map((result) => (
                    <ResultCard
                      key={result.id ?? result.candidate_id}
                      result={result}
                      onChanged={() => void loadExemplars()}
                    />
                  ))}
                </div>
              </div>

              {history.length > 0 && (
                <details>
                  <summary className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <History className="h-3.5 w-3.5" /> Persisted history (
                    {history.length})
                  </summary>
                  <div className="mt-2 overflow-x-auto pb-1">
                    <div className="flex min-w-max gap-2">
                      {history.map((result) => (
                        <ResultCard
                          key={
                            result.id ??
                            `${result.candidate_id}-${result.created_at ?? "unknown"}`
                          }
                          result={result}
                          onChanged={() => void loadExemplars()}
                        />
                      ))}
                    </div>
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
