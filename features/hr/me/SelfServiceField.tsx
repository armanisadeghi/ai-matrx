// features/hr/me/SelfServiceField.tsx
//
// 🚨 THE PENDING-REQUEST RENDERING RULE (SPEC-EMPLOYEES §7.2) — the whole
// reason this component exists.
//
//   A field with an open request shows THE REQUESTED VALUE inline, visually
//   distinct, with "Requested 3 Sep — awaiting HR" and A DOOR to the request.
//
//   It NEVER shows the old value as if nothing happened — the person typed
//   something and would reasonably think it was lost.
//   It NEVER shows the new value as if it were accepted — the person would
//   reasonably think HR had agreed.
//
//   On rejection the pending value is DISCARDED and the requester is TOLD WHY.
//   Never silently retained, never silently dropped.
//
// 🚨 THE CLIENT IS UX ONLY, NEVER THE BOUNDARY. A field rendered editable here
// is still refused by `hr_self_update` if the policy says so, and the refusal
// names it. That is the design: this component makes the common case pleasant,
// and the server makes the rule true.
//
// 🚨 EXPORTED FOR THE PROFILE. The Personal tab of routes 13/14 with
// `viewer=self` renders the SAME fields — there is no second self-service
// implementation. Import these; do not copy them.

"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock3, Lock, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  HR_SELF_SERVICE_HINTS,
  humanFieldName,
  type HrSelfServicePolicy,
} from "./selfServicePolicy";

export type HrPendingFieldRequest = {
  /** The value the person asked for. THIS is what renders, not the stored one. */
  requestedValue: string | null;
  requestedAt: string | null;
  /** The door to the request itself (a task in the HR inbox). */
  href: string | null;
};

function formatDay(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SelfServiceField({
  field,
  label,
  value,
  policy,
  pending,
  onSave,
  saving,
  className,
}: {
  field: string;
  label?: string;
  /** The stored value. Only rendered when there is NO pending request. */
  value: string | null;
  policy: HrSelfServicePolicy;
  /** An open `profile_edit_request` / `address_change` on this field. */
  pending?: HrPendingFieldRequest | null;
  onSave: (field: string, next: string) => Promise<void>;
  saving?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const heading = label ?? humanFieldName(field);
  const hint = HR_SELF_SERVICE_HINTS[policy];
  const editable = policy === "free" || policy === "request_approval";

  // THE RULE. A pending request owns the display: neither the old value nor a
  // pretend-accepted new one.
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
            <span>
              Requested {formatDay(pending.requestedAt)} — awaiting HR
            </span>
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
      <div className={cn("min-w-0 space-y-1", className)}>
        <label
          htmlFor={`self-${field}`}
          className="text-xs font-medium text-muted-foreground"
        >
          {heading}
        </label>
        <Input
          id={`self-${field}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-11 sm:min-h-9"
          autoFocus
        />
        {policy === "request_approval" ? (
          <p className="text-[0.6875rem] text-muted-foreground">
            Saving this asks HR to approve it. Nothing changes until they do.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            className="min-h-11 sm:min-h-8"
            disabled={saving}
            onClick={async () => {
              await onSave(field, draft);
              setEditing(false);
            }}
          >
            {policy === "request_approval" ? "Ask HR" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11 sm:min-h-8"
            onClick={() => {
              setDraft(value ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group min-w-0 space-y-0.5", className)}>
      <div className="text-xs font-medium text-muted-foreground">{heading}</div>
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 break-words text-sm font-medium text-foreground">
          {value?.trim() || (
            <span className="italic text-muted-foreground">Not provided</span>
          )}
        </span>
        {editable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            aria-label={`Change ${heading.toLowerCase()}`}
            onClick={() => setEditing(true)}
          >
            <PencilLine className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
      {hint ? (
        <p className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
          {policy === "hr_only" ? <Lock className="h-3 w-3 shrink-0" /> : null}
          {hint}
        </p>
      ) : null}
    </div>
  );
}
