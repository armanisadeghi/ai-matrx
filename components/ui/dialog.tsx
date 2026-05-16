"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { cn } from "@/lib/utils";
import { Cross2Icon } from "@radix-ui/react-icons";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { treeContainsComponent } from "@/lib/react/treeContainsComponent";
import { usePopoutContainer } from "@/features/window-panels/popout/usePopoutContainer";

/**
 * Context that provides the Dialog content DOM element so that nested portaled
 * components (Popover, DropdownMenu, etc.) can portal into the Dialog rather
 * than document.body, keeping them inside the react-remove-scroll shard and
 * allowing scroll events to work properly.
 */
const DialogContainerContext = React.createContext<HTMLElement | null>(null);
export const useDialogContainer = () =>
  React.useContext(DialogContainerContext);

/**
 * Hydration-safe Dialog wrapper.
 * Radix UI generates dynamic IDs for aria-controls that can differ between
 * SSR and client, causing hydration mismatches. This wrapper defers rendering
 * until after hydration to prevent these errors.
 */
const Dialog = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>
>(({ children, ...props }, ref) => {
  const isMounted = useIsMounted();

  if (!isMounted) {
    return null;
  }

  return <DialogPrimitive.Root {...props}>{children}</DialogPrimitive.Root>;
});
Dialog.displayName = "Dialog";

const DialogTrigger = DialogPrimitive.Trigger;

/**
 * Popout-aware DialogPortal. When this dialog renders inside a popped-out
 * window-panel, the Radix portal target is retargeted to the popout's
 * `<body>`. Outside a popout, falls through to the default (`document.body`).
 *
 * An explicit `container` prop always wins.
 */
const DialogPortal = ({
  container,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Portal>) => {
  const popoutContainer = usePopoutContainer();
  const resolvedContainer =
    container !== undefined ? container : popoutContainer;
  return <DialogPrimitive.Portal container={resolvedContainer} {...props} />;
};

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[9999] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    style={{
      backdropFilter: "blur(1px)",
    }}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [containerEl, setContainerEl] = React.useState<HTMLElement | null>(
    null,
  );

  const mergedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      setContainerEl(node);
      if (typeof ref === "function") ref(node);
      else if (ref)
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [ref],
  );

  const hasTitle =
    treeContainsComponent(children, DialogTitle) ||
    treeContainsComponent(children, DialogPrimitive.Title);
  const hasDescription =
    treeContainsComponent(children, DialogDescription) ||
    treeContainsComponent(children, DialogPrimitive.Description);

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={mergedRef}
        className={cn(
          "fixed left-[50%] top-[50%] z-[9999] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 overflow-hidden p-4 duration-200 sm:rounded-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          className,
        )}
        style={{
          backdropFilter: "blur(8px) saturate(1.8) brightness(1.1)",
          border: "2.5px solid rgba(180, 205, 255, 0.40)",
        }}
        {...(hasDescription ? {} : { "aria-describedby": undefined })}
        {...props}
      >
        {!hasTitle && (
          <VisuallyHidden.Root>
            <DialogPrimitive.Title>Dialog</DialogPrimitive.Title>
          </VisuallyHidden.Root>
        )}
        <DialogContainerContext.Provider value={containerEl}>
          {children}
        </DialogContainerContext.Provider>
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <Cross2Icon className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex shrink-0 flex-col space-y-1.5 text-center sm:text-left",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex shrink-0 flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
