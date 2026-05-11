// features/scheduling/components/form/triggers/ContextMatchForm.tsx

"use client";

import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  value: { kind?: string; url_pattern?: string; hostname?: string };
  onChange: (v: {
    kind?: string;
    url_pattern?: string;
    hostname?: string;
  }) => void;
  error?: string;
}

export function ContextMatchForm({ value, onChange, error }: Props) {
  const update = (patch: Partial<typeof value>) => {
    const merged = { ...value, ...patch };
    // Strip empty strings to null-ish so jsonb keeps a clean shape.
    const out = Object.fromEntries(
      Object.entries(merged).filter(([, v]) => v && String(v).trim() !== ""),
    );
    onChange(out);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-2.5 text-xs flex gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 text-blue-500 shrink-0" />
        <span>
          Page matches only fire in the AI Matrx Chrome extension — only it
          knows what URL you&apos;re on. At least one of the three fields
          below is required.
        </span>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cm-hostname">Hostname (optional)</Label>
        <Input
          id="cm-hostname"
          value={value.hostname ?? ""}
          onChange={(e) => update({ hostname: e.target.value })}
          placeholder="github.com"
          className="max-w-md"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cm-url">URL pattern, regex (optional)</Label>
        <Input
          id="cm-url"
          value={value.url_pattern ?? ""}
          onChange={(e) => update({ url_pattern: e.target.value })}
          placeholder="github\\.com/.+/pull/.+"
          className="font-mono max-w-md"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cm-kind">Kind tag (optional)</Label>
        <Input
          id="cm-kind"
          value={value.kind ?? ""}
          onChange={(e) => update({ kind: e.target.value })}
          placeholder="pull_request"
          className="max-w-md"
        />
        <p className="text-xs text-muted-foreground">
          A free-form tag the extension can use to route. Combined with the
          other fields via AND.
        </p>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
