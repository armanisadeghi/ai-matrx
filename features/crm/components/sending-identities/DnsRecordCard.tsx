"use client";

/**
 * DnsRecordCard — the exact record to publish, in copy-and-paste form.
 *
 * This is the single hardest step in the whole feature for the person we build
 * for: a world-class expert who has never opened a DNS panel. So it shows the
 * literal three fields their registrar asks for, each individually copyable,
 * with the one sentence of context that stops the most common mistakes (the
 * hostname is often entered without the domain; changes are not instant).
 *
 * No prose about SPF, no "consult your administrator". The record, the copy
 * buttons, and the button that re-checks.
 */

import { useState } from "react";
import { Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DnsRecordSpec } from "@/features/crm/sending-identities/types";

interface DnsRecordCardProps {
  record: DnsRecordSpec;
  domain: string;
  verified: boolean;
  lastCheckedAt?: string | null;
  checking?: boolean;
  onCheck: () => void;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <button
        type="button"
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-left transition-colors hover:bg-muted"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
        aria-label={`Copy ${label}`}
      >
        <code className="truncate font-mono text-xs text-foreground">{value}</code>
        {copied ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

export function DnsRecordCard({
  record,
  domain,
  verified,
  lastCheckedAt,
  checking,
  onCheck,
}: DnsRecordCardProps) {
  return (
    <Card id="dns-record" className={cn(verified && "border-emerald-500/30")}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">
          {verified
            ? `You have proven you own ${domain}`
            : `Prove that you own ${domain}`}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {verified
            ? "Leave this record in place. We re-check it regularly, and sending stops if it disappears."
            : "Add this record wherever your domain's DNS is managed, then press Check again."}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <CopyField label="Type" value={record.type} />
          <CopyField label="Name / Host" value={record.name} />
          <CopyField label="Value" value={record.value} />
        </div>
        <p className="text-xs text-muted-foreground">
          Some providers want the full hostname instead —{" "}
          <code className="font-mono">{record.host}</code>. Either works. DNS
          changes can take up to an hour to appear.
        </p>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={onCheck} disabled={checking}>
            {checking ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Checking DNS
              </>
            ) : (
              <>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Check again
              </>
            )}
          </Button>
          {lastCheckedAt ? (
            <span className="text-xs text-muted-foreground">
              Last checked {new Date(lastCheckedAt).toLocaleString()}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
