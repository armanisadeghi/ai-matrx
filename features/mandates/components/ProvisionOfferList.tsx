"use client";

// features/mandates/components/ProvisionOfferList.tsx
//
// THE PROVISION, on screen — every value a Mandate's Provision offers its
// Holder: name, kind, whether it is always there, whether it is fetched when
// used, and the description the
// declaration wrote, one click away.
//
// ONE renderer, two surfaces: the personal workspace (§1 "The job") and the
// admin workbench drawer. The workspace grew this row first; the drawer must
// not grow a second, drifting copy of it.

import { cn } from "@/lib/utils";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import {
  FieldHelp,
  PropertyRow,
  ConfigurationTable,
  ConfigurationTableRow,
} from "@/components/official/ConfigurationFields";
import type { OfferedValue } from "../provision-shapes";

export interface ProvisionOfferListProps {
  values: readonly OfferedValue[];
  /** Value names the platform delivers automatically — never hand-mapped. */
  pinnedContext?: readonly string[];
  className?: string;
}

export function ProvisionOfferList({
  values,
  pinnedContext = [],
  className,
}: ProvisionOfferListProps) {
  if (values.length === 0) {
    return <PropertyRow label="Available inputs" value="None" />;
  }
  const columns = [
    { key: "name", label: "Input" },
    { key: "format", label: "Format" },
    {
      key: "available",
      label: "Availability",
      help: "Always: provided on every call. Conditional: may be absent.",
    },
    { key: "retrieval", label: "Retrieval" },
    {
      key: "context",
      label: "Auto context",
      help: "Whether the platform delivers this input to context automatically.",
    },
    { key: "example", label: "Example" },
  ];
  return (
    <div className={cn("min-w-0", className)}>
      <ConfigurationTable label="Mandate inputs" columns={columns}>
        {values.map((value) => (
          <ConfigurationTableRow
            key={value.name}
            columns={columns}
            cells={{
              name: (
                <span className="inline-flex items-center gap-1 font-semibold">
                  {formatVariableDisplayName(value.name) ||
                    "Display name missing"}
                  <FieldHelp
                    label={formatVariableDisplayName(value.name) || "Input"}
                  >
                    {value.description || "No description provided."}
                  </FieldHelp>
                </span>
              ),
              format: formatVariableDisplayName(value.kind) || "Unknown",
              available:
                typeof value.guaranteed === "boolean"
                  ? value.guaranteed
                    ? "Always"
                    : "Conditional"
                  : "Unknown",
              retrieval:
                typeof value.lazy === "boolean"
                  ? value.lazy
                    ? "On demand"
                    : "At launch"
                  : "Unknown",
              context: pinnedContext.includes(value.name) ? "Yes" : "No",
              example: (
                <span className="whitespace-pre-wrap">
                  {value.example || "Not provided"}
                </span>
              ),
            }}
          />
        ))}
      </ConfigurationTable>
    </div>
  );
}
