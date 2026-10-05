"use client";

// features/hr/people/profile/MoreSection.tsx
//
// CUSTOM FIELDS, PLACED CORRECTLY (§7.4 / SPEC-UI-IA §4.3).
//
// PLACEMENT IS THE PART THAT MATTERS AND IT IS NON-NEGOTIABLE: custom fields render at the
// BOTTOM of the tab, below the built-ins, never interleaved with them. An admin reordering a
// custom field must never be able to move a legally-required one.
//
// HR IS FOLDED INTO THE ONE STORE (FTS-2 wave 4b): an employee's custom fields are the platform's
// one section, `<EntityCustomFields entityToken="hr_employee">`, read and changed through the same
// doors as every standard table. A change to an HR row passes HR's own edit rule in the database
// (`hr.custom_fields_write_gate`: identity.write on this employee), and a protected field is read
// only by the people its rule names (wave 4a) — nothing here re-derives either.

import { EntityCustomFields } from "@/features/unified-data/components/EntityCustomFields";
import { cn } from "@/lib/utils";

export function MoreSection({
  employeeId,
  organizationId,
  className,
}: {
  /** The employee whose fields these are (`hr.employee.id`). */
  employeeId: string;
  /** The employee's own organization — never the active one. */
  organizationId: string | null;
  className?: string;
}) {
  return (
    <section className={cn("border-t border-border pt-4", className)}>
      <EntityCustomFields entityToken="hr_employee" recordId={employeeId} organizationId={organizationId} />
    </section>
  );
}
