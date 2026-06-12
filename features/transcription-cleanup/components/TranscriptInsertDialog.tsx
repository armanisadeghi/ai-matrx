"use client";

/**
 * Captures freeform text to queue at the start or end of the transcript.
 * Drawer on mobile, dialog on desktop — matches TextInputDialog conventions.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type TranscriptInsertTarget = "start" | "end";

interface TranscriptInsertDialogProps {
  open: boolean;
  target: TranscriptInsertTarget | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (text: string) => void;
}

export function TranscriptInsertDialog({
  open,
  target,
  onOpenChange,
  onConfirm,
}: TranscriptInsertDialogProps) {
  const isMobile = useIsMobile();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue("");
      setError(null);
    }
  }, [open, target]);

  const title = target === "start" ? "Add text at start" : "Add text at end";
  const description =
    target === "start"
      ? "Queued text appears above the live transcript and is included when recording finishes."
      : "Queued text appears below the live transcript and is included when recording finishes.";

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter some text first");
      return;
    }
    onConfirm(trimmed);
    onOpenChange(false);
  };

  const form = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-2"
    >
      <Textarea
        autoFocus
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (error) setError(null);
        }}
        placeholder="Type or paste text…"
        rows={4}
        className={cn(
          "min-h-[6rem] resize-y text-base",
          error && "border-destructive",
        )}
        aria-invalid={!!error}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
    </form>
  );

  const buttons = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpenChange(false)}
      >
        Cancel
      </Button>
      <Button type="button" onClick={submit} disabled={!value.trim()}>
        Queue text
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
          <div className="px-4 pb-2">{form}</div>
          <DrawerFooter className="flex-row justify-end gap-2 pb-safe">
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
        {form}
        <DialogFooter>{buttons}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
