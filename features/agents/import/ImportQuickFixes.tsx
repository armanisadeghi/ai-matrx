"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SmartModelSelect } from "@/features/ai-models/components/smart/SmartModelSelect";
import {
  applyAutoFixes,
  applyImportFix,
  readValidModelIdFromPaste,
} from "./agent-import-fixes";
import type {
  ImportAnalysisResult,
  ImportFixAction,
  ImportValidationIssue,
} from "./agent-import-validation";

interface ImportQuickFixesProps {
  pastedText: string;
  onPatchedText: (next: string) => void;
  analysis: Extract<ImportAnalysisResult, { status: "analyzed" }>;
}

function hasFixKind(
  issues: ImportValidationIssue[],
  kind: ImportFixAction["kind"],
): boolean {
  return issues.some((i) => i.fixAction?.kind === kind);
}

function firstFixAction(
  issues: ImportValidationIssue[],
  kind: ImportFixAction["kind"],
): ImportFixAction | undefined {
  return issues.find((i) => i.fixAction?.kind === kind)?.fixAction;
}

function countAutoFixes(issues: ImportValidationIssue[]): number {
  return issues.filter(
    (i) =>
      i.fixAction &&
      i.fixAction.kind !== "pick-model" &&
      i.fixAction.kind !== "set-name" &&
      i.fixAction.kind !== "set-agent-type" &&
      i.fixAction.kind !== "set-settings-enum",
  ).length;
}

export function ImportQuickFixes({
  pastedText,
  onPatchedText,
  analysis,
}: ImportQuickFixesProps) {
  const { issues } = analysis;
  const showModel = hasFixKind(issues, "pick-model");
  const showName = hasFixKind(issues, "set-name");
  const showAgentType = hasFixKind(issues, "set-agent-type");
  const effortFix = firstFixAction(issues, "set-settings-enum");
  const showEffort =
    effortFix?.kind === "set-settings-enum" &&
    effortFix.field === "reasoning_effort";
  const summaryFix = issues.find(
    (i) =>
      i.fixAction?.kind === "set-settings-enum" &&
      i.fixAction.field === "reasoning_summary",
  )?.fixAction;
  const showSummary =
    summaryFix?.kind === "set-settings-enum" &&
    summaryFix.field === "reasoning_summary";
  const autoFixCount = countAutoFixes(issues);

  const nameIssue = issues.find((i) => i.fixAction?.kind === "set-name");
  const nameSuggestion =
    nameIssue?.fixAction?.kind === "set-name"
      ? (nameIssue.fixAction.suggested ?? "Imported Agent")
      : "Imported Agent";

  const [nameDraft, setNameDraft] = useState(nameSuggestion);

  if (
    !showModel &&
    !showName &&
    !showAgentType &&
    !showEffort &&
    !showSummary &&
    autoFixCount === 0
  ) {
    return null;
  }

  const modelId = readValidModelIdFromPaste(pastedText);

  const patch = (action: ImportFixAction, value?: string) => {
    const next = applyImportFix(pastedText, action, value);
    if (next) onPatchedText(next);
  };

  const runAutoFixes = () => {
    const actions = issues
      .map((i) => i.fixAction)
      .filter((a): a is ImportFixAction => a != null);
    const next = applyAutoFixes(pastedText, actions);
    if (next) onPatchedText(next);
  };

  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 space-y-2 shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-primary flex items-center gap-1.5">
        <Wrench className="h-3 w-3" />
        Quick fixes
      </p>

      {showModel && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Pick a model to continue.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-xs text-muted-foreground shrink-0 w-14">
              Model
            </Label>
            <SmartModelSelect
              value={modelId}
              onValueChange={(id) => patch({ kind: "pick-model" }, id)}
              placeholder="Select a model…"
              className="min-w-[200px] flex-1"
            />
          </div>
        </div>
      )}

      {showName && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Enter a name for this agent.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-xs text-muted-foreground shrink-0 w-14">
              Name
            </Label>
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="h-7 text-xs flex-1 min-w-[160px]"
              placeholder="Agent name"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onClick={() => patch({ kind: "set-name" }, nameDraft)}
              disabled={!nameDraft.trim()}
            >
              Apply
            </Button>
          </div>
        </div>
      )}

      {showAgentType && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Choose an agent type.</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-xs text-muted-foreground shrink-0 w-14">
              Type
            </Label>
            <Select onValueChange={(v) => patch({ kind: "set-agent-type" }, v)}>
              <SelectTrigger className="h-7 text-xs w-[140px]">
                <SelectValue placeholder="agent_type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user" className="text-xs">
                  user
                </SelectItem>
                <SelectItem value="builtin" className="text-xs">
                  builtin
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {showEffort && effortFix?.kind === "set-settings-enum" && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Pick a valid reasoning effort.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-xs text-muted-foreground shrink-0 w-14">
              Reasoning
            </Label>
            <Select
              onValueChange={(v) =>
                patch(
                  {
                    kind: "set-settings-enum",
                    field: "reasoning_effort",
                    options: effortFix.options,
                  },
                  v,
                )
              }
            >
              <SelectTrigger className="h-7 text-xs w-[160px]">
                <SelectValue placeholder="reasoning_effort" />
              </SelectTrigger>
              <SelectContent>
                {effortFix.options.map((opt) => (
                  <SelectItem key={opt} value={opt} className="text-xs">
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {showSummary && summaryFix?.kind === "set-settings-enum" && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Pick a valid reasoning summary.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-xs text-muted-foreground shrink-0 w-14">
              Summary
            </Label>
            <Select
              onValueChange={(v) =>
                patch(
                  {
                    kind: "set-settings-enum",
                    field: "reasoning_summary",
                    options: summaryFix.options,
                  },
                  v,
                )
              }
            >
              <SelectTrigger className="h-7 text-xs w-[160px]">
                <SelectValue placeholder="reasoning_summary" />
              </SelectTrigger>
              <SelectContent>
                {summaryFix.options.map((opt) => (
                  <SelectItem key={opt} value={opt} className="text-xs">
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {autoFixCount > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs w-full"
          onClick={runAutoFixes}
        >
          Apply {autoFixCount} automatic fix{autoFixCount === 1 ? "" : "es"}{" "}
          (field renames, text blocks, tools…)
        </Button>
      )}
    </div>
  );
}
