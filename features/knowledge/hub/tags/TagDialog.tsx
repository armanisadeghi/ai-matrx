"use client";

/**
 * "Tag…" (`t`) — type a name or pick one of your tags; ↵ files every chosen
 * item under that tag (creating it in the item's organization if it is new).
 */

import { useEffect, useRef, useState } from "react";
import { Hash, Plus } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@ai-matrx/design-system";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HubTag } from "./tagApi";
import { normalizeTagName } from "./tagApi";

export function TagDialog({
  open,
  onOpenChange,
  count,
  tags,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  tags: HubTag[];
  onPick: (name: string) => void;
}) {
  const [text, setText] = useState("");
  const typed = normalizeTagName(text);
  const lower = typed.toLowerCase();
  const names: string[] = [];
  for (const t of tags) if (!names.some((n) => n.toLowerCase() === t.name.toLowerCase())) names.push(t.name);
  const matches = names.filter((n) => !lower || n.toLowerCase().includes(lower)).slice(0, 8);
  const exists = names.some((n) => n.toLowerCase() === lower);
  // With the list unfiltered (cmdk's own filter is off) nothing is highlighted on its own, so ↵ on a
  // freshly typed name did nothing. The first choice is always the highlighted one; arrows move it.
  const firstValue = typed && !exists ? `new:${typed}` : matches[0] ? `tag:${matches[0]}` : "";
  const [active, setActive] = useState("");
  useEffect(() => setActive(firstValue), [firstValue]);
  const inputRef = useRef<HTMLInputElement>(null);
  const pick = (name: string) => {
    setText("");
    onPick(name);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setText("");
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="max-w-md p-0"
        // The dialog's own first-focus rule lands on the dialog itself on the first open after a page
        // load; the name field is where typing goes, every time.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Tag {count === 1 ? "1 item" : `${count} items`}</DialogTitle>
          <DialogDescription className="sr-only">Type a tag and press Enter.</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} value={active} onValueChange={setActive} className="border-t border-border">
          <CommandInput
            ref={inputRef}
            value={text}
            onValueChange={setText}
            placeholder="Tag name…"
            autoFocus
            // The command list keeps Escape for itself (clearing its highlight): here Escape closes.
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setText("");
                onOpenChange(false);
              }
            }}
          />
          <CommandList className="max-h-72">
            <CommandEmpty>Type a name to create a tag.</CommandEmpty>
            {typed && !exists ? (
              <CommandGroup>
                <CommandItem value={`new:${typed}`} onSelect={() => pick(typed)}>
                  <Plus className="h-3.5 w-3.5" /> Tag as <strong>#{typed}</strong>
                  <span className="ml-auto text-[11px] text-muted-foreground">new tag</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {matches.length ? (
              <CommandGroup heading="Your tags">
                {matches.map((n) => (
                  <CommandItem key={n} value={`tag:${n}`} onSelect={() => pick(n)}>
                    <Hash className="h-3.5 w-3.5" /> {n}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
