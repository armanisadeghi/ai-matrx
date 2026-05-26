// app/(authenticated)/(admin-auth)/administration/scheduling/cron-tester/page.tsx

"use client";

import { useState } from "react";
import cronstrue from "cronstrue";
import { Zap } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  nextNCronFires,
  validateCron,
} from "@/lib/scheduler-client/next-due";
import { humanizeRelative } from "@/features/scheduling/utils/triggerHumanize";

const COMMON_TZ = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function tryHumanize(expr: string): string | null {
  try {
    return cronstrue.toString(expr, { verbose: true });
  } catch {
    return null;
  }
}

function tryNextFires(expr: string, tz: string, n: number): string[] {
  try {
    return nextNCronFires(expr, tz, n);
  } catch {
    return [];
  }
}

export default function CronTesterPage() {
  const [expression, setExpression] = useState("0 9 * * 1-5");
  const [tz, setTz] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
  );
  const [n, setN] = useState(10);

  const validationError = validateCron(expression, tz);
  const human = validationError ? null : tryHumanize(expression);
  const fires = validationError
    ? []
    : tryNextFires(expression, tz, Math.max(1, Math.min(n, 50)));

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 py-4 space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-blue-500" />
        <div>
          <h1 className="text-lg font-semibold leading-none">Cron tester</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Validate any 5-field cron expression and preview the next N fires.
            FE-side preview only; the aidream Python parser is authoritative
            for actual schedule writes.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cron-expr">Expression</Label>
            <Input
              id="cron-expr"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              className="font-mono"
              placeholder="0 9 * * 1-5"
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <Select value={tz} onValueChange={setTz}>
                <SelectTrigger>
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
            <div className="space-y-1.5">
              <Label htmlFor="cron-n">Show next N</Label>
              <Input
                id="cron-n"
                type="number"
                min={1}
                max={50}
                value={n}
                onChange={(e) => setN(Number(e.target.value) || 10)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {validationError ? (
        <Alert variant="destructive">
          <AlertDescription className="font-mono text-xs">
            {validationError}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {human && (
            <div className="rounded-md border border-border bg-card p-3 text-sm">
              <span className="font-medium">{human}</span>
            </div>
          )}
          {fires.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <ol className="space-y-1.5 text-sm">
                  {fires.map((iso, i) => (
                    <li
                      key={iso}
                      className="grid grid-cols-[2rem_1fr_auto] gap-3 items-baseline"
                    >
                      <span className="text-muted-foreground tabular-nums text-xs">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-mono text-xs">
                        {new Date(iso).toLocaleString(undefined, {
                          timeZone: tz,
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {humanizeRelative(iso)}
                      </span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
