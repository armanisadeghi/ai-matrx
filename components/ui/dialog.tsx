"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

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
import { Cross2Icon } from "@radix-ui/react-icons";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { useIsMobile } from "@/hooks/use-mobile";
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

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[10000] bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * Desktop (default): centered modal card.
 * Mobile: the SAME dialog auto-renders as a bottom sheet — full width, anchored to
 * the bottom, height-capped, and internally scrollable so nested actions/buttons are
 * ALWAYS reachable. This is the systematic guard against mobile "lockout" popups: a
 * short viewport can never hide a dialog's confirm/submit control off-screen.
 *
 * Opt out with `mobileSheet={false}` only for the rare surface that must stay centered
 * on mobile (e.g. a tiny centered spinner). Everything else should keep the default.
 */
const DIALOG_DESKTOP_CLASSES =
  "fixed left-[50%] top-[50%] z-[10000] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg";

const DIALOG_MOBILE_SHEET_CLASSES =
  "fixed inset-x-0 bottom-0 left-0 right-0 top-auto z-[10000] flex flex-col w-full max-w-full max-h-[90dvh] translate-x-0 translate-y-0 gap-4 border-t bg-background p-4 pb-safe shadow-lg duration-200 rounded-t-2xl rounded-b-none overflow-y-auto overscroll-contain data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom";

// Re-asserted LAST so the sheet geometry always wins over any caller `className`
// (e.g. a desktop `max-w-2xl` must not un-fullscreen the mobile sheet).
const DIALOG_MOBILE_SHEET_OVERRIDE =
  "inset-x-0 bottom-0 left-0 right-0 top-auto translate-x-0 translate-y-0 w-full max-w-full max-h-[90dvh] rounded-b-none rounded-t-2xl overflow-y-auto";

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** When true (default), the dialog becomes a bottom sheet on mobile. */
    mobileSheet?: boolean;
  }
>(({ className, children, mobileSheet = true, ...props }, ref) => {
  const isMobile = useIsMobile();
  const asSheet = mobileSheet && isMobile;
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
          asSheet ? DIALOG_MOBILE_SHEET_CLASSES : DIALOG_DESKTOP_CLASSES,
          className,
          asSheet && DIALOG_MOBILE_SHEET_OVERRIDE,
        )}
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
          <X className="h-4 w-4" />
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
      "flex flex-col space-y-1.5 text-center sm:text-left",
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
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
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
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

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
