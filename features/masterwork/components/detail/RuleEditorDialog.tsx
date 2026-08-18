"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PencilLine, RotateCcw, Wand2 } from "lucide-react";
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
import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { nextRuleId } from "../../ruleIds";
import type { RulebookDraftSnapshot } from "../../agent-context/rulebookSurfaceScope";
import {
  applyRuleCleanup,
  coerceRuleCleanupResult,
  MASTERWORK_RULE_CLEANUP_MANDATE,
  readRuleEditorDraft,
} from "../../agent-context/ruleCleanup";
import { RuleFields } from "./RuleFields";
import type { RulebookRule, RulebookSections, RuleSeverity } from "../../types";

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
  const cleanupRun = useLiveAgentRun();
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
  const wasOpen = useRef(open);
  const [name, setName] = useState(stagedDraft?.name ?? initial?.name ?? "");
  const [statement, setStatement] = useState(
    stagedDraft?.statement ?? initial?.statement ?? "",
  );
  const [rationale, setRationale] = useState(
    stagedDraft?.rationale ?? initial?.rationale ?? "",
  );
  const [detection, setDetection] = useState(
    stagedDraft?.detection ?? initial?.detection ?? "",
  );
  const [quote, setQuote] = useState(
    stagedDraft?.quote ?? initial?.quote ?? "",
  );
  const [severity, setSeverity] = useState<RuleSeverity>(
    stagedDraft?.severity ?? initial?.severity ?? "major",
  );
  const [section, setSection] = useState(
    stagedDraft?.section ??
      initial?.section ??
      defaultSection ??
      sectionCodes[0] ??
      "G",
  );
  const [saving, setSaving] = useState(false);
  const [beforeCleanup, setBeforeCleanup] =
    useState<RulebookDraftSnapshot | null>(
      persistedDraft?.beforeCleanup ?? null,
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
          beforeCleanup,
        },
      }),
    );
  }, [
    beforeCleanup,
    dispatch,
    draftSnapshot,
    onDraftChange,
    open,
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
      setBeforeCleanup(persistedDraft?.beforeCleanup ?? null);
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
      setBeforeCleanup(before);
    },
    [],
  );

  const cleanupWithAi = async () => {
    const before = draftSnapshot();
    if (!before.name.trim() || !before.statement.trim()) {
      toast.error("Add a short name and the rule itself before cleaning it up.");
      return;
    }

    const context = getSurfaceScope();
    try {
      const cleaned = await cleanupRun.run<RulebookDraftSnapshot>({
        mandateKey: MASTERWORK_RULE_CLEANUP_MANDATE,
        surfaceKey: "masterwork-rule-cleanup",
        sourceFeature: "masterwork",
        surfaceName,
        organizationId,
        contextAnchor: {
          resource_type: "rulebook",
          resource_id: rulebookId,
        },
        variables: {
          rule_draft: JSON.stringify(before),
          rulebook_context: JSON.stringify(context),
        },
        expect: "json",
        timeoutMs: 120_000,
        coerce: (value) =>
          applyRuleCleanup(before, coerceRuleCleanupResult(value, before)),
        onResult: (result) => {
          if (!result.data) return;
          const durable = applyRuleCleanup(
            before,
            coerceRuleCleanupResult(result.data, before),
          );
          dispatch(
            patchWizardDraft({
              wizardId,
              patch: {
                baseVersion: rulebookVersion,
                fields: durable,
                beforeCleanup: before,
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
    if (!beforeCleanup) return;
    const restored = beforeCleanup;
    setName(restored.name);
    setStatement(restored.statement);
    setRationale(restored.rationale);
    setDetection(restored.detection);
    setQuote(restored.quote);
    setSeverity(restored.severity);
    setSection(restored.section);
    setBeforeCleanup(null);
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
            }}
            onChange={(patch) => {
              if (patch.name !== undefined) setName(patch.name);
              if (patch.statement !== undefined) setStatement(patch.statement);
              if (patch.rationale !== undefined) setRationale(patch.rationale);
              if (patch.detection !== undefined) setDetection(patch.detection);
              if (patch.quote !== undefined) setQuote(patch.quote);
              if (patch.severity !== undefined) setSeverity(patch.severity);
              if (patch.section !== undefined) setSection(patch.section);
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
                  <Wand2 className="h-4 w-4" />
                  Have the AI apply my notes instead
                </Button>
              ) : null}
              {beforeCleanup ? (
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
