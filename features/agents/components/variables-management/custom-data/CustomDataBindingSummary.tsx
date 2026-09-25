"use client";

/**
 * The compact "Bound to Model Picks · whole table" line for a variable bound to
 * the author's custom data. Reads the table's name through the record store
 * (the same provider the editor uses); while it loads, or when the table is not
 * in the selected organization, it says so instead of printing an id.
 */

import { Database } from "lucide-react";
import { useTable } from "@ai-matrx/records/react";
import { tableName } from "@ai-matrx/records-ui";
import { cn } from "@/lib/utils";
import type { CustomDataBinding } from "@/features/agents/types/agent-definition.types";
import { CustomDataRecordsScope } from "./CustomDataRecordsScope";
import { shapeWords } from "./customDataBinding";

interface CustomDataBindingSummaryProps {
  binding: CustomDataBinding;
  className?: string;
  /** Icon only, with the sentence as its tooltip — for dense rows. */
  iconOnly?: boolean;
}

export function CustomDataBindingSummary(props: CustomDataBindingSummaryProps) {
  return (
    <CustomDataRecordsScope quiet>
      <SummaryBody {...props} />
    </CustomDataRecordsScope>
  );
}

function SummaryBody({
  binding,
  className,
  iconOnly,
}: CustomDataBindingSummaryProps) {
  const table = useTable(binding.table_id || null);
  const name = !binding.table_id
    ? "no table chosen yet"
    : table.loading
      ? "your data"
      : table.data
        ? tableName(table.data)
        : "a table outside this organization";
  const sentence = `Bound to ${name} · ${shapeWords(binding.semantic_type)}`;

  if (iconOnly) {
    return (
      <span title={sentence} aria-label={sentence} className={className}>
        <Database className="h-3 w-3 shrink-0 text-primary" />
      </span>
    );
  }
  return (
    <span
      title={sentence}
      className={cn(
        "inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <Database className="h-3 w-3 shrink-0 text-primary" />
      <span className="truncate">{sentence}</span>
    </span>
  );
}
