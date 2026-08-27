"use client";

/**
 * useExportFormats — E-18 `GET /hr/exports/formats`, held in component state.
 *
 * The registry is fetched, never hard-coded: which formats exist, which are `available`, what each
 * `requires_mapping`, and the `notes` that explain an unavailable one are all the server's to say
 * (§4.3). A client-side list would go stale the moment a mapper ships or a QuickBooks column spec
 * is finally derived.
 */

import { useEffect, useState } from "react";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { listExportFormats } from "../service";
import { toExportFailure, type ExportFailure } from "../errors";
import type { ExportFormat } from "../types";

export interface UseExportFormatsResult {
  formats: ExportFormat[] | null;
  isLoading: boolean;
  failure: ExportFailure | null;
  reload: () => void;
}

export function useExportFormats(
  mockCase?: HrFixtureCase,
  /**
   * 🚨 THE EMPLOYER, EXPLICITLY. This is a GET, so it carries no body for the transport to derive
   * `X-Organization-Id` from — without it the header falls back to the REDUX picker's org, which
   * is not what HR scopes to (SPEC-UI-IA §1: `?org=` wins). The registry is capability-scoped per
   * employer, so a header naming the wrong one answers about the wrong employer. R5.
   */
  organizationId?: string | null,
): UseExportFormatsResult {
  const [formats, setFormats] = useState<ExportFormat[] | null>(null);
  const [failure, setFailure] = useState<ExportFailure | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const startTimer = window.setTimeout(() => {
      setIsLoading(true);
      setFailure(null);
      listExportFormats({
        mockCase,
        organizationId: organizationId ?? undefined,
      })
        .then((next) => {
          if (cancelled) return;
          setFormats(next);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setFormats(null);
          setFailure(toExportFailure(err));
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
    };
  }, [mockCase, organizationId, reloadToken]);

  return {
    formats,
    isLoading,
    failure,
    reload: () => setReloadToken((token) => token + 1),
  };
}
