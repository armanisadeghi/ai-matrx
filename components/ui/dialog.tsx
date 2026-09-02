"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * THE ROOT RENDERS UNCONDITIONALLY — no mount gate. This wrapper used to defer
 * rendering until after hydration ("Radix generates dynamic aria-controls ids
 * that differ between SSR and client"), and that justification was false:
 * Radix ids come from React's SSR-stable `useId` (verified against
 * @radix-ui/react-dialog 1.1.17 / react-id 1.1.2). The gate was actively
 * harmful — the Trigger wraps ALWAYS-VISIBLE content, so `return null`
 * deleted it from SSR and the first client paint. See
 * components/ui/context-menu/context-menu.tsx (the precedent fix, D144).
 * The RadixDialogModalProvider wrapper stays — it is unrelated to hydration.
 */
const Dialog = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>
>(({ children, ...props }, ref) => {
  const modal = props.modal ?? true;

  return (
    <RadixDialogModalProvider modal={modal}>
      <DialogPrimitive.Root {...props} modal={modal}>
        {children}
      </DialogPrimitive.Root>
    </RadixDialogModalProvider>
  );
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
import { useIsMobile } from "@/hooks/use-mobile";
import { treeContainsComponent } from "@ai-matrx/kit/react-tree";
import { usePopoutContainer } from "@/features/window-panels/popout/usePopoutContainer";
import { PortalContainerProvider } from "@ai-matrx/design-system";
import {
  RadixDialogModalProvider,
  useRadixDialogModal,
} from "@/components/ui/radix-dialog-modal-context";

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
    data-slot="dialog-overlay"
    className={cn(
      // Preserve readable page context behind the modal; separation comes from a light scrim, not blur.
      "fixed inset-0 z-[10000] bg-black/20 dark:bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * Unstyled, non-portalling Content for custom Dialog layouts. It preserves
 * Radix focus/background behavior and derives `aria-modal` from Dialog Root.
 */
const DialogContentPrimitive = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ ...props }, ref) => {
  const isModal = useRadixDialogModal();
  return (
    <DialogPrimitive.Content
      {...props}
      ref={ref}
      aria-modal={isModal || undefined}
    />
  );
});
DialogContentPrimitive.displayName = "DialogContentPrimitive";

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
/**
 * 🚨 THE DESKTOP DIALOG IS CLAMPED TO THE VIEWPORT AND SCROLLS INSIDE ITSELF
 * (V1 round 4, R4-1). The mobile sheet below has carried this law since it was
 * written — "a short viewport can never hide a dialog's confirm/submit control
 * off-screen" — and the DESKTOP path never got it. Proven live: the admin
 * Create Category dialog rendered 851px tall in a 657px viewport with
 * `overflow-y: visible`, so its Create button sat below the fold, unreachable;
 * the only way out was a backdrop click, which dismisses WITHOUT writing and is
 * indistinguishable from a silent save failure.
 *
 * `max-h-[85dvh] overflow-y-auto` is the cap; `DialogFooter` is sticky, so the
 * primary action stays pressable while the body scrolls. `--dialog-pad` carries
 * this shell's padding to that footer so it can bleed to the card's edges
 * instead of leaving scrolled content showing beneath it.
 *
 * A caller's own `className` still wins (tailwind-merge, applied after) — a
 * dialog that manages its own scrolling is unaffected.
 */
const DIALOG_DESKTOP_CLASSES =
  "fixed left-[50%] top-[50%] z-[10000] grid min-w-0 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 max-h-[85dvh] overflow-y-auto overscroll-contain [--dialog-pad:1.5rem] overflow-x-clip border bg-background p-6 shadow-lg [overflow-wrap:anywhere] [&>*]:min-w-0 [&>*]:max-w-full duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg";

const DIALOG_MOBILE_SHEET_CLASSES =
  "matrx-mobile-sheet fixed inset-x-0 bottom-0 left-0 right-0 top-auto z-[10000] flex min-w-0 flex-col w-full max-w-full max-h-[90dvh] translate-x-0 translate-y-0 gap-4 [--dialog-pad:1rem] overflow-x-clip border-t bg-background p-4 pb-safe shadow-lg [overflow-wrap:anywhere] [&>*]:min-w-0 [&>*]:max-w-full duration-200 rounded-t-2xl rounded-b-none overflow-y-auto overscroll-contain data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom";

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
  const isModal = useRadixDialogModal();
  // Falls through to the popout body while `containerEl` is unset (pre-mount)
  // — identical to useNestedPortalContainer's dialog > popout > body order.
  const popoutBridgeContainer = usePopoutContainer();
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
      {isModal ? <DialogOverlay /> : null}
      <DialogContentPrimitive
        ref={mergedRef}
        className={cn(
          asSheet ? DIALOG_MOBILE_SHEET_CLASSES : DIALOG_DESKTOP_CLASSES,
          className,
          asSheet && DIALOG_MOBILE_SHEET_OVERRIDE,
          // A non-modal Dialog is the shared coexistence contract for content
          // that can launch or remain open beside a WindowPanel. WindowPanel's
          // manager starts at z=1000; keeping this surface below that boundary
          // makes the newly focused window usable without coupling either
          // system or permanently raising every window above true modals.
          !isModal && "z-[900]",
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
          {/*
           * Host wiring for the @ai-matrx/design-system portal seam: package
           * primitives (Popover) read PortalContainerProvider instead of the
           * host's useNestedPortalContainer. Feed it the SAME resolution the
           * host hook computes here — dialog content first (keeps nested
           * popovers inside the react-remove-scroll shard), then the popout
           * body, then document.body. An explicit `container` prop on the
           * package component still wins (package seam contract).
           */}
          <PortalContainerProvider
            container={containerEl ?? popoutBridgeContainer ?? null}
          >
            {children}
          </PortalContainerProvider>
        </DialogContainerContext.Provider>
        <DialogPrimitive.Close
          data-slot="dialog-close"
          aria-label="Close"
          className="absolute right-2 top-4 flex h-11 w-11 items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground sm:right-4 lg:h-10 lg:w-10"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogContentPrimitive>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn(
      // DialogContent owns an absolute close control. Reserve its hit area in
      // every header so trailing actions never render underneath it.
      "flex flex-col space-y-1.5 pr-12 text-center sm:text-left",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

/**
 * 🚨 THE PRIMARY ACTION IS ALWAYS PRESSABLE (V1 round 4, R4-1). The footer
 * sticks to the bottom of the (now clamped, now scrolling) dialog card, and
 * bleeds to its edges using the shell's `--dialog-pad`, so scrolled content
 * never shows through beneath it. Outside a DialogContent the variable is
 * unset, the padding falls back to `0px`, and this is the plain row it always
 * was.
 */
const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-footer"
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      "sticky bottom-0 z-10 bg-background pt-3",
      "mx-[calc(var(--dialog-pad,0px)*-1)] mb-[calc(var(--dialog-pad,0px)*-1)] px-[var(--dialog-pad,0px)] pb-[var(--dialog-pad,0px)]",
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
  DialogContentPrimitive,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
