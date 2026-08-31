"use client";

// features/bindings/BindingOptionsDrawer.tsx
//
// THE FOLDED OPTIONS DRAWER (PLAN-ONE-BINDING-UI §1.3, UI-STANDARD P16).
//
// "Nothing new is designed here — the drawer IS `ShortcutEditorNext`'s section
// stack, minus the sections that belong to the job rather than the binding."
// So it is: `WidgetPicker` · `SettingsSection` · `CategoryPicker` ·
// `WritePolicyEditor` · `AdvancedSection`, every one of them the SAME component
// the Gen-A shortcut editor renders, at a new call site. Four sections, folded:
//
//     Display · Visibility · Write access · Advanced
//
// P16 — DEPTH IS PROGRESSIVE AND EVERY REVEAL IS CAUSED:
//   · the whole drawer is folded, and its trigger says how many options this
//     job has actually answered, so it is never opened out of curiosity;
//   · a section appears only when this job HAS the thing it governs — Write
//     access is absent unless the job names a surface that declares write
//     targets, because a panel that can only say "nothing here" is a reveal
//     that was not caused;
//   · inside `SettingsSection` the gate cascade still reveals itself only when
//     auto-run is on, and inside `AdvancedSection` every raw-JSON field still
//     parses on each keystroke and refuses to propagate invalid JSON.
//
// WHAT IS STORED AND WHERE — the live storage, nothing invented:
//   · these options are TREATMENT (`mandate.treatment.config`, schema_version
//     1) — the same table and the same keys the 208 migrated shortcuts have
//     served out of since the cutover, read back by `mandate.vw_shortcut`.
//     The codec is `treatment-shape.ts`; the writer is `treatment-writer.ts`.
//   · WRITE ACCESS specifically follows `SHORTCUT_WRITE_POLICIES_ON_TREATMENT`
//     (`lib/supabase/shortcutStorage.ts`): a write policy is treatment, never
//     consumption, so it lives at `config.write_policies` and never inside a
//     mapping blob.
//   · "Run instantly" is NOT here. On a job it is a fact about the mapping
//     (`mandate.binding.auto_run`), narrated by `AutoRunBar` above, refused at
//     the write and re-checked by the resolver — `omitAutoRun` keeps it a
//     single control with a single home.
//
// 🚨 ONE HONEST SENTENCE THE DRAWER ALWAYS PRINTS: a treatment has no per-person
// rung. The holder above can differ for you, your organization and everyone;
// how the job PRESENTS itself is one answer for the whole organization. The
// drawer says that rather than letting the rung control above imply otherwise.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";

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
import { JOB_ADVANCED_WORDS, JOB_SETTINGS_WORDS } from "./words";

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
}

