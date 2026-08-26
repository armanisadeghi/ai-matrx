// features/hr/me/usePendingFieldRequests.ts
//
// Which of my fields have an open request, and what did I ask for?
//
// 🚨 THE ANSWER COMES FROM THE WORKFLOW, NOT FROM THE RECORD. A
// `request_approval` field applies NOTHING until HR decides, so the stored row
// still holds the old value — the requested value lives only in the workflow
// instance's payload. Reading the record and hoping to spot a change would find
// nothing, which is exactly how a pending edit becomes invisible.
//
// 🚨 ON REJECTION THE PENDING VALUE IS DISCARDED (§7.2). This hook returns only
// IN-FLIGHT instances, so a rejected request simply stops appearing and the
// field falls back to its stored value. The "and the requester is told why"
// half is the notification lane's, not this hook's — the field must not keep
// rendering a value nobody accepted.

"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchHrPendingChanges } from "@/features/hr/service";
import { hrTasksHref } from "@/features/hr/routes";
import { useHrContext } from "@/features/hr/shared/useHrContext";

import type { HrPendingFieldRequest } from "./SelfServiceField";

/** The two flows §7 opens. Anything else in flight is not a field request. */
const FIELD_FLOWS = new Set(["profile_edit_request", "address_change"]);

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // An address is an object. Render the lines a person recognises rather than
  // JSON — a pending value nobody can read is not a pending value.
  if (typeof value === "object") {
    const parts = Object.values(value as Record<string, unknown>)
      .filter((v) => typeof v === "string" && v.trim())
      .map((v) => String(v).trim());
    return parts.length > 0 ? parts.join(", ") : null;
  }
  return null;
}

export function usePendingFieldRequests(employmentId: string | null): {
  byField: Record<string, HrPendingFieldRequest>;
  isLoading: boolean;
  refresh: () => void;
} {
  const { orgRef } = useHrContext();
  const [byField, setByField] = useState<Record<string, HrPendingFieldRequest>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!employmentId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const result = await fetchHrPendingChanges(employmentId);
      if (cancelled) return;

      if (!result.ok) {
        // No pending panel is a legitimate answer; a refusal here must not turn
        // into a claim that nothing is pending, so the fields simply render
        // their stored values and nothing pretends otherwise.
        setByField({});
        setIsLoading(false);
        return;
      }

      const next: Record<string, HrPendingFieldRequest> = {};
      for (const instance of result.data.in_flight ?? []) {
        if (!FIELD_FLOWS.has(instance.flow_key)) continue;
        const payload = instance.payload ?? null;
        if (!payload) continue;
        for (const [field, value] of Object.entries(payload)) {
          const requested = stringify(value);
          if (requested === null) continue;
          next[field] = {
            requestedValue: requested,
            requestedAt: instance.submitted_at,
            // The door to the request. `/hr/tasks` is the ONE inbox — this lane
            // never builds a second one.
            href: hrTasksHref(orgRef),
          };
        }
      }

      setByField(next);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [employmentId, orgRef, reloadToken]);

  return { byField, isLoading, refresh };
}
