/**
 * components/dialogs/clipboard-fallback/ClipboardFallbackDialog.tsx
 *
 * Last-resort dialog when both `navigator.share` AND
 * `navigator.clipboard.writeText` fail (older browsers, restricted
 * iframes, non-HTTPS contexts, sandboxed environments). Shows the URL
 * in a read-only `<Input>` that auto-selects on open so the user can
 * press Cmd/Ctrl+C immediately. Also offers a "Copy" button that
 * retries the clipboard API — sometimes the user-gesture context
 * unblocks it.
 *
 * Drop-in replacement for `window.prompt(message, url)` — the legacy
 * "selectable URL in a system prompt" trick.
 *
 * Drawer on mobile, Dialog on desktop, per CLAUDE.md "Mobile Layout".
 */

"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

export interface ClipboardFallbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
}

export function ClipboardFallbackDialog({
  open,
  onOpenChange,
  url,
  title = "Copy link",
  description = "Press Cmd/Ctrl+C to copy, or use the Copy button below.",
}: ClipboardFallbackDialogProps) {
  const isMobile = useIsMobile();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [copied, setCopied] = React.useState(false);

  // Focus + select on open so Cmd/Ctrl+C just works. The setTimeout
  // gives the radix portal a tick to mount the input into the DOM.
  React.useEffect(() => {
    if (!open) {
      setCopied(false);
      return undefined;
    }
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(id);
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Still failing — re-select so the user can use a keyboard shortcut.
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  const body = (
    <Input
      ref={inputRef}
      value={url}
      readOnly
      className="font-mono text-base"
      onFocus={(event) => event.currentTarget.select()}
    />
  );

  const buttons = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpenChange(false)}
      >
        Close
      </Button>
      <Button type="button" onClick={handleCopy}>
        {copied ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Copy className="mr-2 h-4 w-4" />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-2">{body}</div>
          <DrawerFooter className="flex-row justify-end gap-2">
            {buttons}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{buttons}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
