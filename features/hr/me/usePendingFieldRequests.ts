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
  /*
    An address is an object. Render the lines a person recognises rather than
    JSON — a pending value nobody can read is not a pending value.

    🚨 AND IN THE ORDER AN ENVELOPE IS WRITTEN. This used to take
    `Object.values()`, which walks whatever key order the payload happened to
    arrive in, so the SUBJECT saw their own requested address jumbled — "Portland,
    118 Harbour Way, OR, USA, 97204" — a few keystrokes from the stored one that
    rendered correctly, while the DECIDER saw it properly ordered because the fix
    landed on that surface first. Known parts lead, in envelope order; anything
    unrecognised keeps its own order and follows, so an unexpected key is never
    silently dropped.
  */
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const ORDER = [
      "line1", "line2", "line3", "street",
      "city", "locality", "region", "state",
      "postal_code", "postcode", "zip", "country",
    ];
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const key of ORDER) {
      const v = source[key];
      if (typeof v === "string" && v.trim()) {
        parts.push(v.trim());
        seen.add(key);
      }
    }
    for (const [key, v] of Object.entries(source)) {
      if (seen.has(key)) continue;
      if (typeof v === "string" && v.trim()) parts.push(v.trim());
    }
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
        /*
          🚨 THE FIELDS LIVE UNDER `patch`, NOT AT THE TOP OF THE PAYLOAD.
          `hr_self_update` builds the instance payload as
          `{token, row_id, patch:{…the fields…}, approver_action_type}`. Reading the
          top level keyed this map by `token`, `row_id`, `patch` and
          `approver_action_type` — four things that are not fields — so
          `byField["legal_first_name"]` was ALWAYS undefined and no pending state
          could ever render. The person typed a new legal name, the request really
          was opened, and the field then showed the old value as though nothing had
          happened: §7.2's exact forbidden case, reached by reading one level too high.
        */
        const envelope = instance.payload ?? null;
        if (!envelope) continue;
        const patch = envelope.patch;
        const fields =
          patch && typeof patch === "object" && !Array.isArray(patch)
            ? (patch as Record<string, unknown>)
            : envelope;
        for (const [field, value] of Object.entries(fields)) {
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
