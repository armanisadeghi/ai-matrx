"use client";

// features/podcasts/generator/components/ShowPicker.tsx
//
// Choose which podcast (show) the generated episode lands in — an existing
// show, or the default "Matrx Mix" placeholder, or a new one created inline.

import { useState } from "react";
import { Plus, Mic } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CreateShowDialog } from "./CreateShowDialog";
import type { PcShow } from "@/features/podcasts/types";

export const DEFAULT_SHOW_VALUE = "__default__";

interface ShowPickerProps {
  shows: PcShow[];
  /** null = default placeholder show. */
  value: string | null;
  onChange: (showId: string | null) => void;
  onShowCreated: (show: PcShow) => void;
}

export function ShowPicker({
  shows,
  value,
  onChange,
  onShowCreated,
}: ShowPickerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        Add to podcast
      </Label>
      <div className="flex items-center gap-2">
        <Select
          value={value ?? DEFAULT_SHOW_VALUE}
          onValueChange={(v) => onChange(v === DEFAULT_SHOW_VALUE ? null : v)}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Choose a podcast" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_SHOW_VALUE}>
              <span className="flex items-center gap-2">
                <Mic className="h-3.5 w-3.5 text-muted-foreground" />
                Matrx Mix (default)
              </span>
            </SelectItem>
            {shows.map((show) => (
              <SelectItem key={show.id} value={show.id}>
                {show.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="shrink-0 gap-1.5"
        >
          <Plus className="h-4 w-4" />
          New
        </Button>
      </div>

      <CreateShowDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(show) => {
          onShowCreated(show);
          onChange(show.id);
        }}
      />
    </div>
  );
}
