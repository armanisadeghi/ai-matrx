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
    return (
      <PropertyRow label="Available inputs" value="None" source="Provision" />
    );
  }
  return (
    <ul
      className={cn(
        "divide-y divide-border/40 rounded-lg border border-border/50",
        className,
      )}
    >
      {values.map((value) => (
        <OfferedValueRow
          key={value.name}
          value={value}
          pinned={pinnedContext.includes(value.name)}
        />
      ))}
    </ul>
  );
}

function OfferedValueRow({
  value,
  pinned,
}: {
  value: OfferedValue;
  pinned: boolean;
}) {
  return (
    <li className="min-w-0 space-y-2 px-3 py-3">
      <div className="flex items-center gap-1">
        <h4 className="min-w-0 break-words text-sm font-medium">
          {formatVariableDisplayName(value.name) || "Display name missing"}
        </h4>
        <FieldHelp label={formatVariableDisplayName(value.name) || "Input"}>
          {value.description || "No description provided."}
        </FieldHelp>
      </div>
      <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-x-6">
        <PropertyRow
          label="Format"
          value={formatVariableDisplayName(value.kind) || "Unknown"}
        />
        <PropertyRow
          label="Always available"
          value={
            typeof value.guaranteed === "boolean"
              ? value.guaranteed
                ? "Yes"
                : "No"
              : "Unknown"
          }
        />
        <PropertyRow
          label="Retrieval"
          value={
            typeof value.lazy === "boolean"
              ? value.lazy
                ? "On demand"
                : "At launch"
              : "Unknown"
          }
        />
        <PropertyRow
          label="Automatic context delivery"
          value={pinned ? "Yes" : "No"}
        />
      </div>
      <PropertyRow
        label="Example"
        value={
          <span className="whitespace-pre-wrap">
            {value.example || "Not provided"}
          </span>
        }
      />
    </li>
  );
}
