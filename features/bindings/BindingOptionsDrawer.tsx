"use client";

// One treatment draft and save boundary, shared by the legacy drawer and
// the mandate Display Options, Overrides, and Permissions tabs.

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import {
  FieldHelp,
  PropertyRow,
  StatusToken,
} from "@/components/official/ConfigurationFields";
import { Skeleton } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAllCategoriesArray } from "@/features/agents/redux/agent-shortcut-categories/selectors";
import { fetchCategoriesForScope } from "@/features/agents/redux/agent-shortcut-categories/thunks";
import { WidgetPicker } from "@/features/agent-shortcuts/components/next/WidgetPicker";
import { CategoryPicker } from "@/features/agent-shortcuts/components/next/CategoryPicker";
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
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const [load, setLoad] = useState<LoadState>({ status: "idle" });
  const [treatmentId, setTreatmentId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [draft, setDraft] = useState<BindingPresentation>(defaultPresentation);
  const [saved, setSaved] = useState<BindingPresentation>(defaultPresentation);
  const [savedEnabled, setSavedEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  // Categories — the same three scopes the shortcut editor loads, for the same
  // reason: a single-scope fetch misses two-thirds of what a person may pick.
  const currentUserId = useAppSelector((s) => s.userAuth?.id ?? null);
  useEffect(() => {
    if (!open && section !== "display") return;
    void dispatch(fetchCategoriesForScope({ scope: "global", scopeId: null }));
    void dispatch(fetchCategoriesForScope({ scope: "user", scopeId: null }));
    void dispatch(
      fetchCategoriesForScope({
        scope: "organization",
        scopeId: owner.organizationId,
      }),
    );
  }, [dispatch, open, section, owner.organizationId]);
  const allCategories = useAppSelector(selectAllCategoriesArray);
  const categories = allCategories.filter((category) => {
    if (!category.isActive) return false;
    const isGlobal =
      category.userId == null &&
      category.organizationId == null &&
      category.projectId == null &&
      category.taskId == null;
    if (isGlobal) return true;
    if (currentUserId && category.userId === currentUserId) return true;
    return category.organizationId === owner.organizationId;
  });

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
    setBusy(true);
    setSaveError(null);
    try {
      const nextId = await writePresentation({
        owner,
        presentation: draft,
        treatmentId,
        enabled,
      });
      setTreatmentId(nextId);
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
          ? "Saved; inheritance unknown"
          : "Inherited default",
  });
  const settingsMeta = (field: keyof SettingsFields) =>
    field === "autoRun"
      ? { source: "Binding", state: "Saved separately" }
      : fieldMeta(field);
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
          <PropertyRow
            label="Applies to"
            value={organizationName ?? "Mandate organization"}
            source="Mandate shared"
            state="No personal inheritance"
            help="These values belong to the mandate's shared presentation record. The holder's system, organization, and personal selection does not change their scope."
          />
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
              <div hidden={Boolean(section && activeSection !== "display")}>
                <PropertyRow
                  label="Result display"
                  {...fieldMeta("displayMode")}
                  value={
                    <WidgetPicker
                      value={draft.displayMode}
                      onChange={(next) => set("displayMode", next)}
                      disabled={disabled || busy}
                    />
                  }
                />
              </div>
              <SettingsSection
                value={settingsValue}
                onChange={(field, next) => {
                  set(field as keyof BindingPresentation, next as never);
                }}
                disabled={disabled || busy}
                omitAutoRun
                section={section}
                fieldMeta={section ? settingsMeta : undefined}
                words={JOB_SETTINGS_WORDS}
              />
              <div hidden={Boolean(section && activeSection !== "display")}>
                <PropertyRow
                  label="Menu category"
                  {...fieldMeta("categoryId")}
                  value={
                    <CategoryPicker
                      categories={categories}
                      value={draft.categoryId ?? ""}
                      onChange={(next) => set("categoryId", next || null)}
                      disabled={disabled || busy}
                    />
                  }
                />
              </div>
              <div hidden={Boolean(section && activeSection !== "permissions")}>
                {writeTargetCount > 0 && draft.surfaceName ? (
                  <WritePolicyEditor
                    surfaceName={draft.surfaceName}
                    value={draft.writePolicies}
                    onChange={(next: WritePolicyMap) =>
                      set("writePolicies", next)
                    }
                    disabled={disabled || busy}
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
                value={advancedValue}
                onChange={(field, next) => {
                  if (field === "isActive") {
                    setEnabled(next as boolean);
                    setSaveError(null);
                    return;
                  }
                  set(field as keyof BindingPresentation, next as never);
                }}
                disabled={disabled || busy}
                omit={["description"]}
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
                  <FieldHelp label="Save shared configuration">
                    Saves this shared record's Display Options, Overrides, and
                    Permissions together. Holder selection and binding overrides
                    have a separate save.
                  </FieldHelp>
                  <Button
                    size="sm"
                    disabled={disabled || busy || !dirty}
                    onClick={() => void save()}
                  >
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {busy
                      ? "Saving…"
                      : section
                        ? "Save shared configuration"
                        : "Save options"}
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
