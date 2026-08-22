/**
 * GENERATED — do not edit. Source of truth: content_ir.kind_definition
 * row "opening_hours" (schema version 5), emitted by pydantic in
 * aidream and registered in the live Shape registry.
 *
 * Regenerate:  pnpm shape:types opening_hours
 * Drift check: pnpm check:kind-types
 *
 * This is the COMPLETE-instance type (envelope.root.value at
 * status === "complete"). Mid-stream values are partial — streaming
 * components keep their defensive readers.
 */

export interface DayHours {
  /**
   * Full lowercase day name, e.g. 'monday'.
   */
  day: string;
  /**
   * Opening time, 24h 'HH:MM'.
   */
  opens: string;
  /**
   * Closing time, 24h 'HH:MM'.
   */
  closes: string;
}

export interface OpeningHours {
  /**
   * Full weekly schedule when known.
   */
  days?: DayHours[];
  /**
   * Today's hours when the source reports them.
   */
  today?: DayHours | null;
  __kind?: "opening_hours";
}
