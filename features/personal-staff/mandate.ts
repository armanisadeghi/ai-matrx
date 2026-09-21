/**
 * features/personal-staff/mandate.ts — the staff job's identity, shared by the
 * server and the browser.
 *
 * 🚨 THIS FILE CARRIES NO DIRECTIVE, DELIBERATELY. `staff-door.ts` is
 * `"use client"`, so a constant declared there reaches a Server Component as a
 * client REFERENCE, not a value: the SSR seed then queried
 * `mandate.definition` for a function stub, found nothing, and `/staff` logged
 * "PERSONAL_STAFF_MANDATE_KEY ... is on the client" while painting no Holder
 * name at all (caught on localhost, 2026-09-20). One directive-free module for
 * the shared value is the fix; do not move it back.
 */

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { MandateKey } from "@/features/mandates/mandate-key";

/** The job the staff thread runs. Never a literal, never a raw agent UUID —
 *  the generated union is the vocabulary (`pnpm check:mandate-keys`). */
export const PERSONAL_STAFF_MANDATE_KEY: MandateKey =
  MANDATE_KEYS.personal_staff__front_line;

/** The channel word a signed-in browser session stamps. `native` is the phone
 *  client's, and it IS an approval-guarded channel; this one deliberately is
 *  not — see `door.py`'s module header. */
export const STAFF_WEB_CHANNEL = "web" as const;

export const STAFF_DOOR_PATH = "/personal-staff/open" as const;
