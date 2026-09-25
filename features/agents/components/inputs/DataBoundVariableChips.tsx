"use client";

/**
 * Run-form chips for variables bound to the author's CUSTOM DATA
 * (`kind: "merge_field"`, `override_policy: "shown_locked"`).
 *
 * The server resolves these every turn under the runner's own principal; the
 * run form never collects them and never sends a value for them
 * (`resolveVariablesForRequest` skips them). So they are shown here as LOCKED
 * values — the name, where it comes from, and (on click) exactly what the agent
 * will see — never as an input a person could type over.
 */

import { ChevronDown, Lock } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { formatText } from "@ai-matrx/kit/text-case";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceVariableDefinitions } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { isCustomDataBinding } from "@/features/agents/utils/variable-binding";
import type { CustomDataBinding } from "@/features/agents/types/agent-definition.types";
import { CustomDataBindingSummary } from "@/features/agents/components/variables-management/custom-data/CustomDataBindingSummary";
import { CustomDataBindingPreview } from "@/features/agents/components/variables-management/custom-data/CustomDataBindingPreview";

export function DataBoundVariableChips({
  conversationId,
}: {
  conversationId: string;
}) {
  const definitions = useAppSelector(
    selectInstanceVariableDefinitions(conversationId),
  );
  const bound = definitions.flatMap((d) =>
    isCustomDataBinding(d.binding)
      ? [{ name: d.name, binding: d.binding }]
      : [],
  );
  if (bound.length === 0) return null;
  return (
    <>
      {bound.map((b) => (
        <DataBoundChip key={b.name} name={b.name} binding={b.binding} />
      ))}
    </>
  );
}

function DataBoundChip({
  name,
  binding,
}: {
  name: string;
  binding: CustomDataBinding;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex max-w-[280px] min-w-0 items-center gap-1.5 rounded-full border border-border bg-muted/60 py-0.5 pl-2 pr-2 text-xs text-foreground transition-colors hover:bg-muted"
          title={`${formatText(name)} — filled from your data when the agent runs. It can't be changed here.`}
        >
          <Lock className="h-3 w-3 shrink-0 opacity-70" />
          <span className="shrink-0 font-medium">{formatText(name)}</span>
          <CustomDataBindingSummary binding={binding} className="min-w-0" />
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        sizing="content"
        className="w-[min(24rem,90vw)] rounded-2xl p-3"
        align="start"
        side="top"
        sideOffset={6}
      >
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {formatText(name)}
            </span>{" "}
            is filled from your data every time the agent runs, so it is locked
            here.
          </p>
          <CustomDataBindingPreview binding={binding} variableName={name} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
