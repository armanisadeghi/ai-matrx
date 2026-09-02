import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

jest.mock("@/features/window-panels/popout/usePopoutContainer", () => ({
  usePopoutContainer: () => undefined,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Dialog owns the nested-portal boundary for every menu rendered inside it.
 * These tests pin both directions of the contract:
 *
 * - menu in dialog: package Popover and host Select portal into the dialog's
 *   scrolling content instead of document.body;
 * - dialog from menu: equal z-index plus later portal order keeps the newly
 *   opened dialog above a still-open source popover.
 *
 * jsdom has no layout engine, so it cannot measure scroll-follow geometry.
 * The first test pins the structural prerequisites for that geometry; the
 * live QA matrix supplies the measured browser proof.
 */
describe("dialog nested-portal composition", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
  });

  it("keeps package popovers and host selects inside the dialog scroll shard", () => {
    act(() => {
      root.render(
        <Dialog open>
          <DialogContent data-testid="dialog-content">
            <DialogTitle>Edit record</DialogTitle>
            <Popover open>
              <PopoverTrigger>Open details</PopoverTrigger>
              <PopoverContent data-testid="nested-popover">
                Details
              </PopoverContent>
            </Popover>
            <Select open value="alpha">
              <SelectTrigger aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent data-testid="nested-select">
                <SelectItem value="alpha">Alpha</SelectItem>
                <SelectItem value="beta">Beta</SelectItem>
              </SelectContent>
            </Select>
          </DialogContent>
        </Dialog>,
      );
    });

    const dialog = document.querySelector<HTMLElement>(
      '[data-testid="dialog-content"]',
    );
    const popover = document.querySelector<HTMLElement>(
      '[data-testid="nested-popover"]',
    );
    const select = document.querySelector<HTMLElement>(
      '[data-testid="nested-select"]',
    );

    expect(dialog).not.toBeNull();
    expect(dialog?.contains(popover)).toBe(true);
    expect(dialog?.contains(select)).toBe(true);
    expect(dialog?.className).toContain("overflow-y-auto");
  });

  it("places a dialog opened from a still-open popover after it at the same stack layer", () => {
    function Harness() {
      const [dialogOpen, setDialogOpen] = useState(false);
      return (
        <>
          <Popover open>
            <PopoverTrigger>Actions</PopoverTrigger>
            <PopoverContent data-testid="source-popover">
              <button type="button" onClick={() => setDialogOpen(true)}>
                Open dialog
              </button>
            </PopoverContent>
          </Popover>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent data-testid="opened-dialog">
              <DialogTitle>Manage links</DialogTitle>
            </DialogContent>
          </Dialog>
        </>
      );
    }

    act(() => root.render(<Harness />));
    const openButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Open dialog",
    );
    expect(openButton).toBeDefined();

    act(() => openButton?.click());

    const popover = document.querySelector<HTMLElement>(
      '[data-testid="source-popover"]',
    );
    const dialog = document.querySelector<HTMLElement>(
      '[data-testid="opened-dialog"]',
    );

    expect(popover).not.toBeNull();
    expect(dialog).not.toBeNull();
    if (!popover || !dialog) {
      throw new Error("source popover and opened dialog must both render");
    }
    expect(popover?.className).toContain("z-[10000]");
    expect(dialog?.className).toContain("z-[10000]");
    expect(popover.compareDocumentPosition(dialog)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
