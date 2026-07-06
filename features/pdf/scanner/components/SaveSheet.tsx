"use client";

/**
 * SaveSheet — name the scan and kick off the one-round-trip save.
 *
 * Deliberately dumb: collects the label and fires `onSave`; the surface
 * owns the stream, the context-assignment prompt (UploadContextPrompt
 * runs in parallel with the build, exactly as it does for regular
 * uploads), and navigation.
 */

import React from "react";
import { FileDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";

interface SaveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  onLabelChange: (label: string) => void;
  itemCount: number;
  saving: boolean;
  progressMessage: string | null;
  onSave: () => void;
}

export function SaveSheet({
  open,
  onOpenChange,
  label,
  onLabelChange,
  itemCount,
  saving,
  progressMessage,
  onSave,
}: SaveSheetProps) {
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      dismissible={!saving}
    >
      <DrawerContent>
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-sm">Save scan</DrawerTitle>
          <DrawerDescription className="text-xs">
            {itemCount} item{itemCount === 1 ? "" : "s"} will become one PDF
            and run through text extraction automatically.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4">
          <Input
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="Scan name"
            disabled={saving}
            // 16px floor prevents the iOS focus zoom.
            className="h-11 text-base"
            autoFocus={!saving}
          />
          {saving && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{progressMessage ?? "Building your PDF…"}</span>
            </div>
          )}
        </div>

        <DrawerFooter className="pb-safe pt-3">
          <Button
            className="h-11 w-full"
            disabled={saving || label.trim().length === 0}
            onClick={onSave}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-1.5 h-4 w-4" />
            )}
            {saving ? "Saving…" : "Create PDF & extract"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
