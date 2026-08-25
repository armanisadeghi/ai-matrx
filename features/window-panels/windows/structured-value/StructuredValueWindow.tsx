"use client";

/**
 * StructuredValueWindow — the platform's floating window for ONE structured
 * value (an object, an array, a nested payload), wherever a surface has a
 * structure too big to read in place.
 *
 * 🚨 IT WRAPS THE CANONICAL RENDERER, IT IS NOT ONE.
 * `features/window-panels/FEATURE.md` § A PANEL WRAPS THE CANONICAL COMPONENT:
 * a panel finds the component that already answers the question and puts THAT
 * inside the frame. For "any JSON value, rendered as a human document" that
 * component is `components/official/structured-value/StructuredValueView` —
 * THE FLOOR of the platform's structured rendering, the same renderer the
 * Shape System falls through to on every other surface. This file supplies a
 * frame and a title. It renders no fields, no keys, and no JSON of its own; a
 * bespoke body here would be a second renderer that drifts from the floor.
 *
 * WHY IT EXISTS (Arman, 2026-08-25, on the `data_table` demo): structure
 * inside a table cell had exactly one treatment — `JSON.stringify` in a `<pre>`
 * inside an already-padded cell. That is a developer artefact in a box in a
 * box, and it is unreadable in the ~200px a column gets. The cell now expands
 * in place for a glance, and hands the whole structure to this window when the
 * reader wants to actually read it — beside their table, not on top of it.
 *
 * MULTI-INSTANCE by design: comparing two rows' payloads side by side is the
 * normal reason to open one at all, so a second cell opens a second window
 * rather than replacing the first.
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";

export interface StructuredValueWindowProps {
  windowInstanceId: string;
  onClose: () => void;
  /** Any JSON value. Carried through Redux, so always serializable. */
  value: unknown;
  /** What this structure IS, in the reader's words (usually a column name). */
  title?: string | null;
  /** Where it came from — the row and table a cell belongs to. */
  subtitle?: string | null;
}

export default function StructuredValueWindow({
  windowInstanceId,
  onClose,
  value,
  title,
  subtitle,
}: StructuredValueWindowProps) {
  return (
    <WindowPanel
      id={`structured-value-window-${windowInstanceId}`}
      overlayId="structuredValueWindow"
      title={title?.trim() ? title : "Details"}
      onClose={onClose}
      width={640}
      height={560}
      minWidth={340}
      minHeight={240}
    >
      {/* ONE box: the frame is the chrome. The view brings its own spacing. */}
      <div className="h-full min-h-0 overflow-y-auto px-3 py-2">
        {subtitle ? (
          <p className="mb-2 text-[11px] text-muted-foreground">{subtitle}</p>
        ) : null}
        <StructuredValueView value={value} density="full" footer={false} />
      </div>
    </WindowPanel>
  );
}
