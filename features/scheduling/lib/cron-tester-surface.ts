// features/scheduling/lib/cron-tester-surface.ts
//
// Surface wiring for the admin Cron tester
// (`/administration/automation/scheduling/cron-tester`) — the surface's FIRST
// `SurfaceRuntimeProvider` mount, and still the only one carrying write
// targets. The shell now mounts an outer provider for the other six tabs
// (`admin-scheduling-scope.ts`); this one nests INSIDE it and wins on this tab
// by depth, so the richer cron scope below is what a run here sees.
//
// Two pieces live here rather than in the page so the page stays a page:
//   - the scope builder, which emits `active_tab` + the manifest's `cron_*`
//     values, and
//   - the write handlers behind the surface's two declared targets
//     (`cron_expression`, `cron_timezone`).
//
// THE VOCABULARY LAW: `CRON_TESTER_TIMEZONES` is the single source for BOTH
// the page's timezone picker and the handler's enum check — a re-typed list in
// the handler could accept a zone the picker cannot display, which would leave
// the Select rendering blank over a value the agent believes it set.
//
// Validation reuses `validateCron` from `lib/scheduler-client/next-due` — the
// exact function the page renders its error alert from — so the value a
// handler accepts and the value the page previews can never drift.

import {
  createAdminSchedulingScope,
  ADMIN_SCHEDULING_SURFACE_NAME,
} from "@/features/surfaces/manifests/admin-scheduling.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { validateCron } from "@/lib/scheduler-client/next-due";

export { ADMIN_SCHEDULING_SURFACE_NAME };

/**
 * The timezones the Cron tester's picker offers. The `<Select>` can only
 * render a value that is in this list, so it is also exactly the vocabulary
 * `cron_timezone` accepts.
 */
export const CRON_TESTER_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

/** Committed tester state, read fresh at apply time (never off a mount closure). */
export interface CronTesterState {
  expression: string;
  tz: string;
  validationError: string | null;
  fires: string[];
  /** The cronstrue reading rendered under the input; null when unavailable. */
  human: string | null;
}

/**
 * Emits what the Cron tester tab actually shows. `cron_validation_error` and
 * `cron_expression_human` are omitted when they are not on screen — the
 * manifest declares each absent in that case, and emitting an empty string
 * would be a read lie.
 */
export function buildCronTesterScope(
  state: CronTesterState,
): SurfaceScopePayload {
  return createAdminSchedulingScope({
    active_tab: "cron_tester",
    cron_expression: state.expression,
    cron_timezone: state.tz,
    ...(state.validationError
      ? { cron_validation_error: state.validationError }
      : {}),
    ...(state.human ? { cron_expression_human: state.human } : {}),
    cron_next_fires: state.fires,
  });
}

/**
 * Shared tail for every throw below. The inline-tool layer PARSES a
 * JSON-looking argument before the handler sees it, so a string target handed
 * raw JSON text arrives as an object — and an agent told only "expected a
 * string" tends to "fix" that by double-encoding, landing escaped quotes and
 * newlines in the field. Naming the encoding explicitly in the error is what
 * stops that loop.
 */
const PLAIN_STRING_RULE =
  "Send a plain text string, not JSON and not JSON-encoded.";

function requirePlainString(target: string, value: unknown): string {
  if (typeof value !== "string") {
    const got =
      value === null
        ? "null"
        : Array.isArray(value)
          ? "an array"
          : typeof value;
    throw new Error(
      `${target} expects a plain text string, not JSON and not JSON-encoded. Received ${got}.`,
    );
  }
  return value.trim();
}

/**
 * Handlers for the surface's two write targets. `getState` is called at apply
 * time so cross-field validation (an expression is only valid *in* a timezone)
 * reads the tester's current values, not the ones from whenever the confirm
 * dialog opened.
 *
 * Both handlers VALIDATE THEN APPLY: a rejected value throws before any setter
 * runs, so a refused write stages nothing. The writeback seam turns the throw
 * into an error envelope the agent reads verbatim.
 */
export function createCronTesterWriteHandlers(args: {
  getState: () => CronTesterState;
  setExpression: (next: string) => void;
  setTz: (next: string) => void;
}): SurfaceWriteHandlers {
  return {
    cron_expression: (value: unknown) => {
      const next = requirePlainString("cron_expression", value);
      if (!next) {
        throw new Error(
          `cron_expression cannot be empty — it expects a 5-field cron expression such as "0 9 * * 1-5" (minute hour day-of-month month day-of-week). ${PLAIN_STRING_RULE}`,
        );
      }
      // ARITY IS CHECKED HERE, AND NOWHERE ELSE IN THIS HANDLER. `validateCron`
      // delegates to cron-parser, which accepts 4 and 6 fields too — it reads a
      // 6th as a leading SECONDS field. So "0 9 * * 1-5 *" parses CLEAN and
      // previews Jan 1 at 00:09 instead of weekdays at 9am, and the agent reads
      // that confident, wrong preview back as confirmation. The description
      // promises 5 fields; this is what enforces it. Every other rule (ranges,
      // steps, names) stays with the real validator below rather than being
      // re-typed here.
      const fieldCount = next.split(/\s+/).filter(Boolean).length;
      if (fieldCount !== 5) {
        throw new Error(
          `cron_expression expects exactly 5 space-separated fields in the order "minute hour day-of-month month day-of-week"; "${next}" has ${fieldCount}. There is no seconds field and no @daily-style macros — weekdays at 9:00 AM is "0 9 * * 1-5". ${PLAIN_STRING_RULE}`,
        );
      }
      // The page's own validator, in the page's own timezone — the value that
      // is accepted here is exactly the value the page can preview.
      const { tz } = args.getState();
      const error = validateCron(next, tz);
      if (error) {
        throw new Error(
          `cron_expression "${next}" is not a valid cron expression for timezone ${tz}: ${error}. Expected 5 space-separated fields in the order "minute hour day-of-month month day-of-week" — no seconds field and no @daily-style macros. ${PLAIN_STRING_RULE}`,
        );
      }
      args.setExpression(next);
    },

    cron_timezone: (value: unknown) => {
      const next = requirePlainString("cron_timezone", value);
      if (!CRON_TESTER_TIMEZONES.includes(next as never)) {
        throw new Error(
          `cron_timezone "${next}" is not offered by this page's timezone picker, so it cannot be displayed. Choose one of: ${CRON_TESTER_TIMEZONES.join(", ")}. Abbreviations like "EST" or names like "Eastern" are not accepted — use the full IANA name. ${PLAIN_STRING_RULE}`,
        );
      }
      args.setTz(next);
    },
  };
}
