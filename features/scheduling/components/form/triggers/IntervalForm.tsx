// features/scheduling/components/form/triggers/IntervalForm.tsx

"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMemo, useState, useEffect } from "react";

interface Props {
  value: { every_seconds?: number };
  onChange: (v: { every_seconds: number }) => void;
  error?: string;
  heartbeat?: boolean;
}

const UNITS = [
  { value: "s", label: "seconds", seconds: 1 },
  { value: "m", label: "minutes", seconds: 60 },
  { value: "h", label: "hours", seconds: 3600 },
  { value: "d", label: "days", seconds: 86400 },
];

export function IntervalForm({
  value,
  onChange,
  error,
  heartbeat = false,
}: Props) {
  const initial = useMemo(() => splitForDisplay(value.every_seconds), []);
  const [n, setN] = useState<number>(initial.n);
  const [unit, setUnit] = useState<string>(initial.unit);

  useEffect(() => {
    const seconds =
      n * (UNITS.find((u) => u.value === unit)?.seconds ?? 60);
    onChange({ every_seconds: seconds });
  }, [n, unit, onChange]);

  return (
    <div className="space-y-2">
      <Label>{heartbeat ? "Heartbeat every" : "Run every"}</Label>
      <div className="flex items-center gap-2 max-w-md">
        <Input
          type="number"
          min={1}
          value={n}
          onChange={(e) => setN(Number(e.target.value) || 0)}
          className="w-24"
        />
        <Select value={unit} onValueChange={setUnit}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UNITS.map((u) => (
              <SelectItem key={u.value} value={u.value}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Minimum 60 seconds.
        {heartbeat &&
          " All runs append to the same conversation — useful for monitor-style agents that need memory."}
      </p>
    </div>
  );
}

function splitForDisplay(everySeconds: number | undefined): {
  n: number;
  unit: string;
} {
  if (!everySeconds || everySeconds < 60) return { n: 5, unit: "m" };
  if (everySeconds % 86400 === 0) return { n: everySeconds / 86400, unit: "d" };
  if (everySeconds % 3600 === 0) return { n: everySeconds / 3600, unit: "h" };
  if (everySeconds % 60 === 0) return { n: everySeconds / 60, unit: "m" };
  return { n: everySeconds, unit: "s" };
}
