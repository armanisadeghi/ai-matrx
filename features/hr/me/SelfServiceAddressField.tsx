// features/hr/me/SelfServiceAddressField.tsx
//
// 🚨 AN ADDRESS IS THE §7.2 PENDING CASE, AND IT IS THE HARDEST ONE.
//
// `SelfServiceField` edits a string. An address is a jsonb object
// (`{line1, line2, city, region, postal_code, country}`), so it needs its own
// control — and it is exactly the field §7.2 was written about, because
// `hr.field_policy` seeds home and mailing address as `self_request_approval`
// with `approver_action_type = 'address_change_approve'`, which
// `hr_self_update` routes to the `address_change` flow rather than
// `profile_edit_request`.
//
// 🚨 THE ADDRESS LAW: an org override to `free` is REJECTED by the server's
// validation predicate. A home address change is a JURISDICTION change — it
// moves what tax and leave law applies to this person — so it is never instant
// for anybody, including HR. This control therefore has no "Save" state at all:
// its only verb is "Ask HR".
//
// 🚨 THE PENDING RULE, SAME AS EVERY OTHER FIELD. While a request is open this
// renders THE REQUESTED ADDRESS, visually distinct, with the day and a door to
// the request. Never the old address as though nothing happened; never the new
// one as though HR had agreed.

"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock3, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

import { humanFieldName } from "./selfServicePolicy";
import type { HrPendingFieldRequest } from "./SelfServiceField";

/** The parts `hr.employee_private.home_address` actually carries. */
const ADDRESS_PARTS: readonly { key: string; label: string }[] = [
  { key: "line1", label: "Street address" },
  { key: "line2", label: "Apartment, suite (optional)" },
  { key: "city", label: "City" },
  { key: "region", label: "State or region" },
  { key: "postal_code", label: "Postal code" },
  { key: "country", label: "Country" },
];

function toParts(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const { key } of ADDRESS_PARTS) {
    const raw = source[key];
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

/** The lines a person recognises, in the order an envelope is written. */
export function addressLines(value: unknown): string[] {
  const parts = toParts(value);
  return [
    parts.line1,
    parts.line2,
    [parts.city, parts.region, parts.postal_code].filter(Boolean).join(", "),
    parts.country,
  ].filter((line): line is string => typeof line === "string" && line.trim() !== "");
}

function formatDay(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SelfServiceAddressField({
  field,
  label,
  value,
  pending,
  onSave,
  saving,
  className,
}: {
  field: string;
  label?: string;
  /** The stored address. Only rendered when there is NO pending request. */
  value: unknown;
  pending?: HrPendingFieldRequest | null;
  /** Resolves `false` when the write did not land; the editor then keeps the typed address. */
  onSave: (field: string, next: Record<string, string>) => Promise<boolean>;
  saving?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() => toParts(value));

  const heading = label ?? humanFieldName(field);

  // THE RULE. A pending request owns the display.
  if (pending) {
    return (
      <div className={cn("min-w-0 space-y-1", className)}>
        <div className="text-xs font-medium text-muted-foreground">{heading}</div>
        <div className="rounded-md border border-dashed border-border bg-muted/40 px-2.5 py-1.5">
          <p className="break-words text-sm font-medium italic text-foreground">
            {pending.requestedValue?.trim() || "—"}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
            <Clock3 className="h-3 w-3 shrink-0" />
            <span>Requested {formatDay(pending.requestedAt)} — awaiting HR</span>
            {pending.href ? (
              <Link
                href={pending.href}
                className="underline underline-offset-2 hover:text-foreground"
              >
                See the request
              </Link>
            ) : null}
          </p>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className={cn("min-w-0 space-y-2", className)}>
        <div className="text-xs font-medium text-muted-foreground">{heading}</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {ADDRESS_PARTS.map(({ key, label: partLabel }) => (
            <div key={key} className={key.startsWith("line") ? "sm:col-span-2" : ""}>
              <label
                htmlFor={`self-${field}-${key}`}
                className="text-[0.6875rem] text-muted-foreground"
              >
                {partLabel}
              </label>
              <Input
                id={`self-${field}-${key}`}
                value={draft[key] ?? ""}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, [key]: e.target.value }))
                }
                className="min-h-11 sm:min-h-9"
              />
            </div>
          ))}
        </div>
        <p className="text-[0.6875rem] text-muted-foreground">
          Changing your address is a jurisdiction change, so HR approves it.
          Nothing changes until they do.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            className="min-h-11 sm:min-h-8"
            disabled={saving}
            onClick={async () => {
              // Empty parts are dropped rather than sent as "", so an untouched
              // optional line never overwrites anything with emptiness.
              const next: Record<string, string> = {};
              for (const [key, part] of Object.entries(draft)) {
                if (part.trim()) next[key] = part.trim();
              }
              const landed = await onSave(field, next);
              if (landed) setEditing(false);
            }}
          >
            Ask HR
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11 sm:min-h-8"
            onClick={() => {
              setDraft(toParts(value));
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const lines = addressLines(value);

  return (
    <div className={cn("matrx-touch-targets group min-w-0 space-y-0.5", className)}>
      <div className="text-xs font-medium text-muted-foreground">{heading}</div>
      <div className="flex min-w-0 items-start gap-2">
        {lines.length === 0 ? (
          <span className="text-sm italic text-muted-foreground">Not provided</span>
        ) : (
          <address className="min-w-0 text-sm not-italic text-foreground">
            {lines.map((line) => (
              <span key={line} className="block break-words">
                {line}
              </span>
            ))}
          </address>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Change ${heading.toLowerCase()}`}
          onClick={() => setEditing(true)}
        >
          <PencilLine className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-[0.6875rem] text-muted-foreground">
        Needs approval — an address change moves your jurisdiction.
      </p>
    </div>
  );
}
