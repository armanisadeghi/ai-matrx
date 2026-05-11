// features/scheduling/components/form/triggers/OneShotForm.tsx

"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  value: { at?: string };
  onChange: (v: { at: string }) => void;
  error?: string;
}

export function OneShotForm({ value, onChange, error }: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor="oneshot-at">Run at</Label>
      <Input
        id="oneshot-at"
        type="datetime-local"
        value={toLocalInput(value.at)}
        onChange={(e) => onChange({ at: fromLocalInput(e.target.value) })}
        className="max-w-xs"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Task auto-disables after this fires.
      </p>
    </div>
  );
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function fromLocalInput(value: string): string {
  if (!value) return "";
  // datetime-local has no tz; treat as local time, emit ISO
  return new Date(value).toISOString();
}
