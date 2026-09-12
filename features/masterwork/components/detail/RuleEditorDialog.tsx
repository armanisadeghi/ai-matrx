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
import { improveFieldsFrom, policyRulePatch, RuleFields } from "./RuleFields";
import {
  mergeRuleFieldValues,
  ruleFieldForElementId,
  ruleFieldValues,
  type RuleFieldValues,
  type RulebookRule,
  type RulebookSections,
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
  /**
   * 🚨 THE ONE FORM STATE (W58). The prose, the classifications AND the
   * decision shape are ONE `RuleFieldValues` object, derived from the saved
   * rule by the ONE derivation. They were two parallel sets of state: the
   * decision fields were missing from the draft snapshot, the draft restore and
   * the open/reset effect, so a cancelled toggle survived a reopen and a later
   * Save silently converted or stripped a policy rule (Bugbot, c016fe96).
   */
  const savedValues = useMemo(
    () =>
      ruleFieldValues(initial, {
        defaultSection: defaultSection ?? sectionCodes[0] ?? "G",
      }),
    [defaultSection, initial, sectionCodes],
  );
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
        fallback: savedValues,
      }),
    [initial?.id, isNew, persistedEntry?.data, rulebookVersion, savedValues],
  );
  const wasOpen = useRef(open);
  const [values, setValues] = useState<RuleFieldValues>(() =>
    mergeRuleFieldValues(savedValues, stagedDraft),
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
      ...values,
    }),
    [initial?.id, isNew, values],
  );

  useEffect(() => {
    if (!open) return;
    onDraftChange(draftSnapshot());
    dispatch(
      patchWizardDraft({
        wizardId,
        patch: {
          baseVersion: rulebookVersion,
          fields: improveFieldsFrom(draftSnapshot()),
          beforeTidy,
        },
      }),
    );
  }, [
    beforeTidy,
    dispatch,
    draftSnapshot,
    onDraftChange,
    open,
    rulebookVersion,
    wizardId,
  ]);

  useEffect(() => {
    if (open && !wasOpen.current) {
      // Reopening resets the WHOLE form to the saved rule, then lays the staged
      // or persisted draft over it — one merge, every field, so a cancelled
      // decision toggle never survives into the next open.
      setValues(
        mergeRuleFieldValues(savedValues, stagedDraft ?? persistedDraft?.fields),
      );
      setBeforeTidy(persistedDraft?.beforeTidy ?? null);
    }
    wasOpen.current = open;
  }, [open, persistedDraft, savedValues, stagedDraft]);

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

  // Which field a replacement lands in is derived from the ONE field set, not
  // from a hand-kept list of ids — that list had never heard of the decision
  // fields, so a context-menu replacement inside them threw (Bugbot, c016fe96).
  const replaceActiveField = useCallback((text: string) => {
    const field = ruleFieldForElementId(document.activeElement?.id);
    if (!field) {
      throw new Error("Focus a Rulebook text field before replacing text.");
    }
    setValues((current) => ({ ...current, [field]: text }));
  }, []);

  const save = async () => {
    const { name, statement, rationale, detection, quote, severity, section } =
      values;
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
          ...policyRulePatch(values),
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
      setValues((current) => mergeRuleFieldValues(current, cleaned));
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
        fields: improveFieldsFrom(before),
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
    setValues((current) => mergeRuleFieldValues(current, beforeTidy));
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
            values={values}
            onChange={(patch) =>
              setValues((current) => mergeRuleFieldValues(current, patch))
            }
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
