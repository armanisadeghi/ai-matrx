"use client";

// Thin dialog/drawer wrapper around the ONE shared settings form
// (`settings/TopicSettingsForm`). The previously duplicated inline form was
// consolidated during the research-project decoupling (2026-07-21) — do not
// reintroduce form fields here.

import {
  Dialog,
  DialogContent,
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
import { TopicSettingsForm } from "../settings/TopicSettingsForm";
import type { ResearchTopic } from "../../types";

interface TopicSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topic: ResearchTopic;
  onSaved: () => void;
}

export function TopicSettingsPanel({
  open,
  onOpenChange,
  topic,
  onSaved,
}: TopicSettingsPanelProps) {
  const isMobile = useIsMobile();

  const content = (
    <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4">
      <TopicSettingsForm
        topic={topic}
        onSaved={() => {
          onSaved();
          onOpenChange(false);
        }}
        onCancel={() => onOpenChange(false)}
      />
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="flex h-[90dvh] flex-col">
          <DrawerHeader className="shrink-0 border-b border-border/60 px-5 pb-3 pt-2 text-left">
            <DrawerTitle className="text-base font-semibold">
              Topic Settings
            </DrawerTitle>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-3">
          <DialogTitle className="text-base font-semibold">
            Topic Settings
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
