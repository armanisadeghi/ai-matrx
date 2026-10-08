"use client";

/**
 * WarmupHost — mounts the app's ONE warm-up (`@ai-matrx/agents`, contract:
 * common-docs `systems/architecture/warm-cache/CONTRACT.md`) so any component
 * below can say what the person is about to need.
 *
 * Adding a page's warm-up is one line:
 *   server page  → `<WarmOnRoute items={[{ key: "agent", id }]} reason="route" />`
 *   client page  → `useWarmOnMount([{ key: "agent", id }], "route")`
 *
 * Auth, base URL and `X-Organization-Id` ride the app's global
 * `createMatrxTransport` (same as every other package call). The warm-up asks
 * only when a person is signed in AND an organization is active — a warm-up
 * must never be the thing that opens the organization picker. The server not
 * knowing `/ai/warm` yet (404/405) is expected and stays out of the error log.
 */

import { useEffect, useState, type ReactNode } from "react";
import { createWarmup, preconnectServer } from "@ai-matrx/agents/matrx";
import { WarmupProvider } from "@ai-matrx/agents/react";
import { createMatrxTransport } from "@/lib/api/matrx-transport";
import { resolveBaseUrl } from "@/lib/api/call-api";
import { useAppStore } from "@/lib/redux/hooks";
import { selectAccessToken, selectUserId } from "@/lib/redux/slices/userSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

export function WarmupHost({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const [warmup] = useState(() =>
    createWarmup({
      transport: createMatrxTransport(store.getState, {
        source: "warmup",
        expectedErrorStatuses: [404, 405],
      }),
      isSignedIn: () => {
        const state = store.getState();
        return !!selectAccessToken(state) && !!selectOrganizationId(state);
      },
      scope: () => {
        const state = store.getState();
        const userId = selectUserId(state);
        const organizationId = selectOrganizationId(state);
        return userId && organizationId ? `${userId}:${organizationId}` : null;
      },
    }),
  );

  useEffect(() => {
    try {
      preconnectServer(resolveBaseUrl(store.getState()));
    } catch {
      // no backend URL configured yet — the first real call connects as before
    }
  }, [store]);

  return <WarmupProvider warmup={warmup}>{children}</WarmupProvider>;
}
