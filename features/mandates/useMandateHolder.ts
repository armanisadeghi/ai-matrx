"use client";

/**
 * WHAT RUNS FOR ME, holder-neutral — the display twin of `useMandate`.
 *
 * `useMandate` resolves a job so a consumer can LAUNCH it in the browser, which
 * only an agent can be; it refuses a workflow winner. A screen that SAYS what
 * runs (the record page's "Effective Mandate Holder") must paint a workflow
 * holder as plainly as an agent — the server resolves and runs both. This hook
 * asks the same one door (`GET /mandates/{key}/resolution`) and never launches.
 *
 * Same contract as `useMandate`: `""` is the disabled sentinel; an unadmitted
 * organization is `organizationPending` (wait, not repair), retried once.
 */

import { useEffect, useState } from "react";
import {
  MandateOrganizationUnresolvedError,
  onMandateCacheInvalidated,
  resolveMandateHolder,
  type ResolvedMandateHolder,
} from "./service";
import { extractErrorMessage } from "@/utils/errors";
import type { AnyMandateKey } from "./mandate-key";

export interface MandateHolderState {
  holder: ResolvedMandateHolder | null;
  loading: boolean;
  error: string | null;
  organizationPending: boolean;
}

export function useMandateHolder(
  mandateKey: AnyMandateKey | "",
): MandateHolderState {
  const enabled = mandateKey.trim().length > 0;
  const [epoch, setEpoch] = useState(0);
  const [retried, setRetried] = useState(false);
  const [state, setState] = useState<MandateHolderState & { key: string }>({
    key: mandateKey,
    holder: null,
    loading: enabled,
    error: null,
    organizationPending: false,
  });

  if (state.key !== mandateKey) {
    setState({
      key: mandateKey,
      holder: null,
      loading: enabled,
      error: null,
      organizationPending: false,
    });
  }

  useEffect(() => {
    return onMandateCacheInvalidated((invalidatedKey) => {
      if (invalidatedKey === undefined || invalidatedKey === mandateKey) {
        setEpoch((e) => e + 1);
      }
    });
  }, [mandateKey]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    resolveMandateHolder(mandateKey as AnyMandateKey)
      .then((holder) => {
        if (cancelled) return;
        setState({
          key: mandateKey,
          holder,
          loading: false,
          error: null,
          organizationPending: false,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const organizationPending =
          error instanceof MandateOrganizationUnresolvedError;
        if (organizationPending && !retried) {
          setRetried(true);
          setEpoch((e) => e + 1);
          return;
        }
        setState({
          key: mandateKey,
          holder: null,
          loading: false,
          error: extractErrorMessage(error),
          organizationPending,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [mandateKey, enabled, epoch, retried]);

  return {
    holder: state.holder,
    loading: state.loading,
    error: state.error,
    organizationPending: state.organizationPending,
  };
}
