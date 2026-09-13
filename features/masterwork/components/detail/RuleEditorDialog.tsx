"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PencilLine, RotateCcw, Zap } from "lucide-react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  clearWizardDraft,
  patchWizardDraft,
  selectWizardDraft,
} from "@/lib/redux/slices/wizardDraftSlice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { nextRuleId } from "../../ruleIds";
import type { RulebookDraftSnapshot } from "../../agent-context/rulebookSurfaceScope";
import {
  applyRuleTidy,
  readRuleEditorDraft,
} from "../../agent-context/ruleImprove";
import { useRuleImproveRun } from "../../review/useRuleImproveRun";
import { RuleFields } from "./RuleFields";
import {
  EMPTY_RULE_MOVE_FIELDS,
  ruleMoveFieldsFromRule,
  ruleMoveFromFields,
  type RulebookRule,
  type RulebookSections,
  type RuleMoveFieldValues,
  type RuleSeverity,
} from "../../types";

/**
 * The plain-language rule form (Phase 4 directive): "What's the rule? Why?
 * How would you catch someone breaking it? How bad is breaking it?" — no
 * jargon, no JSON. Used for both add and edit.
 */

export interface RuleEditorResult {
  rule: RulebookRule;
  isNew: boolean;
}

export interface RuleEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: RulebookSections;
  /** Ids already in the Rulebook — new rules must not collide. */
  existingIds: Set<string>;
  /** Editing an existing rule; undefined = adding a new one. */
  initial?: RulebookRule;
  defaultSection?: string;
  onSave: (result: RuleEditorResult) => Promise<void>;
  surfaceName: string;
  getSurfaceScope: () => SurfaceScopePayload;
  rulebookId: string;
  rulebookVersion: number;
  organizationId: string;
  stagedDraft?: Partial<RulebookDraftSnapshot>;
  draftRevision: number;
  onDraftChange: (draft: RulebookDraftSnapshot) => void;
  /**
   * The AI path from within edit: close this editor and open the Improve
   * panel on the same rule, where the Expert dictates their notes and the
   * `masterwork.rule_improver` Mandate applies them. Rendered only when
   * editing an existing rule and the callback is provided.
   */
  onImproveInstead?: () => void;
}

/**
 * Radix unmounts DialogContent when closed, so the form component below gets a
 * fresh mount (and fresh initial state) on every open — no reset effect needed.
 */
export function RuleEditorDialog(props: RuleEditorDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <RuleEditorForm
        key={`${props.initial?.id ?? "new"}:${props.draftRevision}`}
        {...props}
      />
    </Dialog>
  );
}

