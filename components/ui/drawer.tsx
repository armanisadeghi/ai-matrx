"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";
import { treeContainsComponent } from "@/lib/react/treeContainsComponent";
import { RadixDialogModalProvider } from "@/components/ui/radix-dialog-modal-context";

type DrawerProps = React.ComponentProps<typeof DrawerPrimitive.Root> & {
  /** Vaul does not forward false to its underlying Radix root. */
  modal?: true;
};

const Drawer = ({
  children,
  shouldScaleBackground = true,
  ...props
}: DrawerProps) => (
  <RadixDialogModalProvider modal>
    <DrawerPrimitive.Root
      modal
      shouldScaleBackground={shouldScaleBackground}
      {...props}
    >
      {children}
    </DrawerPrimitive.Root>
  </RadixDialogModalProvider>
);
Drawer.displayName = "Drawer";

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = DrawerPrimitive.Portal;

const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/80", className)}
    {...props}
  />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

const DrawerDescription = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

/**
 * Unstyled, non-portalling Content for custom Drawer layouts. It derives
 * explicit modal semantics while Vaul retains focus/background behavior.
 */
const DrawerContentPrimitive = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ ...props }, ref) => (
  <DrawerPrimitive.Content {...props} ref={ref} aria-modal="true" />
));
DrawerContentPrimitive.displayName = "DrawerContentPrimitive";

const DrawerContent = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const hasDescription =
    treeContainsComponent(children, DrawerDescription) ||
    treeContainsComponent(children, DrawerPrimitive.Description);
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerContentPrimitive
        ref={ref}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background pb-safe",
          className,
        )}
        {...(hasDescription ? {} : { "aria-describedby": undefined })}
        {...props}
      >
        <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />
        {children}
      </DrawerContentPrimitive>
    </DrawerPortal>
  );
});
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
    {...props}
  />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mt-auto flex flex-col gap-2 p-4", className)}
    {...props}
  />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className,
    )}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerContentPrimitive,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
