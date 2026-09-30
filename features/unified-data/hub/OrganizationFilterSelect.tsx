"use client";

// features/unified-data/hub/OrganizationFilterSelect.tsx — LANE ORG-FILTER-CLASS
//
// THE ONE ORGANIZATION FILTER CONTROL for every list of a person's data: "All Orgs" first, then
// each organization she belongs to. It is a FILTER — it narrows what a list shows and nothing else;
// it never moves the active organization and never decides who may see what. The data home's bar
// (DATA-HOME-2) and the agent builder's table picker draw this same control.

import { ALL_ORGANIZATIONS, ALL_ORGANIZATIONS_TITLE } from "./dataHomeScope";
import type { OrganizationChoice } from "./useTablesEverywhere";

export interface OrganizationFilterSelectProps {
  value: string;
  choices: ReadonlyArray<OrganizationChoice>;
  onChange?: ((next: string) => void) | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  /** Marks the control for tests and seat walks (`data-hub-organization` on the data home). */
  dataAttribute?: string | undefined;
}

export function OrganizationFilterSelect({
  value,
  choices,
  onChange,
  disabled,
  className,
  dataAttribute = "data-organization-filter",
}: OrganizationFilterSelectProps) {
  return (
    <label className="inline-flex items-center gap-1">
      <span className="sr-only">Organization</span>
      <select
        {...{ [dataAttribute]: "" }}
        aria-label="Organization"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        className={
          className ??
          "h-6 max-w-[14rem] truncate rounded-full border border-border bg-background px-2 text-xs text-foreground"
        }
      >
        <option value={ALL_ORGANIZATIONS}>{ALL_ORGANIZATIONS_TITLE}</option>
        {choices.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
    </label>
  );
}
