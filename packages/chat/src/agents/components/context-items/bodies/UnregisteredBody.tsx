"use client";

/** The generic default for a context-item body the host did not register: the generic body, labelled. */

import type { ContextItemBodyProps } from "../types";
import { GenericBody } from "./GenericBody";

export function UnregisteredBody({ name, what, props }: { name: string; what: string; props: ContextItemBodyProps }) {
  return (
    <div className="flex h-full min-h-0 flex-col" data-chat-slot-fallback={name}>
      <div className="px-4 pt-3 text-[11px] text-muted-foreground">{what} is not set up here</div>
      <div className="min-h-0 flex-1">
        <GenericBody {...props} />
      </div>
    </div>
  );
}
