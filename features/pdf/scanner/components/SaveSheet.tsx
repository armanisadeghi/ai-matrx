"use client";

/**
 * SaveSheet — name the scan and kick off the save.
 *
 * Deliberately tiny: collects the label and fires `onSave`; the surface
 * immediately swaps to the full-screen ProcessingView, which owns every
 * live update (build → OCR → AI clean → entities) and the optional
 * context assignment.
 */

import React from "react";
import { FileDown } from "lucide-react";

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
  onSave: () => void;
}

export function SaveSheet({
  open,
  onOpenChange,
  label,
  onLabelChange,
  itemCount,
  onSave,
}: SaveSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
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
            // 16px floor prevents the iOS focus zoom.
            className="h-11 text-base"
            autoFocus
          />
        </div>

        <DrawerFooter className="pb-safe pt-3">
          <Button
            className="h-11 w-full"
            disabled={label.trim().length === 0}
            onClick={onSave}
          >
            <FileDown className="mr-1.5 h-4 w-4" />
            Create PDF & extract
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
