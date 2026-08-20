"use client";

/**
 * useWorkflowTriggers — THE one path to the trigger endpoints, exactly as
 * `useWorkflowRunControls` is the one path to the lifecycle verbs. Every verb
 * is a `callApi` config typed against the GENERATED OpenAPI paths, so a route
 * or field that moves on the server is a compile error here.
 *
 * The server is complete and deployed (aidream `api/routers/workflow_triggers.py`
 * + the `CronWatcher` inside the workflow worker). Nothing here schedules
 * anything itself — building a second scheduler would be the defect this
 * surface exists to avoid.
 */

import { useCallback, useEffect, useState } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi, type ApiCallConfig } from "@/lib/api/call-api";
import { toast } from "@/lib/toast";

import {
  parseTrigger,
  parseTriggerFireList,
  parseTriggerList,
  type TriggerFire,
  type TriggerKind,
  type WorkflowTrigger,
} from "./types";

export interface CreateTriggerArgs {
  definitionId: string;
  name: string;
  kind: TriggerKind;
  description?: string;
  /** Required for `cron`. A 5-field expression — build it with `toCron`. */
  cronExpression?: string;
  timezone?: string;
  /** Required for `webhook`. Sent once, never returned by any read. */
  webhookSecret?: string;
  defaultInputs?: Record<string, unknown>;
}

export interface WorkflowTriggersApi {
  triggers: WorkflowTrigger[];
  loading: boolean;
  /** Set when the list could not be read at all — never a silent empty list. */
  loadError: string | null;
  busyId: string | null;
  creating: boolean;
  refresh: () => Promise<void>;
  create: (args: CreateTriggerArgs) => Promise<WorkflowTrigger | null>;
  setActive: (triggerId: string, isActive: boolean) => Promise<boolean>;
  remove: (triggerId: string) => Promise<boolean>;
  /** Fire a webhook/manual trigger from the owner's session. Returns run id. */
  fireNow: (triggerId: string) => Promise<string | null>;
  listFires: (triggerId: string) => Promise<TriggerFire[]>;
}

/** The origin an OUTSIDE system must POST to — never the admin's local toggle. */
export function triggerWebhookUrl(triggerId: string): string {
  const origin = (
    process.env.NEXT_PUBLIC_BACKEND_URL_PROD ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    "https://server.app.matrxserver.com"
  ).replace(/\/$/, "");
  return `${origin}/triggers/${triggerId}/fire`;
}

