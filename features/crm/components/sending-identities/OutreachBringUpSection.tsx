"use client";

/**
 * OutreachBringUpSection — mounts the org-level `outreach.production_bring_up`
 * checklist on /crm/sending-identities, per lib/guided-setup law 6: the surface
 * declares nothing, it provides context and mounts `<GuidedChecklist>`.
 *
 * This component owns the I/O the definition's checks share: cached
 * single-flight fetchers (six checks must not mean six HTTP calls), the
 * connect-mailbox and sending-rules dialogs, and the promise seam that lets a
 * step's fix open a dialog and have the re-check fire when it closes.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { GuidedChecklist } from "@/lib/guided-setup/components/GuidedChecklist";
import {
  bringUpChecklist,
  platformBringUpChecklist,
  type BringUpContext,
} from "@/features/crm/sending-identities/bringUpChecklist";
import {
  getBringUpReadiness,
  listSendingIdentities,
} from "@/features/crm/sending-identities/service";
import type {
  BringUpReadiness,
  SendingIdentityView,
} from "@/features/crm/sending-identities/types";
import { AcceptSendingRulesDialog } from "./AcceptSendingRulesDialog";
import { ConnectMailboxDialog } from "./ConnectMailboxDialog";

/** Checks landing within this window share one answer. */
const FETCH_CACHE_MS = 10_000;

interface CacheSlot<T> {
  at: number;
  promise: Promise<T>;
}

function useCachedFetcher<T>(fetcher: () => Promise<T>) {
  const slot = useRef<CacheSlot<T> | null>(null);
  const get = useCallback(() => {
    const now = Date.now();
    if (slot.current && now - slot.current.at < FETCH_CACHE_MS) {
      return slot.current.promise;
    }
    const promise = fetcher().catch((err: unknown) => {
      // A failed answer must not be served from cache for ten seconds.
      slot.current = null;
      throw err;
    });
    slot.current = { at: now, promise };
    return promise;
  }, [fetcher]);
  const clear = useCallback(() => {
    slot.current = null;
  }, []);
  return { get, clear };
}

export function OutreachBringUpSection({
  organizationId,
  onIdentitiesChanged,
}: {
  organizationId: string;
  /** The page's own list needs a reload after a connect made here. */
  onIdentitiesChanged?: () => void;
}) {
  const router = useRouter();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const [connectOpen, setConnectOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const dialogWaiters = useRef<(() => void)[]>([]);

  const identityFetch = useCachedFetcher<SendingIdentityView[]>(
    useCallback(() => listSendingIdentities(), []),
  );
  const readinessFetch = useCachedFetcher<BringUpReadiness>(
    useCallback(() => getBringUpReadiness(organizationId), [organizationId]),
  );

  const settleDialogWaiters = useCallback(() => {
    for (const resolve of dialogWaiters.current) resolve();
    dialogWaiters.current = [];
  }, []);

  const context = useMemo<BringUpContext>(
    () => ({
      organizationId,
      identities: identityFetch.get,
      readiness: readinessFetch.get,
      refreshReadiness: async () => {
        readinessFetch.clear();
        await readinessFetch.get();
      },
      openConnect: () =>
        new Promise<void>((resolve) => {
          dialogWaiters.current.push(resolve);
          setConnectOpen(true);
        }),
      requestAcceptRules: () =>
        new Promise<void>((resolve) => {
          dialogWaiters.current.push(resolve);
          setRulesOpen(true);
        }),
    }),
    [organizationId, identityFetch, readinessFetch],
  );

  return (
    <>
      <GuidedChecklist
        definition={bringUpChecklist}
        context={context}
        scope={{ organizationId }}
      />
      {/*
        Operator-only platform steps (Pub/Sub, server settings, OAuth review).
        A normal org must see zero DevOps vocabulary on this page — the split
        is the point, not a styling choice (Arman, 2026-08-17).
      */}
      {isSuperAdmin ? (
        <GuidedChecklist
          definition={platformBringUpChecklist}
          context={context}
          scope={{ organizationId }}
          className="border-dashed"
        />
      ) : null}
      <ConnectMailboxDialog
        open={connectOpen}
        onOpenChange={(open) => {
          setConnectOpen(open);
          if (!open) {
            identityFetch.clear();
            settleDialogWaiters();
          }
        }}
        onConnected={(identity) => {
          identityFetch.clear();
          onIdentitiesChanged?.();
          // Success must be unmistakable: land the user on the new mailbox's
          // own setup steps rather than leaving them to find it in a list.
          toast.success(`${identity.from_address} is connected — let's finish its setup.`);
          router.push(`/crm/sending-identities/${identity.id}`);
        }}
      />
      <AcceptSendingRulesDialog
        open={rulesOpen}
        onOpenChange={(open) => {
          setRulesOpen(open);
          if (!open) settleDialogWaiters();
        }}
        organizationId={organizationId}
      />
    </>
  );
}
