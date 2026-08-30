"use client";

// features/hr/people/identity/SsnField.tsx
//
// The Social Security number row on the identity panel: the no-data state, intake,
// and the last-4 + audited reveal once a number is on file.
// SPEC-EMPLOYEES §2.3 (field policy) · SPEC-ACCESS §4.2 / §4.5.
//
// 🚨 THE ROW HAS EXACTLY THREE STATES, AND WHICH ONE YOU SEE IS THE SERVER'S ANSWER,
// NOT A LOCAL GUESS:
//
//   1. No number on file, and you may record one   → the masked entry field.
//   2. No number on file, and you may not          → "Not collected", no control.
//   3. A number on file                            → last four + the reveal door.
//
// 🚨 WHO MAY RECORD ONE MIRRORS THE DOOR'S TWO ARMS. `public.hr_ssn_store` gates on
//
//     hr.capability(v_uid, 'identity.write', v_subject, current_date, v_org) or v_self
//
// — a holder of `identity.write` over this person, **or the person themselves**. So
// the field is offered on exactly those two, and a UI stricter than its own door
// would make the self lane unreachable, which is the defect this lane has now fixed
// twice (the reveal control had the same gap). The org argument matters too: that
// capability call is org-scoped, per `hr_l1_20`.
//
// 🚨 THE TYPED VALUE IS NEVER PERSISTED AND NEVER ECHOED. It lives in one `useState`,
// goes into one request body, and is cleared the moment the request settles — success
// or failure. On success the field is replaced by the last-4 display, so there is no
// code path that can render back what was typed. `autoComplete="off"` keeps the
// browser from offering to remember it.

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { useBackendApi } from "@/hooks/useBackendApi";
import { cn } from "@/lib/utils";

import { SsnRevealDoor } from "./SsnRevealDoor";
import { storeHrSsn } from "./storeSsn";

export function SsnField({
  employeeId,
  organizationId,
  capabilities,
  viewer,
  /** `ssn_last4` from the profile. `null` means no number is on file. */
  last4,
  className,
}: {
  employeeId: string;
  organizationId: string;
  capabilities: string[];
  viewer: string;
  last4: string | null;
  className?: string;
}) {
  const api = useBackendApi();
  const isSelf = viewer === "self";
  const mayRecord = capabilities.includes("identity.write") || isSelf;

  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once a submit lands, so the panel switches without waiting for a refetch.
  const [storedLast4, setStoredLast4] = useState<string | null>(null);

  const shown = storedLast4 ?? last4;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await storeHrSsn({
      request: api.fetch,
      employeeId,
      organizationId,
      ssn: value,
    });
    // 🚨 Cleared on EVERY outcome, not just success. A rejected value is still a
    // government identifier sitting in a DOM node.
    setValue("");
    setBusy(false);

    if (result.kind === "stored") {
      setStoredLast4(result.last4);
      return;
    }
    setError(result.message);
  };

  // ── State 3: a number is on file ─────────────────────────────────────────────
  if (shown) {
    return (
      <div className={cn("space-y-1", className)}>
        <p className="text-sm text-foreground">•••–••–{shown}</p>
        <p className="text-xs text-muted-foreground">
          Last four digits. The full number is behind an audited request.
        </p>
        <SsnRevealDoor
          employeeId={employeeId}
          organizationId={organizationId}
          capabilities={capabilities}
          viewer={viewer}
        />
      </div>
    );
  }

  // ── State 2: nothing on file, and this viewer may not record one ─────────────
  if (!mayRecord) {
    return (
      <div className={cn("space-y-1", className)}>
        <p className="text-sm italic text-muted-foreground">Not collected</p>
        <p className="text-xs text-muted-foreground">
          No Social Security number is on record for this person.
        </p>
      </div>
    );
  }

  // ── State 1: nothing on file, and this viewer may record one ─────────────────
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-sm italic text-muted-foreground">Not collected</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="000-00-0000"
          aria-label={
            isSelf
              ? "Your Social Security number"
              : "This person's Social Security number"
          }
          className="h-8 max-w-[11rem] font-mono text-xs"
          disabled={busy}
        />
        <Button
          type="button"
          size="sm"
          disabled={busy || !value.trim()}
          onClick={() => void submit()}
        >
          {busy ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              Save
            </>
          )}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <p className="text-[0.6875rem] text-muted-foreground">
        Sealed on the server the moment you save. Afterwards only the last four
        digits are shown, and seeing the whole number takes a recorded reason.
      </p>
    </div>
  );
}
