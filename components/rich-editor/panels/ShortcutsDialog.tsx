"use client";

// components/rich-editor/panels/ShortcutsDialog.tsx
//
// ⌘/ — every keyboard shortcut, straight from the one table the keymaps bind.

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ai-matrx/design-system";
import { RICH_EDITOR_SHORTCUTS, formatKeys, type ShortcutGroup } from "../core/shortcuts";

const GROUPS: ShortcutGroup[] = ["Text", "Blocks", "Insert", "Document", "Views"];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const apple = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>The same keys work in the visual and source views. Where Google Docs and Notion differ, both work.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section key={group}>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</h3>
              <ul className="space-y-1">
                {RICH_EDITOR_SHORTCUTS.filter((spec) => spec.group === group).map((spec) => (
                  <li key={spec.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{spec.label}</span>
                    <span className="flex shrink-0 gap-1">
                      {spec.keys.map((key) => (
                        <kbd key={key} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                          {formatKeys(key, apple)}
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
