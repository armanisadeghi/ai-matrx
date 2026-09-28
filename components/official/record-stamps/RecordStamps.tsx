"use client";

/**
 * RecordStamps — the platform-standard footer for "who touched this row, when".
 *
 * EVERY entity in this platform carries the same six columns (`created_at`,
 * `created_by`, `updated_at`, `updated_by`, `deleted_at`, `version`), and
 * before this component every detail surface either dropped them entirely or
 * printed the actor as a raw uuid. Both are DOOR LAW failures: the first hides
 * stored data the user paid for, the second shows an id nobody can open.
 *
 * Built as a primitive rather than inline (PRINCIPLES.md — build the platform,
 * not the artifact): the marketing finding/snapshot/asset inspectors are its
 * first three consumers, and every other record detail in the app should be
 * its next.
 *
 * Actor resolution lives in `useRecordActors` and costs NOTHING when both
 * actor ids are null — the normal shape of a server-written row, where
 * "System" is the true answer rather than a missing one.
 */

import { UserIdentity } from "@/components/user/UserIdentity";
import { cn } from "@/lib/utils";

export interface RecordStampsProps {
  organizationId?: string | null;
  createdAt?: string | null;
  /**
   * The row's creator. OMIT for a COMPONENT row (one that takes its access
   * from a parent): there the database rewrites `created_by` to the PARENT's
   * owner (db-rules §6d-1), so it is not who created this row — pass
   * `component` instead and the Created stamp shows the time only.
   */
  createdBy?: string | null;
  /** A component row: the Created stamp carries no actor (see `createdBy`). */
  component?: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
  deletedAt?: string | null;
  version?: number | null;
  /** Formatter for a timestamp — pass the surface's own (e.g. `formatDate`). */
  formatTimestamp: (value: string | null) => string;
  /** Resolver from `useRecordActors` — call the hook in the parent. */
  resolveActor: ReturnType<
    typeof import("./useRecordActors").useRecordActors
  > | null;
  className?: string;
}

function Stamp({
  label,
  at,
  actorId,
  formatTimestamp,
  resolveActor,
  tone,
  showActor = true,
}: {
  label: string;
  at?: string | null;
  actorId?: string | null;
  formatTimestamp: (value: string | null) => string;
  resolveActor: RecordStampsProps["resolveActor"];
  tone?: "warning";
  /** False when no actor is recorded for this stamp (a component's Created). */
  showActor?: boolean;
}) {
  if (!at) return null;
  const actor = resolveActor?.(actorId) ?? null;
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground",
          tone === "warning" && "text-warning",
        )}
      >
        <span className="whitespace-nowrap">{formatTimestamp(at)}</span>
        {!showActor ? null : actor ? (
          actor.user ? (
            <UserIdentity
              user={actor.user}
              size="xs"
              subtitle={false}
              className="min-w-0 gap-1.5 text-xs"
            />
          ) : actor.loading ? (
            <span className="text-muted-foreground">resolving…</span>
          ) : (
            // Honest: we know an account acted, and we cannot name it (they
            // are not a current member of this organization). Showing the id
            // as a door would be a lie — it is offered as a support handle.
            <span
              className="truncate font-mono text-[10px] text-muted-foreground"
              title={`Account ${actor.id} — no longer a member of this organization`}
            >
              a former member · {actor.id.slice(0, 8)}
            </span>
          )
        ) : (
          <span className="text-muted-foreground">by the system</span>
        )}
      </dd>
    </div>
  );
}

export function RecordStamps({
  createdAt,
  createdBy,
  component = false,
  updatedAt,
  updatedBy,
  deletedAt,
  version,
  formatTimestamp,
  resolveActor,
  className,
}: RecordStampsProps) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs sm:grid-cols-4",
        className,
      )}
    >
      <Stamp
        label="Created"
        at={createdAt}
        actorId={component ? null : createdBy}
        showActor={!component}
        formatTimestamp={formatTimestamp}
        resolveActor={resolveActor}
      />
      <Stamp
        label="Last updated"
        at={updatedAt}
        actorId={updatedBy}
        formatTimestamp={formatTimestamp}
        resolveActor={resolveActor}
      />
      <Stamp
        label="Moved to trash"
        at={deletedAt}
        formatTimestamp={formatTimestamp}
        resolveActor={resolveActor}
        tone="warning"
      />
      {typeof version === "number" ? (
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Row version
          </dt>
          <dd className="mt-0.5 text-xs tabular-nums text-foreground">
            {version}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
