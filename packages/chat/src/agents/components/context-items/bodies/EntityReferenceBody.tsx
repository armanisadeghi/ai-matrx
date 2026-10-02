"use client";

import { useEffect } from "react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import type { ContextItemBodyProps } from "../types";

/** Canonical Open + new-tab + peek treatment for attached platform records. */
export function EntityReferenceBody({ item, setTitle }: ContextItemBodyProps) {
  const references = item.refs.entityRefs ?? [];
  const first = references[0];

  useEffect(() => {
    if (first?.name) setTitle?.(first.name);
  }, [first?.name, setTitle]);

  if (references.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs italic text-muted-foreground">
        This attachment contains no valid {item.typeLabel.toLowerCase()} reference.
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto p-4">
      <div className="space-y-2">
        {references.map((reference) => (
          <div
            key={`${reference.token}:${reference.id}`}
            className="py-1"
          >
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {item.typeLabel}
            </div>
            <EntityRef
              token={reference.token}
              id={reference.id}
              name={reference.name}
              openInNewTab
              alwaysShowActions
              fill
              wrap
              className="w-full text-sm font-medium"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
