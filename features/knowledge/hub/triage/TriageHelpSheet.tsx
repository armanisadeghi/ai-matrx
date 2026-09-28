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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription className="sr-only">Every key the Knowledge hub answers.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          {HUB_KEY_SHEET.map((g) => (
            <section key={g.group}>
              <h3 className="pb-1.5 text-xs font-medium text-muted-foreground">{g.group}</h3>
              <ul className="space-y-1">
                {g.keys.map((k) => (
                  <li key={k.label} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">{k.label}</span>
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
