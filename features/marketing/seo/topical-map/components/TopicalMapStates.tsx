"use client";

/**
 * The three honest states every topical-map screen owes the user.
 *
 * LOADING says what is loading, never a bare spinner or "Loading…".
 * EMPTY says why there is nothing AND what to do next — an empty screen with
 *   no next step is a dead end.
 * FAILED renders the database's OWN sentence (see `../errors.ts`): these
 *   functions write their refusals for the person making the change, and
 *   rewording one destroys the only explanation they will get.
 *
 * Nothing here ever renders a disabled-looking control or a false sentence.
 */

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { AccessGate } from "@/features/access-gate/components/AccessGate";

import SuspenseLoader from "@/components/loaders/SuspenseLoader";

import { topicalMapErrorText, TopicalMapError } from "../errors";

export function TopicalMapLoading({ what }: { what: string }) {
  return (
    <div className="p-6">
      <SuspenseLoader centered={false} message={`Loading ${what}…`} />
    </div>
  );
}

export function TopicalMapEmpty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/**
 * A failed read or write. The SQLSTATE is shown beside the message because the
 * map's four raised codes mean four different things to the reader: 22023 is
 * "you sent something the function will not take", 23514 is "a policy refused
 * and here is everything blocking it", 42501 is "you cannot reach that", and
 * P0002 is "that slug is not in this map".
 */
export function TopicalMapFailed({
  what,
  error,
  mapId,
}: {
  what: string;
  error: unknown;
  /**
   * Set when the failed read is the MAP itself (its row, topics, drawing,
   * pages, history). An access state — denied, deleted, missing, signed out —
   * then renders the canonical AccessGate for `seo_topical_map`; a genuine
   * fault still renders the function's own sentence below.
   */
  mapId?: string;
}) {
  if (mapId) {
    return (
      <AccessGate
        token="seo_topical_map"
        id={mapId}
        error={error}
        fallbackHref="/marketing"
        fallbackLabel="Marketing"
        renderFault={(fault) => <TopicalMapFault what={what} error={fault} />}
      />
    );
  }
  return <TopicalMapFault what={what} error={error} />;
}

function TopicalMapFault({ what, error }: { what: string; error: unknown }) {
  const code = error instanceof TopicalMapError ? error.code : null;
  const detail = error instanceof TopicalMapError ? error.detail : null;
  const hint = error instanceof TopicalMapError ? error.hint : null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/40 bg-destructive/5 p-4"
    >
      <p className="flex items-center gap-2 font-medium text-destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        Could not load {what}
      </p>
      {/* The function's own words, unaltered. */}
      <p className="mt-2 whitespace-pre-wrap text-sm">
        {topicalMapErrorText(error)}
      </p>
      {detail ? (
        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
          {detail}
        </p>
      ) : null}
      {hint ? (
        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {code ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          SQLSTATE {code}
        </p>
      ) : null}
    </div>
  );
}
