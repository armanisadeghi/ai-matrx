"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import type {
  PackPrinciple,
  PackSections,
  PrincipleSeverity,
} from "../../types";

/**
 * The plain-language rule form (Phase 4 directive): "What's the rule? Why?
 * How would you catch someone breaking it? How bad is breaking it?" — no
 * jargon, no JSON. Used for both add and edit.
 */

export interface RuleEditorResult {
  principle: PackPrinciple;
  isNew: boolean;
}

function kebab(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

export interface RuleEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: PackSections;
  /** Ids already in the pack — new rules must not collide. */
  existingIds: Set<string>;
  /** Editing an existing rule; undefined = adding a new one. */
  initial?: PackPrinciple;
  defaultSection?: string;
  onSave: (result: RuleEditorResult) => Promise<void>;
}

/**
 * Radix unmounts DialogContent when closed, so the form component below gets a
 * fresh mount (and fresh initial state) on every open — no reset effect needed.
 */
export function RuleEditorDialog(props: RuleEditorDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <RuleEditorForm key={props.initial?.id ?? "new"} {...props} />
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
}: RuleEditorDialogProps) {
  const isNew = !initial;
  const sectionCodes = Object.keys(sections);
  const [name, setName] = useState(initial?.name ?? "");
  const [statement, setStatement] = useState(initial?.statement ?? "");
  const [rationale, setRationale] = useState(initial?.rationale ?? "");
  const [detection, setDetection] = useState(initial?.detection ?? "");
  const [quote, setQuote] = useState(initial?.quote ?? "");
  const [severity, setSeverity] = useState<PrincipleSeverity>(
    initial?.severity ?? "major",
  );
  const [section, setSection] = useState(
    initial?.section ?? defaultSection ?? sectionCodes[0] ?? "G",
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !statement.trim()) {
      toast.error("A rule needs at least a short name and the rule itself.");
      return;
    }
    let id = initial?.id;
    if (!id) {
      const base = kebab(name) || "rule";
      id = base;
      let n = 2;
      while (existingIds.has(id)) id = `${base}-${n++}`;
    }
    setSaving(true);
    try {
      await onSave({
        isNew,
        principle: {
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
      toast.error(err instanceof Error ? err.message : "Could not save the rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
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
            <Textarea
              id="rule-statement"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="The rule itself, as an instruction."
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-rationale">Why does it matter?</Label>
            <Textarea
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
            <Textarea
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
                onValueChange={(v) => setSeverity(v as PrincipleSeverity)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">
                    Critical — never acceptable
                  </SelectItem>
                  <SelectItem value="major">Major — a real problem</SelectItem>
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
            <Textarea
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
    </DialogContent>
  );
}
