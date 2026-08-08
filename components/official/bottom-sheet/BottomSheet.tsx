"use client";

import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerPortal,
  DrawerContentPrimitive,
  DrawerOverlay,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** Merged onto the sheet panel — e.g. `bg-card` to override the default glass. */
  contentClassName?: string;
  children: React.ReactNode;
}

function BottomSheet({
  open,
  onOpenChange,
  title = "Bottom Sheet",
  contentClassName,
  children,
}: BottomSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerPortal>
        <DrawerOverlay
          className="fixed inset-0 z-50"
          style={{ background: "rgba(0, 0, 0, 0.08)" }}
        />
        <DrawerContentPrimitive
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mt-24 flex flex-col rounded-t-2xl overflow-hidden min-h-[60dvh] max-h-[90dvh]",
            contentClassName,
          )}
          style={{
            background: "var(--matrx-glass-bg)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid var(--matrx-glass-border-color)",
            borderBottom: "none",
          }}
        >
          <VisuallyHidden>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>Bottom sheet panel.</DrawerDescription>
          </VisuallyHidden>
          <div className="mx-auto mt-3 mb-1 h-1.5 w-10 rounded-full bg-muted-foreground/30 flex-shrink-0" />
          {children}
        </DrawerContentPrimitive>
      </DrawerPortal>
    </Drawer>
  );
}

interface BottomSheetHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  trailing?: React.ReactNode;
}

function BottomSheetHeader({
  title,
  showBack = false,
  onBack,
  trailing,
}: BottomSheetHeaderProps) {
  return (
    <div className="flex items-center px-2 pt-1 pb-2 flex-shrink-0 min-h-[44px]">
      <div className="min-w-[44px] flex items-center justify-start">
        <button
          onClick={onBack}
          className={cn(
            "h-8 w-8 rounded-full matrx-glass-thin-border flex items-center justify-center transition-all active:scale-95",
            showBack ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          aria-hidden={!showBack}
          tabIndex={showBack ? 0 : -1}
        >
          <ChevronLeft className="h-4 w-4 text-foreground" />
        </button>
      </div>
      <span className="text-[17px] font-semibold flex-1 text-center truncate">
        {title}
      </span>
      <div className="min-w-[44px] flex items-center justify-end">
        {trailing}
      </div>
    </div>
  );
}

interface BottomSheetBodyProps {
  children: React.ReactNode;
  className?: string;
}

function BottomSheetBody({ children, className }: BottomSheetBodyProps) {
  return (
    <div
      className={cn(
        "flex-1 overflow-y-auto overscroll-contain pb-safe",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface BottomSheetFooterProps {
  children: React.ReactNode;
  className?: string;
}

function BottomSheetFooter({ children, className }: BottomSheetFooterProps) {
  return (
    <div
      className={cn(
        "flex-shrink-0 px-4 py-3 pb-safe border-t border-white/[0.06]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export { BottomSheet, BottomSheetHeader, BottomSheetBody, BottomSheetFooter };
export type {
  BottomSheetProps,
  BottomSheetHeaderProps,
  BottomSheetBodyProps,
  BottomSheetFooterProps,
};
