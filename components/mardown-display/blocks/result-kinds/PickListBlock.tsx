"use client";

/**
 * `pick_list` — an offer to choose records of ONE Pick list, drawn as choices (KINDS-GLUE wave 4
 * §A.3.4; chair V2). Every choice must be a record of the list the offer names: the shape is
 * checked first (`pickListChoiceRefusal`), then the list's own records are read once as the
 * viewer (`usePickListMembership`). A choice that is not one of them refuses the whole offer in
 * one plain sentence.
 *
 * Choosing is slice 4.6 (one server door). Until it ships the choices are drawn and cannot be
 * pressed, and say so — never a button that does nothing.
 */

import React from "react";
import { Info, ListChecks } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { usePickListMembership } from "@/features/content-ir/record-primitives/openability";
import { pickListChoiceRefusal, pickListChoices } from "@/features/content-ir/kinds/record-primitives";
import { cn } from "@/lib/utils";
import { RawRegion, StillArriving, isRecord, readKindValue, readText, type ResultKindBlockProps } from "./result-kind-shared";

export const PICK_NOT_YET = "Choosing here is not available yet";

function Refused({ sentence, className }: { sentence: string; className?: string }) {
  return (
    <div
      className={cn("my-2 flex min-w-0 items-start gap-1.5 rounded-md border border-warning/30 bg-warning/5 p-2.5 text-xs font-semibold text-warning", className)}
      data-pick-list-refused=""
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 break-words">{sentence}</span>
    </div>
  );
}

const PickListBlock: React.FC<ResultKindBlockProps> = ({ content, metadata, className }) => {
  const { value, recovered, streaming } = readKindValue(content, metadata);
  const organizationId = useAppSelector(selectActiveOrganizationId) ?? null;
  const ok = recovered && isRecord(value);
  const shapeRefusal = ok ? pickListChoiceRefusal(value) : null;
  const choices = ok && !shapeRefusal ? pickListChoices(value) : [];
  const listId = ok ? readText(value.pick_list_id) : null;
  const membership = usePickListMembership(organizationId, shapeRefusal ? null : listId, choices.map((c) => c.recordId));

  if (!ok) return <RawRegion content={content} className={className} />;
  if (streaming) return <StillArriving />;
  if (shapeRefusal) return <Refused sentence={shapeRefusal} className={className} />;
  if (membership.state === "refused") {
    return <Refused sentence="You can't open the Pick list these choices come from." className={className} />;
  }
  const stranger = membership.state === "read" ? choices.find((c) => !membership.members.has(c.recordId)) : undefined;
  if (stranger) {
    return (
      <Refused
        sentence={`“${stranger.label}” is not a record of this Pick list, so these choices can't be offered.`}
        className={className}
      />
    );
  }
  const prompt = readText(value.prompt);
  const many = value.choose === "many";
  return (
    <div className={cn("my-2 min-w-0 space-y-2", className)} data-pick-list="" data-pick-list-state={membership.state}>
      {prompt ? (
        <div className="flex min-w-0 items-start gap-1.5 text-sm text-foreground">
          <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 break-words">{prompt}</span>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-wrap gap-1.5" role={many ? "group" : "radiogroup"} aria-label={prompt ?? "Choices"}>
        {choices.map((choice) => (
          <span
            key={choice.recordId}
            role={many ? "checkbox" : "radio"}
            aria-checked={false}
            aria-disabled
            title={PICK_NOT_YET}
            data-pick-list-choice={choice.recordId}
            className={cn(
              "inline-flex min-w-0 max-w-full flex-col rounded-md border border-border bg-muted/40 px-2.5 py-1 text-sm",
              membership.state === "checking" && "opacity-60",
            )}
          >
            <span className="truncate text-foreground">{choice.label}</span>
            {choice.description ? <span className="truncate text-xs text-muted-foreground">{choice.description}</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
};

export default PickListBlock;
