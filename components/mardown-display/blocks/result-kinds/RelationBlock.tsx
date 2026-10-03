"use client";

/**
 * `relation` — a pointer at one record or platform thing, drawn as ONE chip (KINDS-GLUE wave 4
 * §A.3.4). The chip opens through that token's own door (`recordsRenderReference` → `EntityRef`)
 * only after the door said this viewer may open it (`useOpenability`, batched per tick). A
 * target the viewer can't open is a muted chip with the agent's label, the door's own sentence
 * as its title, and no link.
 */

import React from "react";
import { CircleSlash } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { recordsRenderReference } from "@/features/unified-data/recordsReferences";
import { useOpenability, type Openability, type RelationRef } from "@/features/content-ir/record-primitives/openability";
import { cn } from "@/lib/utils";
import { RawRegion, StillArriving, isRecord, readKindValue, readText, type ResultKindBlockProps } from "./result-kind-shared";

export interface RelationChipProps {
  reference: RelationRef & { label: string | null };
  openability: Openability;
  className?: string;
}

const CHIP = "inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border px-2 py-0.5 align-middle text-sm";

/** One relation chip in one of its three states. Exported for the pick list's record choices. */
export function RelationChip({ reference, openability, className }: RelationChipProps) {
  const words = reference.label ?? "Not available";
  if (openability.state === "open") {
    return (
      <span className={cn(CHIP, "border-border bg-muted/40", className)} data-relation-chip="open">
        {recordsRenderReference({ token: reference.token, id: reference.id, label: reference.label })}
      </span>
    );
  }
  if (openability.state === "closed") {
    return (
      <span
        className={cn(CHIP, "border-dashed border-border text-muted-foreground", className)}
        data-relation-chip="closed"
        title={openability.sentence}
      >
        <CircleSlash className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{words}</span>
        <span className="shrink-0 text-xs">· Can&apos;t open</span>
      </span>
    );
  }
  return (
    <span className={cn(CHIP, "border-border text-muted-foreground", className)} data-relation-chip="checking">
      <span className="truncate">{words}</span>
    </span>
  );
}

const RelationBlock: React.FC<ResultKindBlockProps> = ({ content, metadata, className }) => {
  const { value, recovered, streaming } = readKindValue(content, metadata);
  const organizationId = useAppSelector(selectActiveOrganizationId) ?? null;
  const id = recovered && isRecord(value) ? readText(value._record_id) : null;
  const reference = {
    token: (isRecord(value) && readText(value.token)) || "record",
    id: id ?? "",
    tableId: isRecord(value) ? readText(value.table_id) : null,
    label: isRecord(value) ? readText(value.label) : null,
  };
  const answers = useOpenability(id ? [reference] : [], organizationId);
  if (!recovered || !isRecord(value) || !id) return <RawRegion content={content} className={className} />;
  if (streaming) return <StillArriving />;
  return (
    <span className={cn("my-1 inline-flex", className)}>
      <RelationChip reference={reference} openability={answers.get(`${reference.token}:${id}`) ?? { state: "checking" }} />
    </span>
  );
};

export default RelationBlock;
