// features/hr/shared/SensitiveField.tsx
//
// 🚨 THE SINGLE MOST IMPORTANT PRIMITIVE IN THE HR MODULE.
//
//   A FIELD THE VIEWER CANNOT ACCESS IS ABSENT FROM THE DOM.
//   Not disabled. Not masked. Not "••••". Not a lock icon.
//
// Read `useVisibleFields.ts` for the full rule and why absence is expressed as a
// MISSING KEY rather than a null. This file is the rendering half.
//
// WHY THE API LOOKS LIKE THIS. `<SensitiveField>` takes the SOURCE OBJECT and a
// KEY — never a value. There is no `value` prop, no `canSee` prop, and no `fallback`
// prop, so "render a dash where the salary would be" is not something a caller can
// express. That is the point: the rule is enforced by the shape of the API, not by
// reviewers remembering it.
//
//   ✅  <SensitiveField source={profile.personal} name="legal_first_name" label="Legal first name" />
//   ❌  {canSeeLegalName && <Field value={p.legal_first_name} />}          ← review failure
//   ❌  <Field value={p.salary ?? "•••••"} />                              ← disclosure
//
// LAYOUT MUST NOT LEAK. `<SensitiveGrid>` is a plain auto-flow grid: absent fields
// are simply not rendered, so the remaining ones re-flow into the space. Nothing
// here reserves a slot, sets a fixed row count, or keeps a placeholder for
// alignment — a gap where compensation would be is itself a disclosure.

"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  useVisibleFields,
  type HrFieldSpec,
  type HrVisibleField,
} from "./useVisibleFields";

// ── One field ───────────────────────────────────────────────────────────────

type SensitiveFieldProps<T extends object> = {
  /** The object the SERVER returned. Never one you assembled or defaulted. */
  source: T | null | undefined;
  name: Extract<keyof T, string>;
  label: string;
  hint?: string;
  emptyLabel?: string;
  /** Render the value. Never called when the field is absent or empty. */
  format?: (value: T[Extract<keyof T, string>]) => ReactNode;
  /** A door this value opens (§4.5). */
  href?: string | null;
  className?: string;
};

export function SensitiveField<T extends object>({
  source,
  name,
  label,
  hint,
  emptyLabel,
  format,
  href,
  className,
}: SensitiveFieldProps<T>) {
  // THE GATE. No key, no field, no node, no trace.
  if (!source || !(name in source)) return null;

  const value = (source as Record<string, unknown>)[name];
  const empty =
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0);

  const rendered = empty
    ? null
    : format
      ? format(value as T[Extract<keyof T, string>])
      : String(value);

  return (
    <FieldShell
      label={label}
      hint={hint}
      empty={empty}
      emptyLabel={emptyLabel ?? "Not provided"}
      href={href ?? null}
      className={className}
    >
      {rendered}
    </FieldShell>
  );
}

function FieldShell({
  label,
  hint,
  empty,
  emptyLabel,
  href,
  className,
  children,
}: {
  label: string;
  hint?: string;
  empty: boolean;
  emptyLabel: string;
  href: string | null;
  className?: string;
  children: ReactNode;
}) {
  const body = empty ? (
    <span className="text-sm italic text-muted-foreground">{emptyLabel}</span>
  ) : href ? (
    <Link
      href={href}
      className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  ) : (
    <span className="text-sm font-medium text-foreground">{children}</span>
  );

  return (
    <div className={cn("min-w-0 space-y-0.5", className)}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="break-words">{body}</div>
      {hint ? (
        <div className="text-[0.6875rem] leading-snug text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

// ── A whole spec at once ────────────────────────────────────────────────────

/**
 * Render every field of a spec that this payload carries. Preferred over a wall of
 * `<SensitiveField>` calls: the spec is data, so a section's field list can be
 * tested, reordered, and reused by the profile, the peek and the window panel.
 */
export function SensitiveFieldList<T extends object>({
  source,
  specs,
  className,
}: {
  source: T | null | undefined;
  specs: readonly HrFieldSpec<T>[];
  className?: string;
}) {
  const fields = useVisibleFields(source, specs);
  if (fields.length === 0) return null;
  return (
    <SensitiveGrid className={className}>
      {fields.map((field) => (
        <VisibleFieldView key={field.name} field={field} />
      ))}
    </SensitiveGrid>
  );
}

function VisibleFieldView({ field }: { field: HrVisibleField }) {
  return (
    <FieldShell
      label={field.label}
      hint={field.hint}
      empty={field.isEmpty}
      emptyLabel={field.emptyLabel}
      href={field.href}
    >
      {field.content}
    </FieldShell>
  );
}

// ── Layout that cannot leak ─────────────────────────────────────────────────

/**
 * Auto-flow grid. Absent fields are absent, so the rest re-flow — no reserved slot,
 * no fixed row count, no alignment placeholder. Responsive floor is 375px: one
 * column on a phone.
 */
export function SensitiveGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A section that DOES NOT EXIST when it has nothing to show — no heading, no card,
 * no divider. Pass the same `source` + `names` the section's fields read.
 *
 * "A heading with nothing under it tells the viewer what exists and taunts them
 * with it." (SPEC-UI-IA §4.2)
 */
export function SensitiveSection<T extends object>({
  source,
  names,
  title,
  description,
  action,
  children,
  className,
}: {
  source: T | null | undefined;
  /** The keys this section renders. If the payload carries none, nothing renders. */
  names: readonly Extract<keyof T, string>[];
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const present = Boolean(source) && names.some((name) => name in (source as object));
  if (!present) return null;

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * THE ONE PERMITTED DISCLOSURE (SPEC-UI-IA §4.2, SPEC-EMPLOYEES §1.3).
 *
 * Where the law of the surface requires a viewer to know a record EXISTS without
 * seeing it — a manager must know a leave case exists to route scheduling around
 * it — the surface shows an explicit, worded statement:
 *
 *     "This person has an approved leave. Details are held by HR."
 *
 * Never a masked field, never a greyed row, never a lock icon. WHICH records get
 * this treatment is a configuration key (`hr.disclosure.existence_statements`), not
 * a code decision — so this component takes the sentence rather than deciding it,
 * and renders nothing when the config gave none.
 */
export function ExistenceStatement({
  statement,
  className,
}: {
  statement: string | null | undefined;
  className?: string;
}) {
  const text = statement?.trim();
  if (!text) return null;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2",
        className,
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}
