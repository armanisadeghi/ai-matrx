/**
 * components/dialogs/clipboard-fallback/ClipboardFallbackDialog.tsx
 *
 * Last-resort dialog when both `navigator.share` AND
 * the kit clipboard door fail (older browsers, restricted
 * iframes, non-HTTPS contexts, sandboxed environments). Shows the URL
 * in a read-only `<Input>` that auto-selects on open so the user can
 * press Cmd/Ctrl+C immediately. Also offers a "Copy" button that
 * retries through the same kit door — sometimes the user-gesture context
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

import { Button } from "@ai-matrx/design-system";
import { Input } from "@ai-matrx/design-system/controls";
import { Textarea } from "@/components/ui/textarea";
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
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { copyText } from "@ai-matrx/kit/clipboard";
import { toast } from "@/lib/toast";

export interface ClipboardFallbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The text the user needs — a URL, or any content (multi-line is fine). */
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
  // Long or multi-line content gets a textarea; a one-line URL keeps the
  // compact input. Both auto-select so Cmd/Ctrl+C just works.
  const multiline = url.includes("\n") || url.length > 120;
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [copied, setCopied] = React.useState(false);
  const copiedTimer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

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

  // The retry goes through THE clipboard door (kit copyText: the async API, then the execCommand
  // fallback). Its result is announced once: success on the button, a refusal in one toast.
  const handleCopy = async () => {
    const ok = await copyText(url, {
      notify: (message, kind) => {
        if (kind === "error") toast.error(message);
      },
      failureMessage: "Still blocked. Press Cmd/Ctrl+C to copy.",
    });
    if (ok) {
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
      return;
    }
    // Still refused — re-select so the keyboard shortcut works.
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  const body = multiline ? (
    <Textarea mono
      ref={inputRef as React.RefObject<HTMLTextAreaElement>}
      value={url}
      readOnly
      rows={8}
      className="max-h-[45dvh] resize-none"
      onFocus={(event) => event.currentTarget.select()}
    />
  ) : (
    <Input mono
      ref={inputRef as React.RefObject<HTMLInputElement>}
      value={url}
      readOnly
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
