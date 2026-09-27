"use client";

// OrganizationPickerPopover — THE ONE way the organization picker opens from a
// button: a popover anchored to the trigger on desktop, a bottom sheet on a
// phone. The body is always the canonical `OrganizationPickerPanel` (search
// above eight rows, your own organizations first, test organizations behind
// one disclosure).
//
// 🚨 WHY IT EXISTS (page-pass shared defects, 2026-09-27). The "no organization
// selected" notice drew the WHOLE picker inline. On an account with a hundred
// memberships that is a ~600px block, and it pushed `/education/progress`'s
// real numbers below the fold; the page had to fold it behind its own button,
// and the header, the notice and the marketing run console each opened the
// picker their own way. A notice is one line plus a button; the list opens on
// demand, the same way everywhere.
//
// It stays open after a selection on purpose: "Keep it at the top" only
// enables once an organization is active. Outside-click / Esc / swipe closes.

import { useState, type ReactElement } from "react";
import { Building2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { OrganizationPickerPanel } from "@/features/organizations/components/OrganizationPickerPanel";

export interface OrganizationPickerPopoverProps {
  /** The control that opens the picker. Must be a single element that accepts `onClick`. */
  trigger: ReactElement;
  /** Controlled open state; omit to let the component own it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
}

export function OrganizationPickerPopover({
  trigger,
  open: controlledOpen,
  onOpenChange,
  align = "start",
}: OrganizationPickerPopoverProps) {
  const isMobile = useIsMobile();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };

  if (isMobile) {
    return (
      <>
        <span className="contents" onClick={() => setOpen(true)}>
          {trigger}
        </span>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="bg-textured pb-safe max-h-[85dvh]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>Choose an organization</DrawerTitle>
            </DrawerHeader>
            <div className="matrx-touch-targets overflow-y-auto px-2 pb-4">
              <OrganizationPickerPanel />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      {/* Fixed width: the picker searches as you type, and a content-sized
          box would reflow on every keystroke. */}
      <PopoverContent sizing="fixed" align={align} sideOffset={8} className="w-80 p-1">
        <OrganizationPickerPanel />
      </PopoverContent>
    </Popover>
  );
}

/** The standard button form: "Choose organization" opening the picker. */
export function OrganizationPickerButton({
  label = "Choose organization",
  align = "start",
  className,
}: {
  label?: string;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <OrganizationPickerPopover
      align={align}
      trigger={
        <Button
          size="sm"
          variant="outline"
          className={className}
          data-testid="organization-picker-button"
        >
          <Building2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </Button>
      }
    />
  );
}
