"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import type {
  SandboxCreateRequest,
  SandboxTemplate,
  SandboxTemplateListResponse,
  SandboxTier,
} from "@/types/sandbox";
import { extractErrorMessage } from "@/utils/errors";

/**
 * Human-readable guidance for each sandbox tier. Rendered next to the picker
 * so the choice is meaningful instead of a bare radio toggle.
 */
export const TIER_GUIDANCE: Record<SandboxTier, string> = {
  ec2: "Best for one-shot agent runs and cost-controlled tasks. Backed by S3 — your home dir is restored on each new sandbox.",
  hosted:
    "Best for long-lived editor sessions, workloads > 5 GB, or anything that needs internal Matrx services. Per-user volume mounted at /home/agent.",
};

interface UseSandboxCreateOptions {
  /**
   * When `false`, the hook skips the template fetch and template state stays
   * stable. Surfaces should pass `true` whenever the create UI is visible
   * (modal open, page loaded) and `false` otherwise.
   */
  enabled: boolean;
}

interface ResourceOverrides {
  enabled: boolean;
  cpu: number | "";
  memoryMb: number | "";
  diskMb: number | "";
}

/**
 * Shared state + side-effects for any "create sandbox" UI.
 *
 * Owns:
 *   - Tier picker (with last-used persistence)
 *   - Template list (fetched per-tier from `/api/templates`)
 *   - Template picker (with last-used persistence)
 *   - Resource overrides (hosted-tier only)
 *   - Template-fetch error state
 *
 * Does NOT own:
 *   - TTL — each surface picks its own UX (free-form minutes vs. hour presets)
 *   - The submit/create call — surfaces own the call to their own create
 *     hook so they can handle success/error/redirect locally.
 *
 * Use `buildRequest({ ttlSeconds })` to assemble a fully-populated
 * `SandboxCreateRequest`, and `persistChoices()` to write the user's
 * tier/template selection back to Redux preferences (call this right
 * before submitting).
 */
export function useSandboxCreate({ enabled }: UseSandboxCreateOptions) {
  const dispatch = useAppDispatch();
  const codingPrefs = useAppSelector((s) => s.userPreferences.coding);

  const [tier, setTier] = useState<SandboxTier>(
    codingPrefs?.lastSandboxTier ?? "ec2",
  );
  const [templateId, setTemplateId] = useState<string>(
    codingPrefs?.lastSandboxTemplate ?? "bare",
  );
  const [templateVersion, setTemplateVersion] = useState<string>("");
  const [templates, setTemplates] = useState<SandboxTemplate[] | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const [resources, setResources] = useState<ResourceOverrides>({
    enabled: false,
    cpu: 2,
    memoryMb: 2048,
    diskMb: 4096,
  });

  // Refetch the template catalog whenever the surface becomes active or the
  // user flips between tiers. Mirrors the behavior previously duplicated in
  // both `CreateSandboxModal` and the `/sandbox` page.
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setLoadingTemplates(true);
    setTemplateError(null);
    void (async () => {
      try {
        const resp = await fetch(
          `/api/templates?tier=${encodeURIComponent(tier)}`,
        );
        if (!resp.ok) {
          throw new Error(`Templates fetch failed (${resp.status})`);
        }
        const data = (await resp.json()) as SandboxTemplateListResponse;
        if (cancelled) return;
        const list = data.templates ?? [];
        setTemplates(list);
        // If the previously selected template doesn't exist on this tier,
        // fall back to the first available one (or "bare" as a last resort).
        if (!list.some((t) => t.id === templateId)) {
          const fallback = list[0]?.id ?? "bare";
          setTemplateId(fallback);
          setTemplateVersion(list[0]?.version ?? "");
        } else {
          const match = list.find((t) => t.id === templateId);
          if (match) setTemplateVersion(match.version);
        }
      } catch (err) {
        if (!cancelled) {
          setTemplateError(extractErrorMessage(err));
          setTemplates([]);
        }
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tier]);

  const handleTemplateChange = useCallback(
    (nextId: string) => {
      setTemplateId(nextId);
      const match = templates?.find((t) => t.id === nextId);
      if (match) setTemplateVersion(match.version);
    },
    [templates],
  );

  /**
   * Persist the current tier + template selection to Redux user preferences
   * so the next "New sandbox" UI opens with the same choice. Call this right
   * before kicking off the create call.
   */
  const persistChoices = useCallback(() => {
    dispatch(
      setPreference({
        module: "coding",
        preference: "lastSandboxTier",
        value: tier,
      }),
    );
    dispatch(
      setPreference({
        module: "coding",
        preference: "lastSandboxTemplate",
        value: templateId,
      }),
    );
  }, [dispatch, tier, templateId]);

  /**
   * Assemble a `SandboxCreateRequest` from the current form state. Pass the
   * caller's chosen TTL in seconds — the hook is TTL-UX-agnostic.
   */
  const buildRequest = useCallback(
    ({ ttlSeconds }: { ttlSeconds?: number } = {}): SandboxCreateRequest => {
      const request: SandboxCreateRequest = {
        tier,
        template: templateId,
      };
      if (templateVersion) request.template_version = templateVersion;
      if (typeof ttlSeconds === "number" && ttlSeconds > 0) {
        request.ttl_seconds = ttlSeconds;
      }
      // Resource overrides only apply to the hosted tier; the orchestrator
      // ignores them on EC2 but we still scrub them so the request is clean.
      if (resources.enabled && tier === "hosted") {
        request.resources = {};
        if (typeof resources.cpu === "number" && resources.cpu > 0) {
          request.resources.cpu = resources.cpu;
        }
        if (typeof resources.memoryMb === "number" && resources.memoryMb > 0) {
          request.resources.memory_mb = resources.memoryMb;
        }
        if (typeof resources.diskMb === "number" && resources.diskMb > 0) {
          request.resources.disk_mb = resources.diskMb;
        }
      }
      return request;
    },
    [tier, templateId, templateVersion, resources],
  );

  return {
    tier,
    setTier,
    templateId,
    setTemplateId: handleTemplateChange,
    templateVersion,
    templates,
    loadingTemplates,
    templateError,
    resources,
    setResources,
    persistChoices,
    buildRequest,
  };
}

export type UseSandboxCreateReturn = ReturnType<typeof useSandboxCreate>;
