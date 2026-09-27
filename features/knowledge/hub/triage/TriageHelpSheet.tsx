"use client";

/** "?" — every key the hub answers (Readwise Reader / Linear shortcut sheet). */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HUB_KEY_SHEET } from "./triageActions";

export function TriageHelpSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Triage acts on the item under the cursor, or on every selected item. Keep and Archive move it out of your
            Inbox; the next item takes the cursor.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          {HUB_KEY_SHEET.map((g) => (
            <section key={g.group}>
              <h3 className="pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.group}</h3>
              <ul className="space-y-1">
                {g.keys.map((k) => (
                  <li key={k.label} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{k.label}</span>
                    <span className="flex shrink-0 gap-0.5">
                      {k.keys.map((key) => (
                        <kbd key={key} className="rounded border border-border bg-muted px-1.5 text-[11px]">
                          {key}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
