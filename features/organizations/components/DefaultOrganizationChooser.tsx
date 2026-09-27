"use client";

// DefaultOrganizationChooser — the "open this at startup" preference as the
// platform's ONE organization control (`OrganizationPicker` from
// `@ai-matrx/design-system`: search, rarely-used organizations folded, test
// organizations behind a disclosure, the address shown when two share a name),
// fed by the same membership read and mapping as the header's picker.
//
// It only chooses the DEFAULT (a display preference): it never changes the
// organization the person is working in right now.

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  OrganizationPicker,
  Popover,
  PopoverContent,
  PopoverTrigger,
  selectTriggerVariants,
} from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { useActiveOrganizationPicker } from "@/features/organizations/hooks/useActiveOrganizationPicker";
import { useDefaultOrganization } from "@/features/organizations/hooks/useDefaultOrganization";
import { toPickerOrganizations } from "./OrganizationPickerPanel";

export function DefaultOrganizationChooser({
  id,
  className,
}: {
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { organizations, loading, loadFailed } = useActiveOrganizationPicker();
  const { defaultOrganizationId, setDefaultOrganization } = useDefaultOrganization();
  const current = organizations.find((org) => org.id === defaultOrganizationId) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          className={cn(
            selectTriggerVariants({ size: "default" }),
            "h-auto min-h-9 max-lg:min-h-11 pointer-coarse:min-h-11 justify-between text-left",
            className,
          )}
        >
          <span className={cn("truncate", !current && "text-muted-foreground")}>
            {current ? current.name : "None"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="matrx-touch-targets w-80 max-w-[calc(100vw-2rem)] p-1">
        <OrganizationPicker
          hideHeading
          hideStatus
          organizations={toPickerOrganizations(organizations)}
          // The picker marks the row it is choosing; here that is the default.
          activeOrganizationId={defaultOrganizationId}
          loading={loading}
          loadFailed={loadFailed}
          onSelect={(org) => {
            setDefaultOrganization(org.id);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
