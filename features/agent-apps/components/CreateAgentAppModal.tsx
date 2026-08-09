"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { CreateAgentAppForm } from "./CreateAgentAppForm";
import type { CreateAgentAppInput } from "../types";

interface CreateAgentAppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateAgentAppInput) => Promise<void> | void;
  busy?: boolean;
}

export function CreateAgentAppModal({
  open,
  onOpenChange,
  onSubmit,
  busy,
}: CreateAgentAppModalProps) {
  const isMobile = useIsMobile();

  const handleSubmit = async (input: CreateAgentAppInput) => {
    await onSubmit(input);
    onOpenChange(false);
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader>
            <DrawerTitle>Create Agent App</DrawerTitle>
            <DrawerDescription>
              Publish a public app backed by one of your agents.
            </DrawerDescription>
          </DrawerHeader>
          <div className="p-4 pb-safe overflow-auto">
            <CreateAgentAppForm
              onSubmit={handleSubmit}
              onCancel={() => onOpenChange(false)}
              busy={busy}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create Agent App</DialogTitle>
          <DialogDescription>
            Publish a public app backed by one of your agents.
          </DialogDescription>
        </DialogHeader>
        <CreateAgentAppForm
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          busy={busy}
        />
      </DialogContent>
    </Dialog>
  );
}
