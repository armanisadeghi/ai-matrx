import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { BottomSheet } from "@/components/official/bottom-sheet/BottomSheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

jest.mock("@/features/window-panels/popout/usePopoutContainer", () => ({
  usePopoutContainer: () => undefined,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("Radix dialog accessibility semantics", () => {
  let root: Root;
  let reactHost: HTMLDivElement;
  let background: HTMLElement;

  beforeEach(() => {
    background = document.createElement("main");
    background.textContent = "Background application";
    reactHost = document.createElement("div");
    document.body.append(background, reactHost);
    root = createRoot(reactHost);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
    jest.restoreAllMocks();
  });

  it("marks a modal dialog and hides its background from assistive technology", () => {
    act(() => {
      root.render(
        <Dialog defaultOpen>
          <DialogTrigger>Open profile</DialogTrigger>
          <DialogContent>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>Update profile details.</DialogDescription>
            <button type="button">Save</button>
          </DialogContent>
        </Dialog>,
      );
    });

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(background.getAttribute("aria-hidden")).toBe("true");
    expect(dialog?.closest('[aria-hidden="true"]')).toBeNull();
    expect(
      document.querySelector('[data-slot="dialog-overlay"]'),
    ).not.toBeNull();
  });

  it("keeps canonical dialog header actions clear of the close target", () => {
    act(() => {
      root.render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit row</DialogTitle>
              <button type="button">Row actions</button>
            </DialogHeader>
          </DialogContent>
        </Dialog>,
      );
    });

    const header = document.querySelector('[data-slot="dialog-header"]');
    const close = document.querySelector('[data-slot="dialog-close"]');

    expect(header?.classList.contains("pr-12")).toBe(true);
    expect(close?.classList.contains("h-10")).toBe(true);
    expect(close?.classList.contains("w-10")).toBe(true);
  });

  it("contains long dialog content instead of letting intrinsic width escape", () => {
    act(() => {
      root.render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Matcher preview</DialogTitle>
            <div data-testid="long-content">
              a-continuous-machine-generated-value-that-must-stay-inside-the-dialog
            </div>
          </DialogContent>
        </Dialog>,
      );
    });

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const content = document.querySelector<HTMLElement>(
      '[data-testid="long-content"]',
    );

    expect(dialog?.classList.contains("min-w-0")).toBe(true);
    expect(dialog?.classList.contains("overflow-x-clip")).toBe(true);
    expect(dialog?.className).toContain("[overflow-wrap:anywhere]");
    expect(dialog?.className).toContain("[&>*]:min-w-0");
    expect(dialog?.className).toContain("[&>*]:max-w-full");
    expect(content?.parentElement).toBe(dialog);
  });

  it("does not claim modality or hide the background for a non-modal dialog", () => {
    act(() => {
      root.render(
        <Dialog defaultOpen modal={false}>
          <DialogContent>
            <DialogTitle>Inspector</DialogTitle>
            <DialogDescription>Non-blocking details.</DialogDescription>
          </DialogContent>
        </Dialog>,
      );
    });

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.hasAttribute("aria-modal")).toBe(false);
    expect(background.hasAttribute("aria-hidden")).toBe(false);
    expect(dialog?.classList.contains("z-[900]")).toBe(true);
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
  });

  it("keeps Sheet semantics aligned with its Root modality", () => {
    act(() => {
      root.render(
        <Sheet defaultOpen modal={false}>
          <SheetContent>
            <SheetTitle>Canvas</SheetTitle>
            <SheetDescription>Non-blocking canvas.</SheetDescription>
          </SheetContent>
        </Sheet>,
      );
    });

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.hasAttribute("aria-modal")).toBe(false);
    expect(background.hasAttribute("aria-hidden")).toBe(false);
  });

  it("marks alert dialogs as modal while preserving alertdialog semantics", () => {
    act(() => {
      root.render(
        <AlertDialog defaultOpen>
          <AlertDialogContent>
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogContent>
        </AlertDialog>,
      );
    });

    const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(background.getAttribute("aria-hidden")).toBe("true");
    expect(dialog?.closest('[aria-hidden="true"]')).toBeNull();
  });

  it("keeps confirmation actions touch-sized below the desktop breakpoint", () => {
    act(() => {
      root.render(
        <ConfirmDialog
          open
          onOpenChange={jest.fn()}
          title="Generate this video?"
          description="This action may consume provider credits."
          confirmLabel="Generate video"
          onConfirm={jest.fn()}
        />,
      );
    });

    const cancel = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Cancel",
    );
    const confirm = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Generate video",
    );

    expect(cancel?.classList.contains("max-lg:min-h-11")).toBe(true);
    expect(confirm?.classList.contains("max-lg:min-h-11")).toBe(true);
  });

  it("marks Vaul drawers as modal and keeps the drawer outside hidden ancestors", () => {
    act(() => {
      root.render(
        <Drawer open>
          <DrawerContent>
            <DrawerTitle>Mobile actions</DrawerTitle>
            <DrawerDescription>Choose an action.</DrawerDescription>
          </DrawerContent>
        </Drawer>,
      );
    });

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.classList.contains("pb-safe")).toBe(true);
    expect(background.getAttribute("aria-hidden")).toBe("true");
    expect(dialog?.closest('[aria-hidden="true"]')).toBeNull();
  });

  it("keeps the official BottomSheet on the shared modal contract", () => {
    act(() => {
      root.render(
        <BottomSheet open onOpenChange={jest.fn()} title="Choose an item">
          <button type="button">Item</button>
        </BottomSheet>,
      );
    });

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(background.getAttribute("aria-hidden")).toBe("true");
    expect(dialog?.closest('[aria-hidden="true"]')).toBeNull();
  });
});
