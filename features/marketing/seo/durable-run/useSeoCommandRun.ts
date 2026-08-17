"use client";

/**
 * useSeoCommandRun — the ONE way a surface runs a durable SEO command.
 *
 * This is the SEO FACE of the shared durable-run primitive
 * (`lib/durable-run/useDurableRun.ts`); the mechanics — remember the run id,
 * rejoin on load, settle from server truth, keep a finished answer across a
 * refresh, float a live stream — all live there, because the Masterwork
 * pipelines needed the identical thing and a second copy would be a second
 * durability mechanism. What stays here is the SEO wire vocabulary and this
 * hook's shipped shape.
 *
 * ## The durable half already existed, server-side
 *
 * Every SEO command claims a `seo.collection_run` row BEFORE its first paid or
 * AI call and announces its id on the wire as `seo.command_run` (aidream
 * `services/seo/command_runs.py`). The stream detaches on client disconnect —
 * `create_streaming_response(detach_on_disconnect=True)` — so the work never
 * stopped, only our delivery did. The rejoin route replays the live channel
 * when the run is still executing and emits one durable `seo.run_snapshot`
 * (status + error + result) when it is over.
 *
 * ## Anonymous surfaces work too
 *
 * `/seo/page-audit`, `/seo/robots-tester` and `/seo/structured-data` serve
 * signed-out visitors. A guest is an ordinary `auth.users` row minted by
 * aidream's AuthMiddleware from the browser's stable `X-Fingerprint-ID`, so a
 * guest OWNS its command rows — no Supabase session anywhere in the picture.
 *
 * 🚨 `POST /seo/collections/{run_id}/rejoin` is NOT the route to use: its
 * router is mounted behind `require_authenticated` and answers a guest 401
 * `token_required` (measured against production, 2026-08-17). The guest-safe
 * twin is `POST /seo/public/runs/{run_id}/rejoin` — same `rejoin_stream`, same
 * `collection_run_readable` ownership check, guest-or-above gate. Every
 * consumer here uses it, signed in or not: one path, and the ownership check
 * (not the gate) is what keeps a run private.
 */

import type {
  DurableRunHandle,
  DurableRunStatus,
  DurableRunWire,
} from "@/lib/durable-run/useDurableRun";
import { useDurableRun } from "@/lib/durable-run/useDurableRun";
import type { paths } from "@/types/python-generated/api-types";

const SEO_WIRE: DurableRunWire = {
  pointerPrefix: "matrx.seo-command-run.",
  discriminator: "kind",
  runStartedEvent: "seo.command_run",
  snapshotEvent: "seo.run_snapshot",
  failedEvent: "seo.command_failed",
  inProgressEvent: "seo.run_in_progress",
  rejoinPath: "/seo/public/runs/{run_id}/rejoin" satisfies keyof paths,
  relation: "seo.collection_run",
};

export type SeoCommandStatus = DurableRunStatus;
export type SeoCommandRunHandle<TResult> = DurableRunHandle<TResult>;

export interface UseSeoCommandRunOptions<TResult> {
  /**
   * Stable per-tool key for the browser-side pointer, e.g. `"page-audit"`.
   * Two tools must never share one — a rejoin would land on the wrong screen.
   */
  key: string;
  /** The command's own streaming endpoint. */
  path: keyof paths;
  /** The event kind carrying the finished result, e.g. `seo.page_audit_result`. */
  finalKind: string;
  /** Wire stage kind → the sentence a human reads. */
  stageLabels: Record<string, string>;
  /** Narrow/validate the result document. Return null to reject it loudly. */
  parseResult?: (raw: unknown) => TResult | null;
  /** Extra body fields every launch and rejoin needs (e.g. `scopeOverrides`). */
  scopeOverrides?: Record<string, string>;
  /**
   * Adopt the stream and float it. Pass this when the command runs an agent
   * whose OUTPUT is the point — the run then renders token by token in
   * `LiveRunWindow` through the canonical pipeline instead of showing a stage
   * line over an invisible model. Omit it for a command with nothing to show
   * (a fetch, a validator): a stage line is the right answer there.
   */
  live?: {
    /** What the user is watching, e.g. "Keyword classifier". */
    label: string;
    /** Stable window id; defaults to `seo-command:<key>`. */
    instanceId?: string;
  };
}

export function useSeoCommandRun<TResult>(
  options: UseSeoCommandRunOptions<TResult>,
): SeoCommandRunHandle<TResult> {
  return useDurableRun<TResult>({
    wire: SEO_WIRE,
    key: options.key,
    path: options.path,
    finalEvent: options.finalKind,
    stageLabels: options.stageLabels,
    ...(options.parseResult ? { parseResult: options.parseResult } : {}),
    ...(options.scopeOverrides ? { scopeOverrides: options.scopeOverrides } : {}),
    ...(options.live
      ? {
          live: {
            label: options.live.label,
            instanceId: options.live.instanceId ?? `seo-command:${options.key}`,
          },
        }
      : {}),
  });
}
