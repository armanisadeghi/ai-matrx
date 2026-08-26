"use client";

/**
 * useIntentKey — one idempotency key per USER INTENT, reused across every retry of that intent.
 *
 * 🚨 THIS IS THE WHOLE POINT OF §1.4, AND IT IS EASY TO GET SUBTLY WRONG. Minting a fresh key
 * inside the retry is the classic mistake: it looks like idempotency, costs the same code, and
 * protects nothing — the server sees a brand-new request and does the work again. On this family
 * that means a second payroll file.
 *
 * The identity of an intent is `(verb, subject, payload)`:
 *   - same verb, same export, same payload  → the SAME key. A double-click, a flaky network, a
 *     user pressing the button again: one action, replayed, one outcome.
 *   - same verb, same export, DIFFERENT payload → a NEW key, deliberately. §1.4 makes a reused key
 *     with a changed body a `409 hr_idempotency_conflict`, and it is right to: acknowledging with
 *     reference A and then with reference B are two different statements about the world, not a
 *     retry of one.
 *
 * Keys live for the lifetime of the surface, which is the lifetime of the user's session with
 * these rows. A reload is a new intent, and that is correct — the server-side domain key
 * (`payperiod:<id>:v1`) is what protects the generate path across sessions.
 */

import { useRef } from "react";
import { newExportIntentKey } from "../service";

export interface IntentKeyStore {
  /** The stable key for this exact intent, minted on first ask. */
  forIntent: (verb: string, subject: string, payload: string) => string;
}

export function useIntentKeys(): IntentKeyStore {
  const keys = useRef<Map<string, string>>(new Map());
  return {
    forIntent: (verb, subject, payload) => {
      const identity = `${verb}::${subject}::${payload}`;
      const existing = keys.current.get(identity);
      if (existing) return existing;
      const minted = newExportIntentKey();
      keys.current.set(identity, minted);
      return minted;
    },
  };
}