function RuleEditorForm({
  onOpenChange,
  sections,
  existingIds,
  initial,
  defaultSection,
  onSave,
  surfaceName,
  getSurfaceScope,
  rulebookId,
  rulebookVersion,
  organizationId,
  stagedDraft,
  onDraftChange,
  onImproveInstead,
  open,
}: RuleEditorDialogProps) {
  const dispatch = useAppDispatch();
  const cleanupRun = useRuleImproveRun({
    rulebookId,
    organizationId,
    sections,
    surfaceName,
  });
  const isNew = !initial;
  const sectionCodes = useMemo(() => Object.keys(sections), [sections]);
  const wizardId = `masterwork-rule-editor:${rulebookId}:${initial?.id ?? "new"}`;
  const persistedEntry = useAppSelector((state) =>
    selectWizardDraft(wizardId)(state),
  );
  const persistedDraft = useMemo(
    () =>
      readRuleEditorDraft(persistedEntry?.data, {
        rulebookVersion,
        mode: isNew ? "new" : "edit",
        ruleId: initial?.id ?? null,
      }),
    [initial?.id, isNew, persistedEntry?.data, rulebookVersion],
  );
  /**
   * WHAT A REMOUNT STARTS FROM. This form is REMOUNTED, not reopened, on every
   * `draftRevision` bump and whenever the page mounts it already open — and
   * `wasOpen` used to be seeded with `open`, so the restore effect below never
   * ran on such a mount. The persisted draft was then ignored at first render
   * AND at restore, the live rule's values took the screen, and the persist
   * effect immediately wrote them over the Expert's saved draft (Bugbot on
   * e1b62ed0). So the persisted draft is part of the INITIAL state, and
   * `wasOpen` starts false so a mount that starts open restores like any other
   * opening.
   */
  const restoredFields = stagedDraft ?? persistedDraft?.fields;
  const wasOpen = useRef(false);
  const [name, setName] = useState(restoredFields?.name ?? initial?.name ?? "");
  const [statement, setStatement] = useState(
    restoredFields?.statement ?? initial?.statement ?? "",
  );
  const [rationale, setRationale] = useState(
    restoredFields?.rationale ?? initial?.rationale ?? "",
  );
  const [detection, setDetection] = useState(
    restoredFields?.detection ?? initial?.detection ?? "",
  );
  const [quote, setQuote] = useState(
    restoredFields?.quote ?? initial?.quote ?? "",
  );
  const [severity, setSeverity] = useState<RuleSeverity>(
    restoredFields?.severity ?? initial?.severity ?? "major",
  );
  const [section, setSection] = useState(
    restoredFields?.section ??
      initial?.section ??
      defaultSection ??
      sectionCodes[0] ??
      "G",
  );
  /**
   * The policy half (contract §2) — held as plain form strings and converted
   * once, at save, through `ruleMoveFromFields`. Not part of the staged
   * agent draft (`RulebookDraftSnapshot` is the prose the Conductor writes);
   * an edit that touches only these fields still saves, because
   * `applyManualRuleEdit` merges the whole edited rule either way.
   *
   * It IS persisted, beside `fields`, in the wizard draft: until 2026-09-12
   * (Bugbot, PR #222) it was written nowhere, so a reload — or the reopen path
   * below, which restores name/statement/rationale from the persisted draft —
   * silently threw away everything typed into "When:" and "Next:" and put the
   * live rule's values back.
   */
  const [policy, setPolicy] = useState<RuleMoveFieldValues>(
    () =>
      persistedDraft?.policy ??
      (initial ? ruleMoveFieldsFromRule(initial) : EMPTY_RULE_MOVE_FIELDS),
  );
  const [saving, setSaving] = useState(false);
  const [beforeTidy, setBeforeTidy] =
    useState<RulebookDraftSnapshot | null>(
      persistedDraft?.beforeTidy ?? null,
    );

  const draftSnapshot = useCallback(
    (): RulebookDraftSnapshot => ({
      mode: isNew ? "new" : "edit",
      rule_id: initial?.id ?? null,
      name,
      statement,
      rationale,
      detection,
      quote,
      severity,
      section,
    }),
    [
      detection,
      initial?.id,
      isNew,
      name,
      quote,
      rationale,
      section,
      severity,
      statement,
    ],
  );

  useEffect(() => {
    if (!open) return;
    onDraftChange(draftSnapshot());
    dispatch(
      patchWizardDraft({
        wizardId,
        patch: {
          baseVersion: rulebookVersion,
          fields: draftSnapshot(),
          beforeTidy,
          policy,
        },
      }),
    );
  }, [
    beforeTidy,
    dispatch,
    draftSnapshot,
    onDraftChange,
    open,
    policy,
    rulebookVersion,
    wizardId,
  ]);

  useEffect(() => {
    if (open && !wasOpen.current) {
      const restored = stagedDraft ?? persistedDraft?.fields;
      setName(restored?.name ?? initial?.name ?? "");
      setStatement(restored?.statement ?? initial?.statement ?? "");
      setRationale(restored?.rationale ?? initial?.rationale ?? "");
      setDetection(restored?.detection ?? initial?.detection ?? "");
      setQuote(restored?.quote ?? initial?.quote ?? "");
      setSeverity(restored?.severity ?? initial?.severity ?? "major");
      setSection(
        restored?.section ??
          initial?.section ??
          defaultSection ??
          sectionCodes[0] ??
          "G",
      );
      setBeforeTidy(persistedDraft?.beforeTidy ?? null);
      // The restored policy wins over the live rule for the same reason the
      // restored prose does: it is what the Expert typed and has not saved.
      setPolicy(
        persistedDraft?.policy ??
          (initial
            ? ruleMoveFieldsFromRule(initial)
            : EMPTY_RULE_MOVE_FIELDS),
      );
    }
    wasOpen.current = open;
  }, [
    defaultSection,
    initial,
    open,
    persistedDraft,
    sectionCodes,
    stagedDraft,
  ]);

  const getApplicationScope = useCallback(() => {
    const active = document.activeElement;
    const element =
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLInputElement
        ? active
        : null;
    const start = element?.selectionStart ?? 0;
    const end = element?.selectionEnd ?? 0;
    return buildApplicationScopeFromMenuContext({
      selectedText: element?.value.slice(start, end) ?? "",
      selectionRange: element
        ? { type: "editable", element, start, end }
        : null,
      contextData: getSurfaceScope() as Record<string, unknown>,
    });
  }, [getSurfaceScope]);

  const replaceActiveField = useCallback((text: string) => {
    const activeId = document.activeElement?.id;
    if (activeId === "rule-name") setName(text);
    else if (activeId === "rule-statement") setStatement(text);
    else if (activeId === "rule-rationale") setRationale(text);
    else if (activeId === "rule-detection") setDetection(text);
    else if (activeId === "rule-quote") setQuote(text);
    else throw new Error("Focus a Rulebook text field before replacing text.");
  }, []);

  const save = async () => {
    if (!name.trim() || !statement.trim()) {
      toast.error("A rule needs at least a short name and the rule itself.");
      return;
    }
    const id = initial?.id ?? nextRuleId(name, existingIds);
    setSaving(true);
    try {
      await onSave({
        isNew,
        rule: {
          ...(initial ?? {}),
          id,
          name: name.trim(),
          statement: statement.trim(),
          rationale: rationale.trim() || undefined,
          detection: detection.trim() || undefined,
          quote: quote.trim() || undefined,
          severity,
          section,
          // Absent halves are DELETED, never left behind as a stale policy the
          // Expert thinks they cleared.
          precondition: undefined,
          next_action: undefined,
          ...ruleMoveFromFields(policy),
        },
      });
      dispatch(clearWizardDraft(wizardId));
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save the rule",
      );
    } finally {
      setSaving(false);
    }
  };

  const applyCleanedDraft = useCallback(
    (cleaned: RulebookDraftSnapshot, before: RulebookDraftSnapshot) => {
      setName(cleaned.name);
      setStatement(cleaned.statement);
      setRationale(cleaned.rationale);
      setDetection(cleaned.detection);
      setQuote(cleaned.quote);
      setSeverity(cleaned.severity);
      setSection(cleaned.section);
      setBeforeTidy(before);
    },
    [],
  );

  // "Clean up with AI" — the TIDY shape of the `masterwork.rule_improver`
  // Mandate: an empty `expert_input` means "polish the wording, change no
  // meaning". `applyRuleTidy` freezes quote/severity/section mechanically,
  // whatever the agent returns. (Absorbed from the retired
  // `masterwork.rule_cleanup` Mandate, 2026-08-17.)
  const cleanupWithAi = async () => {
    const before = draftSnapshot();
    if (!before.name.trim() || !before.statement.trim()) {
      toast.error("Add a short name and the rule itself before cleaning it up.");
      return;
    }

    const context = getSurfaceScope();
    try {
      const cleaned = await cleanupRun.run<RulebookDraftSnapshot>({
        surfaceKey: "masterwork-rule-tidy",
        fields: before,
        // Empty guidance IS the tidy shape — see useRuleImproveRun.
        expertInput: "",
        context,
        fallbackSection: before.section,
        apply: (result) => applyRuleTidy(before, result),
        onDurableResult: (result) => {
          dispatch(
            patchWizardDraft({
              wizardId,
              patch: {
                baseVersion: rulebookVersion,
                fields: applyRuleTidy(before, result),
                beforeTidy: before,
              },
            }),
          );
        },
        failureMessages: {
          noJson: "AI cleanup finished without returning a usable rule.",
          timeout: "AI cleanup took too long. Your draft is still here.",
        },
      });
      applyCleanedDraft(cleaned, before);
      toast.success("AI cleanup is ready — review it, then save the rule.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not clean up the rule",
      );
    }
  };

  const undoCleanup = () => {
    if (!beforeTidy) return;
    const restored = beforeTidy;
    setName(restored.name);
    setStatement(restored.statement);
    setRationale(restored.rationale);
    setDetection(restored.detection);
    setQuote(restored.quote);
    setSeverity(restored.severity);
    setSection(restored.section);
    setBeforeTidy(null);
    cleanupRun.dismiss();
    toast.success("AI cleanup undone.");
  };

  const cancel = () => {
    dispatch(clearWizardDraft(wizardId));
    cleanupRun.dismiss();
    onOpenChange(false);
  };

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
      <EditableContextMenu
        sourceFeature="masterwork"
        surfaceName={surfaceName}
        menuVersion={1}
        getTextarea={() =>
          document.activeElement instanceof HTMLTextAreaElement
            ? document.activeElement
            : null
        }
        getApplicationScope={getApplicationScope}
        contextData={getSurfaceScope() as Record<string, unknown>}
        contentSource={{ type: "raw" }}
        onTextReplace={replaceActiveField}
        onSave={() => void save()}
      >
        <div className="space-y-4">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add a rule" : "Edit rule"}</DialogTitle>
            <DialogDescription>
              Say it the way you&apos;d tell a new hire. The system turns your
              words into checks — you never have to.
            </DialogDescription>
          </DialogHeader>
          <RuleFields
            values={{
              name,
              statement,
              rationale,
              detection,
              quote,
              severity,
              section,
              ...policy,
            }}
            onChange={(patch) => {
              if (patch.name !== undefined) setName(patch.name);
              if (patch.statement !== undefined) setStatement(patch.statement);
              if (patch.rationale !== undefined) setRationale(patch.rationale);
              if (patch.detection !== undefined) setDetection(patch.detection);
              if (patch.quote !== undefined) setQuote(patch.quote);
              if (patch.severity !== undefined) setSeverity(patch.severity);
              if (patch.section !== undefined) setSection(patch.section);
              const {
                name: _n,
                statement: _s,
                rationale: _r,
                detection: _d,
                quote: _q,
                severity: _sev,
                section: _sec,
                ...policyPatch
              } = patch;
              if (Object.keys(policyPatch).length > 0) {
                setPolicy((current) => ({ ...current, ...policyPatch }));
              }
            }}
            sections={sections}
          />
          {cleanupRun.hasLiveRun ? (
            <LiveRunDisplay
              conversationId={cleanupRun.conversationId}
              pending={cleanupRun.isRunning}
              label="Cleaning up this rule"
              onDismiss={cleanupRun.dismiss}
              bodyClassName="max-h-40"
            />
          ) : null}
          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2 sm:mr-auto">
              <Button
                variant="secondary"
                onClick={() => void cleanupWithAi()}
                disabled={saving || cleanupRun.isRunning}
              >
                <PencilLine className="h-4 w-4" />
                {cleanupRun.isRunning ? "Cleaning up…" : "Clean up with AI"}
              </Button>
              {!isNew && onImproveInstead ? (
                <Button
                  variant="ghost"
                  onClick={onImproveInstead}
                  disabled={saving || cleanupRun.isRunning}
                  title="Dictate what should change and the AI rewrites the rule for your approval."
                >
                  <Zap className="h-4 w-4" />
                  Have the AI apply my notes instead
                </Button>
              ) : null}
              {beforeTidy ? (
                <Button
                  variant="ghost"
                  onClick={undoCleanup}
                  disabled={saving || cleanupRun.isRunning}
                >
                  <RotateCcw className="h-4 w-4" />
                  Undo AI cleanup
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={cancel}
                disabled={saving || cleanupRun.isRunning}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void save()}
                disabled={saving || cleanupRun.isRunning}
              >
                {saving ? "Saving…" : isNew ? "Add rule" : "Save rule"}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </EditableContextMenu>
    </DialogContent>
  );
}
