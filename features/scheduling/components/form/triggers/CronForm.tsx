// features/scheduling/components/form/triggers/CronForm.tsx

"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import cronstrue from "cronstrue";
import { nextNCronFires, validateCron } from "../../../utils/nextFireTime";
import { humanizeRelative } from "../../../utils/triggerHumanize";

interface Props {
  value: { expression?: string; tz?: string };
  onChange: (v: { expression: string; tz: string }) => void;
  error?: string;
}

// Curated short list of common timezones; users can type any IANA tz manually.
const COMMON_TZ = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function CronForm({ value, onChange, error }: Props) {
  const expression = value.expression ?? "";
  const tz =
    value.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  const validationError = useMemo(
    () => (expression ? validateCron(expression, tz) : null),
    [expression, tz],
  );

  const humanReadable = useMemo(() => {
    if (!expression || validationError) return null;
    try {
      return cronstrue.toString(expression, { verbose: false });
    } catch {
      return null;
    }
  }, [expression, validationError]);

  const nextFires = useMemo(() => {
    if (!expression || validationError) return [];
    try {
      return nextNCronFires(expression, tz, 4);
    } catch {
      return [];
    }
  }, [expression, tz, validationError]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="cron-expr">Cron expression</Label>
        <Input
          id="cron-expr"
          value={expression}
          onChange={(e) => onChange({ expression: e.target.value, tz })}
          placeholder="0 9 * * 1-5"
          className="font-mono max-w-md"
        />
        <p className="text-xs text-muted-foreground">
          Standard 5-field cron syntax (min hour day month weekday).
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cron-tz">Timezone</Label>
        <Select value={tz} onValueChange={(v) => onChange({ expression, tz: v })}>
          <SelectTrigger className="max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMMON_TZ.map((z) => (
              <SelectItem key={z} value={z}>
                {z}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(error || validationError) && (
        <p className="text-xs text-destructive">
          {error || validationError}
        </p>
      )}

      {humanReadable && (
        <div className="rounded-md border border-border bg-muted/50 p-3 text-xs space-y-2">
          <div>
            <Badge variant="secondary" className="text-[10px]">
              Preview
            </Badge>{" "}
            <span className="font-medium">{humanReadable}</span>
          </div>
          {nextFires.length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1">Next runs:</div>
              <ul className="space-y-0.5">
                {nextFires.map((iso) => (
                  <li key={iso} className="font-mono text-[11px]">
                    {humanizeRelative(iso)}{" "}
                    <span className="text-muted-foreground">
                      ({new Date(iso).toLocaleString(undefined, { timeZone: tz })})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