export function BindingOptionsDrawer({
  owner,
  autoRun,
  organizationName,
  onSurfaceRead,
  proposedWritePolicies = null,
  onProposalsTaken,
  disabled = false,
}: BindingOptionsDrawerProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
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
    };
    // The latch is the ref; `onSurfaceRead` is a setter and re-running on its
    // identity would re-open the trap this effect's comment describes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner.mandateId]);

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
    if (!open) return;
    void dispatch(fetchCategoriesForScope({ scope: "global", scopeId: null }));
    void dispatch(fetchCategoriesForScope({ scope: "user", scopeId: null }));
    void dispatch(
      fetchCategoriesForScope({
        scope: "organization",
        scopeId: owner.organizationId,
      }),
    );
  }, [dispatch, open, owner.organizationId]);
  const allCategories = useAppSelector(selectAllCategoriesArray);
  const categories = useMemo(
    () =>
      allCategories.filter((c) => {
        if (!c.isActive) return false;
        const isGlobal =
          c.userId == null &&
          c.organizationId == null &&
          c.projectId == null &&
          c.taskId == null;
        if (isGlobal) return true;
        if (currentUserId && c.userId === currentUserId) return true;
        return c.organizationId === owner.organizationId;
      }),
    [allCategories, currentUserId, owner.organizationId],
  );

  const set = useCallback(
    <K extends keyof BindingPresentation>(
      field: K,
      next: BindingPresentation[K],
    ) => {
      setDraft((prev) => ({ ...prev, [field]: next }));
      setSaveError(null);
    },
    [],
  );

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
    defaultVariables: draft.defaultVariables as AgentShortcut["defaultVariables"],
    contextOverrides: draft.contextOverrides as AgentShortcut["contextOverrides"],
    llmOverrides: draft.llmOverrides as AgentShortcut["llmOverrides"],
    jsonExtraction: draft.jsonExtraction as AgentShortcut["jsonExtraction"],
  };

  // P16 — Write access is REVEALED BY CAUSE. The panel governs a surface's
  // declared write targets; a job that names no surface, or names one that
  // declares none, has nothing for it to govern, so the section is absent
  // rather than present and empty.
  const writeTargetCount = draft.surfaceName
    ? (getManifest(draft.surfaceName)?.writeTargets?.length ?? 0)
    : 0;

  const dirty =
    JSON.stringify(draft) !== JSON.stringify(saved) || enabled !== savedEnabled;

  // How many options this job has actually answered — the trigger says it, so
  // nobody has to open the drawer to find out whether anything is in there.
  const answeredCount = useMemo(() => {
    if (load.status !== "ready") return null;
    if (!savedEnabled) return countAnswered(saved) + 1;
    return countAnswered(saved);
  }, [load.status, saved, savedEnabled]);

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

  const coverage = organizationName
    ? `Everyone in ${organizationName} sees the job this way.`
    : "Everyone in this job's organization sees it this way.";

  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
        <span className="text-[12.5px] font-semibold text-foreground">
          Options
        </span>
        <span className="text-[11px] text-muted-foreground">
          Display · Visibility{writeTargetCount > 0 ? " · Write access" : ""} ·
          Advanced
        </span>
        {/* WHAT THE CLOSED TRIGGER SAYS. Every state is a word: how many
            options this job answers, that it answers none, or that the answer
            could not be read — never nothing, which would leave "empty" and
            "unknown" looking identical. */}
        {load.status === "error" ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-destructive">
            <AlertTriangle className="h-3 w-3" />
            Couldn&rsquo;t read
          </span>
        ) : answeredCount === null ? null : answeredCount > 0 ? (
          <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {answeredCount} set
          </span>
        ) : (
          <span className="ml-auto text-[10px] text-muted-foreground">
            All platform defaults
          </span>
        )}
      </button>

      {open ? (
        <div className="space-y-5 border-t border-border px-3 py-3">
          {/* 🚨 WHO THESE OPTIONS COVER, said out loud. A treatment has no
              per-person rung, so the rung control above does NOT apply here —
              and a screen that let it be assumed would be lying. */}
          <p className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
            These are the JOB&rsquo;s options, not this binding&rsquo;s answer.
            The holder above can differ for you, your organization and everyone;
            how the job presents itself is one answer. {coverage}
          </p>

          {load.status === "loading" || load.status === "idle" ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground">
              Reading this job&rsquo;s options…
            </p>
          ) : load.status === "error" ? (
            <div className="space-y-2 py-4 text-center">
              <p className="flex items-start justify-center gap-1.5 text-[12px] leading-relaxed text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {load.message}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  startedFor.current = null;
                  setLoad({ status: "idle" });
                }}
              >
                Try again
              </Button>
            </div>
          ) : (
            <>
              <Group
                title="Display"
                hint="How this job's result is presented, and what the person sees while it runs."
              >
                <WidgetPicker
                  value={draft.displayMode}
                  onChange={(next) => set("displayMode", next)}
                  disabled={disabled || busy}
                />
                <SettingsSection
                  value={settingsValue}
                  onChange={(field, next) => {
                    // `autoRun` is not offered here and cannot arrive.
                    set(
                      field as keyof BindingPresentation,
                      next as never,
                    );
                  }}
                  disabled={disabled || busy}
                  omitAutoRun
                  words={JOB_SETTINGS_WORDS}
                />
                {!autoRun ? (
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    The pre-run gate appears here once &ldquo;Run
                    instantly&rdquo; is on — it is a fact about the mapping, set
                    in the auto-run bar above.
                  </p>
                ) : null}
              </Group>

              <Group
                title="Visibility"
                hint="Where this job appears for the people it covers."
              >
                <CategoryPicker
                  categories={categories}
                  value={draft.categoryId ?? ""}
                  onChange={(next) => set("categoryId", next || null)}
                  disabled={disabled || busy}
                />
              </Group>

              {writeTargetCount > 0 && draft.surfaceName ? (
                <Group
                  title="Write access"
                  hint="What the holder may change on the page this job runs from, and whether it must ask. The job's answer merges over the holder's own bindings at launch."
                >
                  <WritePolicyEditor
                    surfaceName={draft.surfaceName}
                    value={draft.writePolicies}
                    onChange={(next: WritePolicyMap) =>
                      set("writePolicies", next)
                    }
                    disabled={disabled || busy}
                  />
                </Group>
              ) : null}

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
                words={JOB_ADVANCED_WORDS}
                // A no-code job screen never hands its user off to an icon
                // LIBRARY's developer site. The in-app icon gallery lists
                // every name that works here, so nothing is lost.
                showLucideSources={false}
              />

              {saveError ? (
                <p className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[12px] leading-relaxed text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {saveError}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/40 pt-3">
                {!dirty ? (
                  <p className="mr-auto text-[11.5px] text-muted-foreground">
                    {treatmentId === null && presentationIsDefault(saved)
                      ? "Every option is still the platform default — nothing is stored for this job."
                      : "Saved."}
                  </p>
                ) : null}
                <Button
                  size="sm"
                  className="min-w-[130px]"
                  disabled={disabled || busy || !dirty}
                  onClick={() => void save()}
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {busy ? "Saving…" : "Save options"}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h4 className="text-[12px] font-semibold text-foreground">{title}</h4>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {hint}
        </p>
      </div>
      {children}
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
