"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import "@ai-matrx/design-system/content-transfer.css";
import {
  useAppDispatch,
  useAppSelector,
  useAppStore,
  useDispatchThunk,
} from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import { MatrxContentTransferProvider } from "@ai-matrx/agents/content-transfer/react";
import {
  ContentTransferCapabilitiesProvider,
  useContentTransferCapabilities,
} from "@ai-matrx/design-system/content-transfer";
import type {
  MatrxContentTransferProgress,
  MatrxContentTransferSupabase,
} from "@ai-matrx/agents/content-transfer";
import type { AiPreparation } from "@ai-matrx/kit/content-transfer";
import {
  requireOrganizationContext,
  type MatrxTransport,
} from "@ai-matrx/agents/matrx";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { createMatrxTransport } from "@/lib/api/matrx-transport";
import { supabase } from "@/utils/supabase/client";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import { openLiveRunWindowAction } from "@/features/overlays/openers/liveRunWindow";
import { toast } from "@/lib/toast";

const PREPARE_PATH = `/ai/mandates/${encodeURIComponent(
  MANDATE_KEYS.alchemy__prepare_content,
)}`;

/** The package needs only these chat reads; keep the generated client behind its narrow port. */
const contentTransferSupabase: MatrxContentTransferSupabase = {
  schema: () => ({
    from: (table) => ({
      select: (columns) => supabase.schema("chat").from(table).select(columns),
    }),
  }),
};

/**
 * Fence every mutable AI session operation to the identity that exposed it.
 * A run can complete after the host selects another organization; its draft
 * must never reach the still-mounted workspace from the earlier identity.
 */
export function guardAiPreparation(
  ai: AiPreparation,
  assertCurrent: () => unknown,
): AiPreparation {
  const fork = ai.fork;
  const recover = ai.recover;
  const cancel = ai.cancel;
  return {
    supports(snapshot) {
      try {
        assertCurrent();
      } catch {
        return false;
      }
      return ai.supports(snapshot);
    },
    async run(input) {
      assertCurrent();
      const draft = await ai.run(input);
      assertCurrent();
      return draft;
    },
    ...(fork
      ? {
          fork: () => guardAiPreparation(fork(), assertCurrent),
        }
      : {}),
    ...(recover
      ? {
          recover: async (input) => {
            assertCurrent();
            const draft = await recover(input);
            assertCurrent();
            return draft;
          },
        }
      : {}),
    ...(cancel
      ? {
          cancel: async () => {
            assertCurrent();
            await cancel();
            assertCurrent();
          },
        }
      : {}),
  };
}

/**
 * Supplies frontend identity and the existing live-run renderer to Alchemy.
 * The package owns preparation; this host only adopts the duplicate stream
 * into the same Redux pipeline that renders every other agent run.
 */
