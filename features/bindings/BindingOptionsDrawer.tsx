"use client";

// One treatment draft and save boundary, shared by the legacy drawer and
// the mandate Display Options, Overrides, and Permissions tabs.

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import {
  ConfigurationTable,
  ConfigurationTableRow,
  FieldHelp,
  PropertyRow,
  StatusToken,
} from "@/components/official/ConfigurationFields";
import { Skeleton } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  canEditAccess,
  type ResourceAccess,
} from "@/utils/permissions/access-core";
import { getResourceAccess } from "@/utils/permissions/access";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { WidgetPicker } from "@/features/agent-shortcuts/components/next/WidgetPicker";
import {
  SettingsSection,
  type SettingsFields,
} from "@/features/agent-shortcuts/components/next/SettingsSection";
import {
  AdvancedSection,
  type AdvancedFields,
} from "@/features/agent-shortcuts/components/next/AdvancedSection";
import { WritePolicyEditor } from "@/features/surfaces/components/bind/WritePolicyEditor";
import { getManifest } from "@/features/surfaces/manifests/registry";
import type { WritePolicyMap } from "@/features/surfaces/types";
import type { AgentShortcut } from "@/features/agents/redux/agent-shortcuts/types";

import {
  defaultPresentation,
  presentationIsDefault,
  type BindingPresentation,
} from "./treatment-shape";
import {
  readPresentation,
  writePresentation,
  type PresentationOwner,
} from "./treatment-writer";
import {
  JOB_ADVANCED_WORDS,
  JOB_SETTINGS_WORDS,
  JOB_TREATMENT_OVERRIDE_WORDS,
} from "./words";

const LAUNCH_SCOPE_COLUMNS = [
  { key: "defaults", label: "Preferences for" },
  {
    key: "features",
    label: "Feature-launch support",
    help: "Features can override these defaults or use a different renderer. Per-feature support is not reported to this editor. Display test exercises the default launch, not the original feature.",
  },
];
const GATE_UNAVAILABLE =
  "Unavailable: mandate launches cannot guarantee a confirmation gate across all callers. Some features explicitly bypass it. Saved gate values are preserved.";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export interface BindingOptionsDrawerProps {
  owner: PresentationOwner;
  /**
   * The binding's live auto-run fact, so the gate cascade reveals itself
   * exactly when it is meaningful. The drawer never writes it.
   */
  autoRun: boolean;
  /** The organization's name, for the sentence about who these options cover. */
  organizationName: string | null;
  /**
   * F4 — the surface this job's stored treatment names, reported UPWARD the
   * moment it is read. This drawer is the one reader of that row, so the AI map
   * tab above gets its write targets from here rather than reading the row a
   * second time and risking two answers to one question.
   */
  onSurfaceRead?: (surfaceName: string | null) => void;
  /**
   * F4 — write policies the AI map proposed and the person accepted. They land
   * in the SAME editor the manual path uses, unsaved, so every line is still
   * reviewable and the drawer's own Save is what commits them.
   */
  proposedWritePolicies?: WritePolicyMap | null;
  /** Fired once the proposals above have been taken into the draft. */
  onProposalsTaken?: () => void;
  disabled?: boolean;
  /** Keep one instance mounted while changing this section to retain drafts. */
  section?: "display" | "overrides" | "permissions";
}