/** A strong secret the person never has to invent. Browser crypto only. */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function useWorkflowTriggers(
  definitionId: string | null,
): WorkflowTriggersApi {
  const dispatch = useAppDispatch();
  const [triggers, setTriggers] = useState<WorkflowTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!definitionId) return;
    const config: ApiCallConfig<"/triggers", "GET"> = {
      path: "/triggers",
      method: "GET",
      queryParams: { definition_id: definitionId, limit: 200 },
    };
    const result = await dispatch(callApi(config));
    if (result.error) {
      // Loud recovery: an unreadable list is NOT "no schedules". Saying
      // "nothing scheduled" when the read failed would let a person create a
      // duplicate schedule on top of a live one.
      setLoadError(
        "We couldn't check this workflow's schedules just now. Try again in a moment.",
      );
      setLoading(false);
      return;
    }
    setLoadError(null);
    setTriggers(parseTriggerList(result.data));
    setLoading(false);
  }, [definitionId, dispatch]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (args: CreateTriggerArgs): Promise<WorkflowTrigger | null> => {
      setCreating(true);
      try {
        const config: ApiCallConfig<"/triggers", "POST"> = {
          path: "/triggers",
          method: "POST",
          body: {
            definition_id: args.definitionId,
            name: args.name,
            kind: args.kind,
            ...(args.description ? { description: args.description } : {}),
            ...(args.cronExpression
              ? { cron_expression: args.cronExpression }
              : {}),
            ...(args.timezone ? { timezone: args.timezone } : {}),
            ...(args.webhookSecret
              ? { webhook_secret: args.webhookSecret }
              : {}),
            ...(args.defaultInputs
              ? { default_inputs: args.defaultInputs }
              : {}),
          },
        };
        const result = await dispatch(callApi(config));
        if (result.error) {
          toast.error(
            result.error.message ?? "That schedule could not be saved.",
          );
          return null;
        }
        const created = parseTrigger(result.data);
        if (!created) {
          toast.error("It saved, but the server sent back something we couldn't read.");
          return null;
        }
        setTriggers((prev) => [created, ...prev]);
        return created;
      } finally {
        setCreating(false);
      }
    },
    [dispatch],
  );

  const setActive = useCallback(
    async (triggerId: string, isActive: boolean): Promise<boolean> => {
      setBusyId(triggerId);
      try {
        const config: ApiCallConfig<"/triggers/{trigger_id}", "PATCH"> = {
          path: "/triggers/{trigger_id}",
          method: "PATCH",
          pathParams: { trigger_id: triggerId },
          body: { is_active: isActive },
        };
        const result = await dispatch(callApi(config));
        if (result.error) {
          toast.error(
            isActive ? "Could not turn it on." : "Could not pause it.",
          );
          return false;
        }
        // next_run_at is recomputed server-side on reactivation, so re-read
        // rather than guessing when the next run lands.
        await refresh();
        return true;
      } finally {
        setBusyId(null);
      }
    },
    [dispatch, refresh],
  );

  const remove = useCallback(
    async (triggerId: string): Promise<boolean> => {
      setBusyId(triggerId);
      try {
        const config: ApiCallConfig<"/triggers/{trigger_id}", "DELETE"> = {
          path: "/triggers/{trigger_id}",
          method: "DELETE",
          pathParams: { trigger_id: triggerId },
        };
        const result = await dispatch(callApi(config));
        if (result.error) {
          toast.error("Could not remove it.");
          return false;
        }
        setTriggers((prev) => prev.filter((t) => t.id !== triggerId));
        return true;
      } finally {
        setBusyId(null);
      }
    },
    [dispatch],
  );

  const fireNow = useCallback(
    async (triggerId: string): Promise<string | null> => {
      setBusyId(triggerId);
      try {
        const config: ApiCallConfig<"/triggers/{trigger_id}/fire", "POST"> = {
          path: "/triggers/{trigger_id}/fire",
          method: "POST",
          pathParams: { trigger_id: triggerId },
          // No body: the server merges `body.inputs` on top of the trigger's
          // stored default_inputs, and a manual "try it now" is asking for
          // exactly what the trigger would do on its own.
        };
        const result = await dispatch(callApi(config));
        if (result.error) {
          toast.error(result.error.message ?? "Could not run it just now.");
          return null;
        }
        const data: unknown = result.data;
        const runId =
          typeof data === "object" && data !== null && "run_id" in data
            ? (data as { run_id?: unknown }).run_id
            : null;
        void refresh();
        return typeof runId === "string" && runId ? runId : null;
      } finally {
        setBusyId(null);
      }
    },
    [dispatch, refresh],
  );

  const listFires = useCallback(
    async (triggerId: string): Promise<TriggerFire[]> => {
      const config: ApiCallConfig<"/triggers/{trigger_id}/fires", "GET"> = {
        path: "/triggers/{trigger_id}/fires",
        method: "GET",
        pathParams: { trigger_id: triggerId },
        queryParams: { limit: 50 },
      };
      const result = await dispatch(callApi(config));
      if (result.error) return [];
      return parseTriggerFireList(result.data);
    },
    [dispatch],
  );

  return {
    triggers,
    loading,
    loadError,
    busyId,
    creating,
    refresh,
    create,
    setActive,
    remove,
    fireNow,
    listFires,
  };
}
