/**
 * kindComponentIncident — the BROWSER producer for
 * `content_ir.kind_component_incident`.
 *
 * THE GAP THIS CLOSES (2026-08-25). A DB-authored kind component that fails to
 * compile or throws at render degrades safely to the generic structured viewer
 * and screams into the client Error Inspector. But the Inspector is an ADMIN
 * surface, and its durable sink (`ops.system_error`) is an undifferentiated
 * firehose. When a random user hits a broken component, nobody who can fix that
 * component ever learns. Meanwhile `kind_component_incident` — the queue the
 * component-authoring agent already reads (`kindcomp_get_context`) and resolves
 * (`kindcomp_resolve_incident`) — had exactly ONE producer: the aidream
 * generic-floor alarm. The browser, where every real render happens, could not
 * file at all, because the table's insert policy requires EDITOR on the kind.
 *
 * So this module files through `public.log_kind_component_incident`, the
 * auth-checked SECURITY DEFINER RPC (React → Supabase directly; migrations/
 * log_kind_component_incident.sql). It is a strict ADDITION to the existing
 * capture: `captureError` still fires for the local inspector, unchanged.
 *
 * Rules it keeps:
 *  - PRIVACY: only a SHAPE snapshot travels (keys + value TYPES, never values).
 *    The incident is read by whoever can edit the kind — usually not the
 *    viewer's organization.
 *  - Fail-safe: never throws, never awaited by a render path. An alarm that can
 *    break the thing it watches is worse than no alarm.
 *  - Production only, and deduped per session — the RPC also dedupes to one
 *    open row per (kind, error_type, platform, role), so a broken component
 *    seen by a thousand people is ONE incident with an occurrence count.
 */

import type { Json } from "@/types/database.types";

/** The failure modes a browser can observe on a DB kind component. */
export type KindComponentIncidentType =
  /** `component_source` did not compile (or produced no component). */
  | "compile_error"
  /** The compiled component threw during render (error boundary caught it). */
  | "render_throw"
  /** `props_transform` failed to compile or threw. */
  | "transform_error";

export interface KindComponentIncidentInput {
  kind: string;
  errorType: KindComponentIncidentType;
  message: string;
  platform?: string;
  role?: string;
  componentKey?: string | null;
  /** The resolved row's `updated_at` — the browser's component version signal. */
  componentUpdatedAt?: string | null;
  stack?: string | null;
  /** The kind instance value. Reduced to keys + types here; values never leave. */
  data?: unknown;
}

const reported = new Set<string>();

/**
 * Keys and value TYPES only, two levels deep. Enough for an agent to see that
 * the payload it was handed does not match the shape the component reads —
 * which is the second-most-common cause after a bad import — and never enough
 * to leak the viewer's content.
 */
export function describeShape(value: unknown, depth = 0): unknown {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return depth >= 2
      ? `array[${value.length}]`
      : { __type: "array", length: value.length, item: describeShape(value[0], depth + 1) };
  }
  if (typeof value === "object") {
    if (depth >= 2) return "object";
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).slice(0, 60)) {
      out[key] = describeShape((value as Record<string, unknown>)[key], depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return `string(${value.length})`;
  return typeof value;
}

function browserInfo(): Record<string, unknown> | null {
  if (typeof navigator === "undefined") return null;
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport:
      typeof window === "undefined"
        ? null
        : { width: window.innerWidth, height: window.innerHeight },
  };
}

/**
 * File (or re-observe) one kind-component render incident. Fire-and-forget.
 */
export function reportKindComponentIncident(
  input: KindComponentIncidentInput,
): void {
  if (process.env.NODE_ENV !== "production") return;
  if (typeof window === "undefined") return;

  const platform = input.platform ?? "web";
  const role = input.role ?? "output";
  const key = `${input.kind}${input.errorType}${platform}${role}${input.componentUpdatedAt ?? ""}`;
  if (reported.has(key)) return;
  reported.add(key);

  void (async () => {
    try {
      const { supabase } = await import("@/utils/supabase/client");
      await supabase.rpc("log_kind_component_incident", {
        p_kind: input.kind,
        p_error_type: input.errorType,
        p_error_message: input.message,
        p_platform: platform,
        p_role: role,
        p_component_key: input.componentKey ?? undefined,
        p_component_updated_at: input.componentUpdatedAt ?? undefined,
        p_error_stack: input.stack ?? undefined,
        p_data_shape:
          input.data === undefined
            ? undefined
            : (describeShape(input.data) as Json),
        p_browser_info: (browserInfo() ?? undefined) as Json | undefined,
        p_route: window.location.pathname,
      });
    } catch (error) {
      // Never surface: the render already degraded gracefully, and an alarm
      // that throws is worse than one that misses.
      console.warn(
        `[content-ir] could not file a render incident for "${input.kind}":`,
        error,
      );
    }
  })();
}

/** Test seam — drops the per-session dedupe. */
export function resetKindComponentIncidentDedupe(): void {
  reported.clear();
}
