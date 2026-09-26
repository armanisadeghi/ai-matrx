"use client";

import { Label } from "@ai-matrx/design-system";

/**
 * The builder row for an attachment kind (resources, term lists) on an agent
 * that exists only in memory — a `cmp-` variation in Agent Battle. Attachments
 * are association edges keyed by a saved agent's uuid, so there is nothing to
 * list and nowhere to attach; asking the database anyway failed with
 * "targetIds[0] must be a UUID" toasts every time a variation opened
 * (2026-09-26). The row stays visible and says what to do instead.
 */
export function UnsavedAgentAttachmentRow({ label }: { label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="unsaved-agent-attachment-row">
      <Label className="shrink-0 text-xs text-muted-foreground">{label}</Label>
      <span className="min-w-0 truncate text-xs text-muted-foreground">
        Attach after saving — use Save as agent to keep this variation.
      </span>
    </div>
  );
}
