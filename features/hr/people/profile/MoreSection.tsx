"use client";

// features/hr/people/profile/MoreSection.tsx
//
// CUSTOM FIELDS, PLACED CORRECTLY AND RENDERED HONESTLY (§7.4 / SPEC-UI-IA §4.3).
//
// PLACEMENT IS THE PART THAT MATTERS AND IT IS NON-NEGOTIABLE: custom fields
// render in a "More" section at the BOTTOM of the tab, below the built-ins,
// never interleaved with them. An admin reordering a custom field must never be
// able to move a legally-required one.
//
// 🚨 THIS IS A MARKED ADAPTER, NOT A FIELD KIT. The platform tier-1 client kit —
// `<CustomFieldsSection>`, `<CustomFieldInput>`, `customFieldColumns()` — belongs
// to lane L14 and DOES NOT EXIST (checked 2026-08-26). Building a per-type
// renderer here would be a competing kit that L14 then has to delete, so this
// renders the stored `custom` jsonb READ-ONLY, says out loud that it is doing
// so, and registers the dependency (`hr.people.custom-fields`).
//
// WHEN THE KIT LANDS: delete this component's body and mount
// `<CustomFieldsSection targetToken="hr_employee" …>` in its place. Do not keep
// both. The one thing to carry over is the placement rule above.
//
// SENSITIVITY STILL APPLIES IDENTICALLY. A `confidential` custom field is ABSENT
// for a manager, not greyed — and it is absent because the SERVER did not put
// the key in `personal.custom`. Nothing here re-derives that; it renders the
// keys it was given.

import { announceComingSoon } from "@/lib/coming-soon/announce";
import { cn } from "@/lib/utils";

function humaniseKey(key: string): string {
  return key
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (Array.isArray(value)) return value.map((v) => renderValue(v)).join(", ");
  return JSON.stringify(value);
}

export function MoreSection({
  custom,
  tabLabel,
  className,
}: {
  /** The `custom` jsonb the server sent for THIS viewer. */
  custom: Record<string, unknown> | null;
  /** Named in the adapter note so a reader knows which tab's fields these are. */
  tabLabel: string;
  className?: string;
}) {
  const entries = Object.entries(custom ?? {}).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  // No custom fields for this viewer → no heading, no divider, nothing.
  if (entries.length === 0) return null;

  return (
    <section className={cn("space-y-3 border-t border-border pt-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">More</h3>
        <button
          type="button"
          onClick={() => void announceComingSoon("hr.people.custom-fields")}
          className="text-[0.6875rem] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Read-only for now — why?
        </button>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(([key, value]) => (
          <div key={key} className="min-w-0 space-y-0.5">
            <dt className="text-xs font-medium text-muted-foreground">
              {humaniseKey(key)}
            </dt>
            <dd className="break-words text-sm font-medium text-foreground">
              {renderValue(value)}
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-[0.6875rem] text-muted-foreground">
        These are the fields your organization added to {tabLabel}. They show
        their stored values; editing them arrives with the platform&apos;s custom
        field editor.
      </p>
    </section>
  );
}
