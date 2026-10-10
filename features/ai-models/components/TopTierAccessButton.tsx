"use client";

// Who may run top-tier (MAX, cost rating 6) models — a compact door in the models page's
// existing toolbar. Everyone is off; a super admin turns one person on from that person's
// row on /administration/users (recorded: who, when). See features/ai-models/topTierAccess.ts.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gem } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { extractErrorMessage } from "@/utils/errors";
import { listTopTierHolders, type TopTierHolder } from "../topTierAccess";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
}

export default function TopTierAccessButton() {
  const [holders, setHolders] = useState<TopTierHolder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTopTierHolders()
      .then((rows) => !cancelled && (setHolders(rows), setError(null)))
      .catch((err: unknown) => !cancelled && setError(extractErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button icon={<Gem />} variant="quiet" title="Who may run MAX models">
          MAX access
          <span className="inline-block min-w-[2ch] text-center tabular-nums">
            {/* read-gate-exempt: a failed read renders ! on this very figure */}
            {holders ? holders.length : error ? "!" : "·"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent /* sizing: fixed — a fixed-measure panel on purpose; its rows truncate inside the box */ align="end" className="w-80 p-2 text-xs">
        <div className="mb-1 font-medium">MAX models — allowed accounts</div>
        {error ? (
          <div role="alert" className="text-destructive-ink">{error}<ErrorAlchemyMenu error={error} /></div>
        ) : !holders ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : holders.length === 0 ? (
          <div className="text-muted-foreground">Nobody</div>
        ) : (
          <ul className="divide-y">
            {holders.map((h) => (
              <li key={h.user_id} className="flex items-center gap-2 py-1">
                <Link
                  href={`/administration/users?user=${encodeURIComponent(h.user_id)}`}
                  className="min-w-0 flex-1 truncate text-foreground hover:underline"
                >
                  {h.email ?? h.user_id}
                </Link>
                <span className="shrink-0 text-muted-foreground" title={h.changed_by_email ? `Turned on by ${h.changed_by_email}` : "Turned on by the system"}>
                  {when(h.changed_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1 text-muted-foreground">Change it from a person&apos;s row in Users.</div>
      </PopoverContent>
    </Popover>
  );
}
