"use client";

// features/rich-document/variants/MobileActionDrawer.tsx
//
// Mobile renderer for the action menu. Replaces the desktop dropdown +
// submenus with a bottom Drawer whose body is an Accordion — top-level
// items are full-width rows, submenus are collapsible accordion sections.
// Same MENU_STRUCTURE / buildMenuTree as the desktop OverflowMenu, second
// renderer (mobile-first ergonomics: big touch targets, single scroll,
// pb-safe footer).

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildMenuTree } from "./shared/menuStructure";
import { runAction, resolveActionDisplay } from "./shared/runAction";
import type {
  RichDocumentAction,
  RichDocumentActionContext,
} from "../types";

export interface MobileActionDrawerProps {
  actions: RichDocumentAction[];
  getCtx: () => RichDocumentActionContext;
  className?: string;
  triggerAriaLabel?: string;
}

export function MobileActionDrawer(
  props: MobileActionDrawerProps,
): React.ReactElement {
  const {
    actions,
    getCtx,
    className,
    triggerAriaLabel = "More actions",
  } = props;

  const [open, setOpen] = React.useState(false);
  const ctxForLabels = getCtx();
  const tree = buildMenuTree(actions);

  if (
    tree.topLevel.length === 0 &&
    tree.submenus.length === 0 &&
    tree.extras.length === 0
  ) {
    return <></>;
  }

  // Full-width touch row. Closes the drawer after firing.
  const renderRow = (action: RichDocumentAction) => {
    const { label, Icon, iconColor, isDisabled, disabledReason } =
      resolveActionDisplay(action, ctxForLabels);
    return (
      <button
        key={action.id}
        type="button"
        disabled={isDisabled}
        title={disabledReason}
        onClick={() => {
          runAction(action, getCtx);
          setOpen(false);
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-base",
          "transition-colors active:bg-accent disabled:opacity-50",
          "min-h-[48px]", // comfortable touch target
        )}
      >
        <Icon className={cn("h-5 w-5 shrink-0", iconColor)} />
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8 p-0", className)}
          aria-label={triggerAriaLabel}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="text-base">Actions</DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[70dvh] overflow-y-auto px-2 pb-safe">
          {/* Promoted top-level items */}
          {tree.topLevel.length > 0 ? (
            <div className="flex flex-col">
              {tree.topLevel.map(renderRow)}
            </div>
          ) : null}

          {/* Submenus as accordion sections */}
          {tree.submenus.length > 0 ? (
            <Accordion type="multiple" className="w-full">
              {tree.submenus.map((submenu) => {
                const TriggerIcon = submenu.icon;
                return (
                  <AccordionItem key={submenu.label} value={submenu.label}>
                    <AccordionTrigger className="px-3 py-3 text-base hover:no-underline">
                      <span className="flex items-center gap-3">
                        {TriggerIcon ? (
                          <TriggerIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                        ) : null}
                        <span>{submenu.label}</span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-1">
                      <div className="flex flex-col pl-4">
                        {submenu.actions.map(renderRow)}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          ) : null}

          {/* Consumer-supplied extras */}
          {tree.extras.length > 0 ? (
            <div className="mt-1 flex flex-col border-t border-border pt-1">
              {tree.extras.map(renderRow)}
            </div>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default MobileActionDrawer;
