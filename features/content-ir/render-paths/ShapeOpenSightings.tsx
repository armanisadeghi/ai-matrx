"use client";

/**
 * OPEN SIGHTINGS — this shape reached the generic key/value viewer in front of
 * a real reader, and here is where and when.
 *
 * 🚨 WHY (Arman, 2026-08-29). The browser has filed `generic_floor_render`
 * incidents for months and NOTHING on a shape's own page ever mentioned them.
 * `electronics_intake_analysis` accumulated seven of them across four routes
 * — including a live `/chat/…` — while its page showed a flawless preview and
 * its readiness verdict said "passes every check". A downgrade that nobody is
 * told about is indistinguishable from no downgrade.
 *
 * A sighting is not a prediction. It is a record that somebody looked at this
 * shape and got a JSON dump. It stays on the page until the render is fixed
 * AND someone says so — resolving is a deliberate act, never a timeout.
 *
 * THE ROUTES ARE LINKS (no-dead-ends): the incident names where it happened,
 * so the page opens that place rather than describing it.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { toast } from "@/lib/toast";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  listKindIncidents,
  resolveKindIncident,
  type KindIncidentRecord,
} from "@/features/content-ir/admin/incident-service";

export interface ShapeOpenSightingsProps {
  kind: string;
  /** Only an owner/admin may close a sighting; everyone can see it. */
  canResolve?: boolean;
}

export default function ShapeOpenSightings({
  kind,
  canResolve = false,
}: ShapeOpenSightingsProps) {
  const [rows, setRows] = useState<KindIncidentRecord[] | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await listKindIncidents(supabase, "open");
      setRows(all.filter((r) => r.kind === kind));
    } catch (error) {
      // A failure to LOAD sightings must not look like "no sightings".
      captureError({
        source: "content-ir",
        message: `Could not load open sightings for "${kind}": ${
          error instanceof Error ? error.message : String(error)
        }`,
        relation: kind,
      });
      setRows([]);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  if (rows === null || rows.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="flex items-center gap-2">
        <CircleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-medium text-foreground">
          {rows.length === 1
            ? "A reader got the generic key/value view for this shape."
            : `${rows.length} open sightings — readers got the generic key/value view for this shape.`}
        </span>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => {
          const { routes, occurrences } = row;
          return (
            <li
              key={row.id}
              className="rounded border border-border bg-card px-3 py-2 text-xs"
            >
              <p className="text-foreground">{row.errorMessage}</p>
              <p className="mt-1 text-muted-foreground">
                {occurrences > 0
                  ? `${occurrences} time${occurrences === 1 ? "" : "s"}`
                  : "seen"}
                {row.lastSeenAt
                  ? ` · last ${row.lastSeenAt.slice(0, 16).replace("T", " ")}`
                  : ""}
                {row.componentKey ? ` · ${row.componentKey}` : ""}
              </p>
              {routes.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {routes.map((route) => (
                    <Link
                      key={route}
                      href={route}
                      className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {route}
                    </Link>
                  ))}
                </div>
              )}
              {canResolve && (
                <button
                  type="button"
                  disabled={resolving === row.id}
                  onClick={async () => {
                    setResolving(row.id);
                    try {
                      await resolveKindIncident(
                        supabase,
                        row.id,
                        "Render verified on the shape's own paths.",
                      );
                      toast.success("Sighting resolved");
                      await load();
                    } catch (error) {
                      toast.error(
                        `Could not resolve: ${
                          error instanceof Error ? error.message : String(error)
                        }`,
                      );
                    } finally {
                      setResolving(null);
                    }
                  }}
                  className="mt-2 inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  {resolving === row.id && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  This renders correctly now — resolve
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-muted-foreground">
        A sighting stays until someone says the render is fixed. It also fails
        this shape&apos;s readiness check, so it cannot be certified while a
        reader is still getting a JSON dump.
      </p>
    </div>
  );
}
