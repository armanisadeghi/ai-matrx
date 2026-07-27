"use client";

/**
 * CaptureAttachments — the per-image attachment row under a page capture.
 * Tasks ride the canonical TaskChipRow (entityType web_screenshot); notes and
 * files attach through the universal picker over the same container-links
 * hook the scopes/war-room surfaces use. Zero bespoke persistence — every
 * write is a platform.associations edge.
 */

import { useState } from "react";
import { Paperclip } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import TaskChipRow from "@/features/tasks/widgets/TaskChipRow";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import {
  UniversalAssociationPicker,
  attachedKey,
} from "@/features/scopes/components/associations/UniversalAssociationPicker";
import { cn } from "@/lib/utils";

const ATTACH_TOKENS = ["note", "file"] as const;

export function CaptureAttachments({
  screenshotId,
  orgId,
  className,
}: {
  screenshotId: string;
  orgId?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const links = useContainerLinks({
    containerType: "web_screenshot",
    containerId: screenshotId,
    orgId,
  });
  const attachedKeys = new Set<string>();
  for (const token of ATTACH_TOKENS) {
    for (const id of links.attachedIdsFor(token)) {
      attachedKeys.add(attachedKey(token, id));
    }
  }
  const attachedCount = ATTACH_TOKENS.reduce(
    (sum, token) => sum + links.countFor(token),
    0,
  );

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <div className="min-w-0 flex-1">
        <TaskChipRow
          entityType="web_screenshot"
          entityId={screenshotId}
          size="xs"
          showAddButton
        />
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Attach notes or files to this capture"
            title="Attach notes or files to this capture"
            className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-border px-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Paperclip className="h-3 w-3" />
            {attachedCount > 0 ? attachedCount : null}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-2">
          <UniversalAssociationPicker
            tokens={[...ATTACH_TOKENS]}
            attachedKeys={attachedKeys}
            onAttach={async (token, resourceId, title) => {
              const result = await links.attach(token, resourceId, title);
              return { ok: result.ok };
            }}
            onDetach={async (token, resourceId) => {
              const result = await links.detach(token, resourceId);
              return { ok: result.ok };
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
