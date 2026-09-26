"use client";

// "Use my own" — pick any agent or workflow the viewer can open (the pickers'
// own tabs: mine · shared · all · system) and answer the job with it. The one
// holder chooser (`HolderAssignment`) is reused whole; nothing here re-builds
// a picker.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { HolderAssignment } from "@/features/bindings/HolderAssignment";
import type { HolderDraft } from "@/features/bindings/ScopeHolderBar";
import type { FeatureIntelligenceRow } from "./types";

const EMPTY_DRAFT: HolderDraft = {
  kind: "agent",
  agentId: null,
  agentVersionId: null,
  useLatest: true,
  workflowId: null,
  workflowVersionId: null,
};

export function UseOwnDialog({
  row,
  whoFor,
  busy,
  onClose,
  onSave,
}: {
  row: FeatureIntelligenceRow;
  /** "you" or the organization's name. */
  whoFor: string;
  busy: boolean;
  onClose: () => void;
  onSave: (draft: HolderDraft) => Promise<boolean>;
}) {
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState<HolderDraft>(EMPTY_DRAFT);
  const chosen =
    draft.kind === "workflow" ? Boolean(draft.workflowId) : Boolean(draft.agentId);

  const body = (
    <div className="space-y-4">
      <HolderAssignment
        holder={draft}
        onHolderChange={setDraft}
        mandateKey={row.mandateKey}
        outputKind={row.outputKind}
        agentTabs={{ visibleTabs: ["mine", "shared", "all", "system"], initialTab: "mine" }}
        disabled={busy}
      />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!chosen || busy}
          onClick={async () => {
            if (await onSave(draft)) onClose();
          }}
        >
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Use this for {whoFor}
        </Button>
      </div>
    </div>
  );

  const title = `Use your own for “${row.shortName}”`;
  const description = "Any agent or workflow you can open. Duplicates keep the original's inputs; your own receives them by name.";

  if (isMobile) {
    return (
      <Drawer open onOpenChange={(open) => (open ? undefined : onClose())}>
        <DrawerContent className="px-4 pb-safe">
          <DrawerHeader className="px-0">
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          {body}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
