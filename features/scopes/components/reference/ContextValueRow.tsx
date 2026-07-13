"use client";

/**
 * features/scopes/components/reference/ContextValueRow.tsx
 *
 * THE one read-only "label + current value" list row for a context item
 * cell. Used by every surface that lists a scope's values top-to-bottom
 * (`ScopeDetailView`, `ActiveContextLayersPanel`, `ContextLayerBodies`'
 * `ScopeLayerBody`) — those surfaces differ in container chrome (padding,
 * whether a version badge shows), never in how a cell renders. Extend THIS
 * component for a new value-type render, never re-copy the row markup.
 */

import { cn } from "@/utils/cn";
import { ContextValueDisplay } from "@/features/scopes/components/reference/ContextValueDisplay";
import type { ContextItemValue } from "@/features/scopes/types";
import type { ContextValueType } from "@/features/agent-context/types";

export interface ContextValueRowProps {
  value: ContextItemValue;
  label?: string;
  /**
   * The item's declared type — lets the display render email/url/phone/color/
   * markdown/datetime/etc. richly (they can't be told apart from the cell alone).
   */
  valueType?: ContextValueType | null;
  /** Show the cell's version number at the row's trailing edge. */
  showVersion?: boolean;
  className?: string;
}

export function ContextValueRow({
  value,
  label,
  valueType,
  showVersion = false,
  className,
}: ContextValueRowProps) {
  return (
    <li
      className={cn(
        "flex items-start gap-3 px-3 py-2 text-xs",
        className,
      )}
    >
      <div className="w-1/3 shrink-0 truncate text-muted-foreground">
        {label ?? value.context_item_id.slice(0, 8)}
      </div>
      <div className="flex-1 break-words text-foreground">
        <ContextValueDisplay value={value} valueType={valueType} />
      </div>
      {showVersion && (
        <div className="text-muted-foreground/60 shrink-0">
          v{value.version}
        </div>
      )}
    </li>
  );
}

export default ContextValueRow;