export function AlchemyHost({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const userId = useAppSelector(selectUserId);
  const orgId = useAppSelector(selectOrganizationId);

  return (
    <AlchemyHostSession store={store} userId={userId} orgId={orgId}>
      {children}
    </AlchemyHostSession>
  );
}

type AlchemyHostSessionProps = {
  children: ReactNode;
  store: ReturnType<typeof useAppStore>;
  userId: ReturnType<typeof selectUserId>;
  orgId: ReturnType<typeof selectOrganizationId>;
};

/**
 * A session's ports retain durable adapter state without remounting the app
 * subtree. Identity changes synchronously replace only these host ports.
 */
function AlchemyHostSession({
  children,
  store,
  userId,
  orgId,
}: AlchemyHostSessionProps) {
  const dispatch = useAppDispatch();
  const dispatchThunk = useDispatchThunk();
  const createPorts = () => {
    const identity = { userId, orgId };
    const streamControllers = new Set<AbortController>();
    const abortStreams = () => {
      for (const controller of streamControllers) controller.abort();
      streamControllers.clear();
    };
    const getCurrentState = () => {
      const state = store.getState();
      if (
        selectUserId(state) !== identity.userId ||
        selectOrganizationId(state) !== identity.orgId
      ) {
        throw new Error(
          "Your account or organization changed. Reopen Alchemy to prepare this content in the current workspace.",
        );
      }
      return state;
    };
    const transport: MatrxTransport = {
      async fetch(path, init) {
        const controller =
          path === PREPARE_PATH ? new AbortController() : undefined;
        if (controller) {
          streamControllers.add(controller);
          init.signal?.addEventListener("abort", () => controller.abort(), {
            once: true,
          });
        }
        let adopted = false;
        try {
          const response = await createMatrxTransport(getCurrentState, {
            source: "alchemy",
          }).fetch(
            path,
            controller ? { ...init, signal: controller.signal } : init,
          );
          getCurrentState();
          if (response.ok && path === PREPARE_PATH) {
            const requestId = response.headers.get("X-Request-ID");
            const conversationId = response.headers.get("X-Conversation-ID");
            if (requestId && conversationId) {
              adopted = true;
              const consume = dispatchThunk(
                adoptForeignStream({
                  abortController: controller,
                  onAdopted: (ids) =>
                    dispatch(
                      openLiveRunWindowAction({
                        ...ids,
                        instanceId: `alchemy:${ids.conversationId}`,
                        label: "Alchemy preparation",
                      }),
                    ),
                }),
              );
              void consume(response.clone(), { requestId, conversationId })
                .catch((error: unknown) => {
                  if (controller?.signal.aborted) return;
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Alchemy's live display disconnected. Reopen the saved run to recover it.",
                  );
                })
                .finally(() => {
                  if (controller) streamControllers.delete(controller);
                });
            }
          }
          return response;
        } finally {
          if (!adopted && controller) streamControllers.delete(controller);
        }
      },
    };
    const organizationId = () =>
      requireOrganizationContext(selectOrganizationId(getCurrentState()));
    const onProgress = (progress: MatrxContentTransferProgress) => {
      try {
        getCurrentState();
      } catch {
        return;
      }
      if (progress.requestId && progress.status === "detached") {
        dispatch(
          openLiveRunWindowAction({
            conversationId: progress.conversationId,
            requestId: progress.requestId,
            instanceId: `alchemy:${progress.conversationId}`,
            label: "Alchemy preparation",
          }),
        );
      }
    };
    return {
      identity,
      getCurrentState,
      abortStreams,
      transport,
      organizationId,
      onProgress,
    };
  };
  const [ports, setPorts] = useState(createPorts);
  if (ports.identity.userId !== userId || ports.identity.orgId !== orgId) {
    setPorts(createPorts());
  }
  useLayoutEffect(() => () => ports.abortStreams(), [ports]);

  return (
    <MatrxContentTransferProvider
      transport={ports.transport}
      supabase={contentTransferSupabase}
      organizationId={ports.organizationId}
      sourceApp="matrx-frontend"
      onProgress={ports.onProgress}
    >
      <AlchemyCapabilitiesGate
        userId={userId}
        orgId={orgId}
        assertCurrent={ports.getCurrentState}
      >
        {children}
      </AlchemyCapabilitiesGate>
    </MatrxContentTransferProvider>
  );
}

/**
 * Keep the provider topology stable while denying AI preparation without a
 * selected authenticated identity. The package may still construct its local
 * session, but no menu can offer it until this host exposes the capability.
 */
function AlchemyCapabilitiesGate({
  children,
  userId,
  orgId,
  assertCurrent,
}: {
  children: ReactNode;
  userId: ReturnType<typeof selectUserId>;
  orgId: ReturnType<typeof selectOrganizationId>;
  assertCurrent: () => unknown;
}) {
  const capabilities = useContentTransferCapabilities();
  const aiSource = userId && orgId ? capabilities.ai : undefined;
  const createGuardedCapability = () => ({
    source: aiSource,
    assertCurrent,
    ai: aiSource ? guardAiPreparation(aiSource, assertCurrent) : undefined,
  });
  const [guardedCapability, setGuardedCapability] = useState(
    createGuardedCapability,
  );
  if (
    guardedCapability.source !== aiSource ||
    guardedCapability.assertCurrent !== assertCurrent
  ) {
    setGuardedCapability(createGuardedCapability());
  }
  const { ai: _inheritedAi, ...nonAiCapabilities } = capabilities;
  return (
    <ContentTransferCapabilitiesProvider
      value={
        guardedCapability.ai
          ? {
              ...nonAiCapabilities,
              ai: guardedCapability.ai,
              identityKey: JSON.stringify([userId, orgId]),
            }
          : {
              ...nonAiCapabilities,
              identityKey: JSON.stringify([userId, orgId]),
            }
      }
    >
      {children}
    </ContentTransferCapabilitiesProvider>
  );
}
