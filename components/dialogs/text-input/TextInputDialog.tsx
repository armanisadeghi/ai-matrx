/**
 * components/dialogs/text-input/TextInputDialog.tsx
 *
 * Drop-in replacement for `window.prompt`. Captures a single string of
 * input from the user. Renders a `<Drawer>` (bottom sheet) on mobile
 * and a `<Dialog>` on desktop, per the matrx-admin layout standard
 * (see CLAUDE.md "Mobile Layout" — never Dialog on mobile).
 *
 * Local-state component — no global host. Use it like any controlled
 * dialog: hold `open` and `value` in your component, render once.
 *
 * @example
 *   const [open, setOpen] = useState(false);
 *   const [busy, setBusy] = useState(false);
 *
 *   <TextInputDialog
 *     open={open}
 *     onOpenChange={(o) => !busy && setOpen(o)}
 *     title="New folder"
 *     placeholder="Folder name"
 *     confirmLabel="Create"
 *     busy={busy}
 *     onConfirm={async (name) => {
 *       setBusy(true);
 *       try { await createFolder(name); setOpen(false); }
 *       finally { setBusy(false); }
 *     }}
 *   />
 */

"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
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
import { ProTextarea } from "@/components/official/ProTextarea";
import { isPointOnOpener } from "./opener-reclick";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface TextInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  placeholder?: string;
  defaultValue?: string;
  /** Use a textarea instead of a single-line input (for longer descriptions). */
  multiline?: boolean;
  /** Visible rows when `multiline` is true. Default 5. */
  rows?: number;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, both buttons are disabled and a spinner shows on confirm. */
  busy?: boolean;
  /**
   * Optional sync validator. Return an error message to display, or
   * null/empty to accept. Empty/whitespace-only input is rejected by
   * default (treated as "Required").
   */
  validate?: (value: string) => string | null | undefined;
  onConfirm: (value: string) => void | Promise<void>;
}

export function TextInputDialog({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  defaultValue = "",
  multiline = false,
  rows = 5,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  validate,
  onConfirm,
}: TextInputDialogProps) {
  const isMobile = useIsMobile();
  const [value, setValue] = React.useState(defaultValue);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * THE DEFECT THIS CLOSES (live on www.aimatrx.com, 2026-09-22). Every
   * caller of this dialog opens it from a toolbar button that stays on
   * screen, dimmed but perfectly readable, UNDER the dialog's own full-screen
   * scrim. Clicking that button again is therefore an "interact outside" and
   * DISMISSES the dialog. A person who does not notice the dialog and clicks
   * the button again — the most natural thing in the world — closes it; an
   * even number of clicks leaves the page looking untouched. That is exactly
   * how the battle page's "Save as…" was reported dead: four clicks, no
   * dialog, no toast, no overlay (verified click-by-click on the live site —
   * click 2 closed it, click 3 reopened it).
   *
   * So the element that OPENED this dialog is never an outside click. It is
   * remembered at open time (it is the focused element the instant before
   * Radix moves focus into the dialog) and a pointer-down whose point lands
   * on it is swallowed: the dialog stays open and focus returns to the field.
   * Every other outside click still dismisses, as it should.
   */
  const openerRef = React.useRef<HTMLElement | null>(null);
  const lastPointerTargetRef = React.useRef<HTMLElement | null>(null);

  // The opener cannot be read as `document.activeElement` once the dialog is
  // open — Radix has already pulled focus into the field — so the last
  // pointer-down target is remembered continuously and frozen the moment the
  // dialog opens.
  React.useEffect(() => {
    const remember = (event: Event) => {
      const target = event.target;
      lastPointerTargetRef.current =
        target instanceof HTMLElement ? target.closest("button") ?? target : null;
    };
    document.addEventListener("pointerdown", remember, true);
    return () => document.removeEventListener("pointerdown", remember, true);
  }, []);

  React.useEffect(() => {
    if (open) openerRef.current = lastPointerTargetRef.current;
  }, [open]);

  const pointIsOnOpener = React.useCallback(
    (event: Event) =>
      isPointOnOpener(openerRef.current, event as unknown as MouseEvent),
    [],
  );

  // Reset state on every open. Keeps the component pure — opening it
  // twice in a row doesn't keep stale text from the prior session.
  React.useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setError(null);
    }
  }, [open, defaultValue]);

  const submit = React.useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Required");
      return;
    }
    if (validate) {
      const err = validate(trimmed);
      if (err) {
        setError(err);
        return;
      }
    }
    void onConfirm(trimmed);
  }, [value, validate, onConfirm]);

  const handleFormSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    submit();
  };

  const body = (
    <form onSubmit={handleFormSubmit} className="space-y-2">
      {multiline ? (
        <ProTextarea
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          placeholder={placeholder}
          disabled={busy}
          rows={rows}
          className={cn(
            "min-h-[8rem] resize-y text-base",
            error && "border-destructive",
          )}
          aria-invalid={!!error}
          aria-describedby={error ? "text-input-dialog-error" : undefined}
        />
      ) : (
        <Input
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          placeholder={placeholder}
          disabled={busy}
          // text-base = 16px, prevents iOS Safari zoom-on-focus
          className={cn("text-base", error && "border-destructive")}
          aria-invalid={!!error}
          aria-describedby={error ? "text-input-dialog-error" : undefined}
        />
      )}
      {error ? (
        <p id="text-input-dialog-error" className="text-sm text-destructive">
          {error}
          <ErrorAlchemyMenu error={error} />
        </p>
      ) : null}
      {/* Hidden submit so Enter key submits the form. */}
      <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
    </form>
  );

  const buttons = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpenChange(false)}
        disabled={busy}
      >
        {cancelLabel}
      </Button>
      <Button type="button" onClick={submit} disabled={busy || !value.trim()}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {confirmLabel}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            {description ? (
              <DrawerDescription>{description}</DrawerDescription>
            ) : null}
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
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(event) => {
          if (pointIsOnOpener(event.detail.originalEvent)) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {body}
        <DialogFooter>{buttons}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