export function BindingOptionsDrawer({
  owner,
  autoRun,
  organizationName,
  onSurfaceRead,
  proposedWritePolicies = null,
  onProposalsTaken,
  disabled = false,
  section,
}: BindingOptionsDrawerProps) {
  const [open, setOpen] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const [load, setLoad] = useState<LoadState>({ status: "idle" });
  const [treatmentId, setTreatmentId] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [draft, setDraft] = useState<BindingPresentation>(defaultPresentation);
  const [saved, setSaved] = useState<BindingPresentation>(defaultPresentation);
  const [savedEnabled, setSavedEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [access, setAccess] = useState<ResourceAccess | null>(null);
  const editable =
    load.status === "ready" &&
    (treatmentId === null || (access !== null && canEditAccess(access.level)));
  const controlsDisabled = disabled || busy || !editable;

  // 🚨 THE READ HAPPENS ON MOUNT, NOT ON OPEN — and the walk is why.
  // It read on open first, which meant the CLOSED trigger could not say how
  // many options this job has answered: the badge only appeared after you had
  // already opened the drawer to find out, which is the exact question the
  // badge exists to answer. A folded control that cannot tell you whether
  // there is anything behind it is silent, not restrained. The cost of being
  // honest instead is one single-row read on the partial unique index
  // `treatment_default_uq` — the same one both resolvers use.
  //
  // 🚨 THE LATCH IS A REF, NOT THE LOAD STATE — and this is not a style choice.
  // Gating on `load.status !== "idle"` with `load.status` in the deps is a trap
  // that eats its own request: setting "loading" re-runs the effect, whose
  // CLEANUP flips the first run's `cancelled` flag, so the answer that arrives
  // is thrown away — and the re-run returns early because the status is no
  // longer idle. The drawer then says "Reading this job's options…" forever.
  // Caught on the live walk of v0.4.1561, fixed here at the class: the "have I
  // asked yet" latch must not be a value the asking itself changes.
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (startedFor.current === owner.mandateId) return;
    startedFor.current = owner.mandateId;
    let cancelled = false;
    setLoad({ status: "loading" });
    readPresentation(owner.mandateId)
      .then((stored) => {
        if (cancelled) return;
        setTreatmentId(stored.treatmentId);
        setSavedVersion(stored.version);
        setAccess(stored.access);
        setSaveError(null);
        setDraft(stored.presentation);
        setSaved(stored.presentation);
        setEnabled(!stored.disabled);
        setSavedEnabled(!stored.disabled);
        setLoad({ status: "ready" });
        // F4 — the one read answers for the whole workspace.
        onSurfaceRead?.(stored.presentation.surfaceName);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoad({
          status: "error",
          message:
            err instanceof Error
              ? err.message
              : "This job's display options could not be read.",
        });
      });
    return () => {
      cancelled = true;
      startedFor.current = null;
    };
    // The latch is the ref; `onSurfaceRead` is a setter and re-running on its
    // identity would re-open the trap this effect's comment describes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner.mandateId, readAttempt]);

  // F4 — accepted AI write-access proposals merge into THIS draft, and the
  // drawer opens so the person sees what landed. They are never saved from
  // here; the drawer's own Save is the one door, exactly as for a policy the
  // person set by hand.
  useEffect(() => {
    if (!proposedWritePolicies) return;
    if (Object.keys(proposedWritePolicies).length === 0) return;
    setDraft((prev) => ({
      ...prev,
      writePolicies: { ...prev.writePolicies, ...proposedWritePolicies },
    }));
    setOpen(true);
    onProposalsTaken?.();
  }, [proposedWritePolicies, onProposalsTaken]);

  function set<K extends keyof BindingPresentation>(
    field: K,
    next: BindingPresentation[K],
  ) {
    setDraft((previous) => ({ ...previous, [field]: next }));
    setSaveError(null);
  }

  // ── The two verbatim sections' own field shapes ───────────────────────────
  //
  // Both components speak `AgentShortcut`'s field names. Projecting into and
  // out of them here is what makes "reused verbatim" true: the components are
  // untouched, and this call site does the translating.
  const settingsValue: SettingsFields = {
    autoRun,
    showPreExecutionGate: draft.showPreExecutionGate,
    preExecutionMessage: draft.preExecutionMessage,
    showVariablePanel: draft.showVariablePanel,
    variablesPanelStyle: draft.variablesPanelStyle,
    allowChat: draft.allowChat,
    showDefinitionMessages: draft.showDefinitionMessages,
    showDefinitionMessageContent: draft.showDefinitionMessageContent,
    hideReasoning: draft.hideReasoning,
    hideToolResults: draft.hideToolResults,
  };

  const advancedValue: AdvancedFields = {
    isActive: enabled,
    description: null,
    iconName: draft.iconName,
    keyboardShortcut: draft.keyboardShortcut,
    sortOrder: draft.sortOrder,
    defaultUserInput: draft.defaultUserInput,
    responseDensity: draft.responseDensity,
    autoRun,
    showPreExecutionGate: draft.showPreExecutionGate,
    bypassGateSeconds: draft.bypassGateSeconds,
    defaultVariables:
      draft.defaultVariables as AgentShortcut["defaultVariables"],
    contextOverrides:
      draft.contextOverrides as AgentShortcut["contextOverrides"],
    llmOverrides: draft.llmOverrides as AgentShortcut["llmOverrides"],
    jsonExtraction: draft.jsonExtraction as AgentShortcut["jsonExtraction"],
  };

  // Legacy hosts omit empty write sections; the Permissions tab states why it has no targets.
  const writeTargetCount = draft.surfaceName
    ? (getManifest(draft.surfaceName)?.writeTargets?.length ?? 0)
    : 0;

  const dirty =
    JSON.stringify(draft) !== JSON.stringify(saved) || enabled !== savedEnabled;

  // How many options this job has actually answered — the trigger says it, so
  // nobody has to open the drawer to find out whether anything is in there.
  const answeredCount =
    load.status === "ready"
      ? countAnswered(saved) + (savedEnabled ? 0 : 1)
      : null;

  async function save() {
    if (controlsDisabled) return;
    setBusy(true);
    setSaveError(null);
    try {
      const next = await writePresentation({
        owner,
        presentation: draft,
        treatmentId,
        expectedVersion: savedVersion,
        enabled,
      });
      setTreatmentId(next.treatmentId);
      setSavedVersion(next.version);
      if (next.treatmentId) {
        setAccess(
          await getResourceAccess("mandate_treatment", next.treatmentId),
        );
      }
      setSaved(draft);
      setSavedEnabled(enabled);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "This job's display options could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  const sharedSource = treatmentId ? "Mandate shared" : "Platform defaults";
  const fieldMeta = (field: keyof BindingPresentation) => ({
    source:
      JSON.stringify(draft[field]) !== JSON.stringify(saved[field])
        ? "Mandate shared draft"
        : sharedSource,
    state:
      JSON.stringify(draft[field]) !== JSON.stringify(saved[field])
        ? "Unsaved draft"
        : treatmentId
          ? "Saved"
          : "Inherited default",
  });
  const settingsMeta = (field: keyof SettingsFields) => {
    if (field === "autoRun")
      return { source: "Binding", state: "Saved separately" };
    if (
      field === "variablesPanelStyle" &&
      draft.showVariablePanel !== saved.showVariablePanel
    )
      return fieldMeta("showVariablePanel");
    return fieldMeta(field);
  };
  const advancedMeta = (field: keyof AdvancedFields) => {
    if (field === "isActive")
      return {
        source: sharedSource,
        state:
          enabled !== savedEnabled
            ? "Unsaved draft"
            : treatmentId
              ? "Saved"
              : "Inherited default",
      };
    if (field === "autoRun")
      return { source: "Binding", state: "Saved separately" };
    if (field === "description")
      return { source: "Mandate", state: "Not applicable" };
    return fieldMeta(field);
  };
  const activeSection = section ?? "display";

  return (
    <section
      className={
        section
          ? "space-y-4 min-w-0"
          : "rounded-xl border border-border bg-card"
      }
    >
      {!section && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
          <span className="text-sm font-semibold">Options</span>
          <span className="text-xs text-muted-foreground">
            Display · Visibility · Write access · Advanced
          </span>
          <span className="ml-auto">
            <StatusToken
              status={
                load.status === "error"
                  ? "error"
                  : answeredCount === null
                    ? "unknown"
                    : "neutral"
              }
              label={
                load.status === "error"
                  ? "Read failed"
                  : answeredCount === null
                    ? "Reading"
                    : `${answeredCount} configured`
              }
            />
          </span>
        </button>
      )}
      {(open || section) && (
        <div
          className={
            section ? "space-y-4" : "space-y-5 border-t border-border px-3 py-3"
          }
        >
          {load.status === "loading" || load.status === "idle" ? (
            <div
              role="status"
              aria-label="Reading mandate configuration"
              className="space-y-3 py-3"
            >
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          ) : load.status === "error" ? (
            <div className="space-y-3">
              <PropertyRow
                label="Read status"
                value={<StatusToken status="error" label="Read failed" />}
              />
              <PropertyRow label="Details" value={load.message} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  startedFor.current = null;
                  setReadAttempt((attempt) => attempt + 1);
                }}
              >
                Try again
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-border px-3">
                <PropertyRow
                  label="Preferences scope"
                  value="Shared mandate"
                  help="These preferences belong to the mandate and apply across its system, organization, and personal holder bindings. They are not personal preferences."
                />
                <PropertyRow
                  label="Owner"
                  value={organizationName ?? "Organization name unavailable"}
                />
                <PropertyRow
                  label="Your access"
                  value={
                    treatmentId === null
                      ? "Create shared preferences"
                      : access?.exists
                        ? editable
                          ? "Edit"
                          : "Read only"
                        : "Access unavailable"
                  }
                  help={
                    treatmentId === null
                      ? "No preferences row exists. Creating shared preferences is authorized by the database for this mandate's organization."
                      : "Edit access is checked against the shared preferences record, independently of holder-binding scope."
                  }
                />
                {treatmentId !== null && !access?.exists ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      startedFor.current = null;
                      setReadAttempt((attempt) => attempt + 1);
                    }}
                  >
                    Retry access check
                  </Button>
                ) : null}
              </div>
              <div
                hidden={Boolean(section && activeSection !== "display")}
                className="space-y-3"
              >
                <ConfigurationTable
                  label="Display applicability"
                  columns={LAUNCH_SCOPE_COLUMNS}
                >
                  <ConfigurationTableRow
                    columns={LAUNCH_SCOPE_COLUMNS}
                    cells={{
                      defaults: "Default launch",
                      features: (
                        <StatusToken status="unknown" label="Not verified" />
                      ),
                    }}
                  />
                </ConfigurationTable>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">Result display</h3>
                  <span className="text-xs">
                    <strong>Source:</strong> {fieldMeta("displayMode").source}
                  </span>
                  <span className="text-xs">
                    <strong>State:</strong> {fieldMeta("displayMode").state}
                  </span>
                  <FieldHelp label="Result display">
                    Shared display preferences for{" "}
                    {organizationName ?? "this mandate"}. They apply to launches
                    that use the mandate's saved presentation.
                  </FieldHelp>
                </div>
                <WidgetPicker
                  value={draft.displayMode}
                  onChange={(next) => set("displayMode", next)}
                  disabled={controlsDisabled}
                />
              </div>
              <SettingsSection
                value={settingsValue}
                onChange={(field, next) => {
                  set(field as keyof BindingPresentation, next as never);
                }}
                disabled={controlsDisabled}
                omitAutoRun
                gateUnavailableReason={GATE_UNAVAILABLE}
                section={section}
                fieldMeta={section ? settingsMeta : undefined}
                words={JOB_SETTINGS_WORDS}
              />
              <div hidden={Boolean(section && activeSection !== "permissions")}>
                {writeTargetCount > 0 && draft.surfaceName ? (
                  <WritePolicyEditor
                    surfaceName={draft.surfaceName}
                    value={draft.writePolicies}
                    onChange={(next: WritePolicyMap) =>
                      set("writePolicies", next)
                    }
                    disabled={controlsDisabled}
                    structured={Boolean(section)}
                    source={sharedSource}
                    draftState={fieldMeta("writePolicies").state}
                  />
                ) : section === "permissions" ? (
                  <>
                    <PropertyRow
                      label="Write targets"
                      value={
                        draft.surfaceName && !getManifest(draft.surfaceName)
                          ? "Unknown"
                          : "None"
                      }
                    />
                    <PropertyRow
                      label="Write access"
                      value={
                        <StatusToken
                          status={
                            draft.surfaceName && !getManifest(draft.surfaceName)
                              ? "unknown"
                              : "neutral"
                          }
                          label={
                            draft.surfaceName
                              ? getManifest(draft.surfaceName)
                                ? "No targets declared"
                                : "Surface unavailable"
                              : "No surface assigned"
                          }
                        />
                      }
                    />
                  </>
                ) : null}
              </div>
              <AdvancedSection
                gateUnavailableReason={GATE_UNAVAILABLE}
                value={advancedValue}
                onChange={(field, next) => {
                  if (field === "isActive") {
                    setEnabled(next as boolean);
                    setSaveError(null);
                    return;
                  }
                  set(field as keyof BindingPresentation, next as never);
                }}
                disabled={controlsDisabled}
                omit={[
                  "description",
                  "llmOverrides",
                  "defaultUserInput",
                  "defaultVariables",
                  "contextOverrides",
                  "jsonExtraction",
                  "iconName",
                  "keyboardShortcut",
                  "sortOrder",
                ]}
                section={section}
                fieldMeta={section ? advancedMeta : undefined}
                words={{
                  ...JOB_ADVANCED_WORDS,
                  activeTitle: "Presentation enabled",
                }}
                overridesInstanceKey={`mandate-treatment-${owner.mandateId}`}
                overridesTitle="Shared mandate overrides"
                overridesWords={JOB_TREATMENT_OVERRIDE_WORDS}
                showLucideSources={false}
              />
              {saveError && (
                <PropertyRow
                  label="Save error"
                  value={
                    <span className="text-destructive break-words">
                      {saveError}
                    </span>
                  }
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <PropertyRow
                  label="Changes"
                  value={
                    <StatusToken
                      status={dirty ? "caution" : "neutral"}
                      label={
                        dirty
                          ? "Unsaved"
                          : treatmentId === null && presentationIsDefault(saved)
                            ? "Platform defaults"
                            : "Saved"
                      }
                    />
                  }
                />
                <div className="flex items-center gap-2">
                  {saveError && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        const accepted = await confirm({
                          title: "Reload saved preferences?",
                          description:
                            "This replaces your unsaved display and permission changes with the current saved values.",
                          confirmLabel: "Reload saved",
                        });
                        if (accepted) {
                          startedFor.current = null;
                          setReadAttempt((attempt) => attempt + 1);
                        }
                      }}
                    >
                      Reload saved
                    </Button>
                  )}
                  <FieldHelp label="Save shared preferences">
                    Saves display preferences and permissions for this mandate.
                    Holder selection and model overrides are saved separately.
                  </FieldHelp>
                  <Button
                    size="sm"
                    disabled={controlsDisabled || !dirty}
                    onClick={() => void save()}
                  >
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {busy ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** How many options this job answers differently from the platform default. */
function countAnswered(presentation: BindingPresentation): number {
  const base = defaultPresentation();
  let count = 0;
  for (const key of Object.keys(base) as (keyof BindingPresentation)[]) {
    if (
      JSON.stringify(presentation[key] ?? null) !==
      JSON.stringify(base[key] ?? null)
    ) {
      count += 1;
    }
  }
  return count;
}
