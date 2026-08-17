"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProTextarea } from "@/components/official/ProTextarea";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { nextRuleId } from "../../ruleIds";
import type { RulebookDraftSnapshot } from "../../agent-context/rulebookSurfaceScope";
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
  stagedDraft?: Partial<RulebookDraftSnapshot>;
  draftRevision: number;
  onDraftChange: (draft: RulebookDraftSnapshot) => void;
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
  stagedDraft,
  onDraftChange,
}: RuleEditorDialogProps) {
  const isNew = !initial;
  const sectionCodes = Object.keys(sections);
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
    onDraftChange(draftSnapshot());
  }, [draftSnapshot, onDraftChange]);

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
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save the rule",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
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
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rule-name">Short name</Label>
              <Input
                id="rule-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Always lead with the benefit"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-statement">What&apos;s the rule?</Label>
              <ProTextarea
                id="rule-statement"
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                placeholder="The rule itself, as an instruction."
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-rationale">Why does it matter?</Label>
              <ProTextarea
                id="rule-rationale"
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="The reasoning behind it — optional but it makes rulings much better."
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-detection">
                How would you catch someone breaking it?
              </Label>
              <ProTextarea
                id="rule-detection"
                value={detection}
                onChange={(e) => setDetection(e.target.value)}
                placeholder="What a violation looks like in practice."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>How bad is breaking it?</Label>
                <Select
                  value={severity}
                  onValueChange={(v) => setSeverity(v as RuleSeverity)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">
                      Critical — never acceptable
                    </SelectItem>
                    <SelectItem value="major">
                      Major — a real problem
                    </SelectItem>
                    <SelectItem value="minor">Minor — worth fixing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Belongs in</Label>
                <Select value={section} onValueChange={setSection}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sectionCodes.map((code) => (
                      <SelectItem key={code} value={code}>
                        {sections[code]?.label ?? code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-quote">
                In the source&apos;s own words (optional)
              </Label>
              <ProTextarea
                id="rule-quote"
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                placeholder="An exact quote from the book or document this rule comes from."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : isNew ? "Add rule" : "Save rule"}
            </Button>
          </DialogFooter>
        </div>
      </EditableContextMenu>
    </DialogContent>
  );
}
