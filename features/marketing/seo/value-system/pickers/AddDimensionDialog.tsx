"use client";

/**
 * P23 — "+ New dimension", from inside any dimension picker.
 *
 * A dimension is a question ("Who is asking?"); its values are the answers. One
 * answer is not a question, so this asks for the name and its first TWO
 * choices — which is also the line `facet_dimension_catalog` draws with
 * `is_ready`: a dimension with a single value would force the classifier to
 * stamp it on everything, so it is never offered to the AI at all. Collecting
 * two here means the thing the person just invented actually works.
 *
 * ONE WRITE PATH. Both choices go through `quickAddValue`
 * (`seo.gsc_quick_add_value`) — the first call mints the dimension, the second
 * adds to it by id. The RPC is idempotent, so a retry never doubles anything.
 */

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuickAdd } from "./useQuickAdd";
import type { QuickAddValueResult } from "../data";

export function AddDimensionDialog({
  siteId,
  /** What was typed into the picker — the dimension name, pre-filled. */
  initialLabel = "",
  nature,
  onCancel,
  onCreated,
}: {
  siteId: string;
  initialLabel?: string;
  /** `situational` for "what is happening now" segments; else intrinsic. */
  nature?: "intrinsic" | "situational";
  onCancel: () => void;
  /** The dimension and its FIRST value, so the caller can select both. */
  onCreated: (result: QuickAddValueResult) => void;
}) {
  const { quickAdd } = useQuickAdd(siteId);
  const [name, setName] = useState(initialLabel);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [busy, setBusy] = useState(false);

  const ready = name.trim() && first.trim() && second.trim() && !busy;

  const save = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const created = await quickAdd(first, {
        newDimensionLabel: name.trim(),
        nature,
      });
      if (!created) return;
      await quickAdd(second, { dimensionId: created.dimension_id, nature });
      onCreated(created);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" />
            A dimension of your own
          </DialogTitle>
          <DialogDescription>
            A dimension is a question you want answered about every keyword. Give
            it two choices to start — one choice would mean the answer is always
            the same.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">
              What are you distinguishing?
            </p>
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Equipment class"
              className="h-9 text-sm"
              aria-label="Dimension name"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">First choice</p>
              <Input
                value={first}
                onChange={(event) => setFirst(event.target.value)}
                placeholder="e.g. Servers"
                className="h-9 text-sm"
                aria-label="First choice"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Second choice</p>
              <Input
                value={second}
                onChange={(event) => setSecond(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && ready) void save();
                }}
                placeholder="e.g. Laptops"
                className="h-9 text-sm"
                aria-label="Second choice"
              />
            </div>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            You can add more choices, describe them, or rename any of this later
            from your dimensions screen.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" disabled={!ready} onClick={() => void save()}>
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Create dimension
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
