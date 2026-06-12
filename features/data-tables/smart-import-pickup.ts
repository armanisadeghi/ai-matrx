/**
 * smart-import-pickup — module-level handoff slot for the cross-route
 * Smart Import flow.
 *
 * `File` objects are not serializable through localStorage, sessionStorage,
 * URL params, or Redux. The Smart Import flow on `/workbooks` may need to
 * route the user to `/data` with a pre-loaded file (when the detector says
 * "typed dataset"). The /data page reads this slot once and clears it.
 *
 * Module-level state is fine here because:
 *   - It lives on the client (no SSR concerns — no read from a server file).
 *   - It is single-shot: the consumer reads + clears immediately.
 *   - It is scoped to a single browser tab's runtime, which is exactly the
 *     handoff lifetime we need.
 *
 * If the user closes the tab between handoff and pickup, the slot is gone
 * along with the page — the right behavior (a new tab won't get a stale file).
 */

type Slot = {
  file: File | null;
  takenAt: number;
};

export const smartImportPickupSlot: Slot = {
  file: null,
  takenAt: 0,
};

/** Consume the pickup slot. Returns the file once, then clears the slot. */
export function consumeSmartImportFile(): File | null {
  const f = smartImportPickupSlot.file;
  smartImportPickupSlot.file = null;
  smartImportPickupSlot.takenAt = 0;
  return f;
}
