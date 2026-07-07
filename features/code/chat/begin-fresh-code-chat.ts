"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { AppDispatch } from "@/lib/redux/store";
import { clearFocus } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import { bumpFreshSession } from "../redux/codeWorkspaceSlice";

/** Focus-registry prefix — mirrors `chat-route` on `/chat`. */
export const CODE_WORKSPACE_ROUTE = "code-route" as const;

/** Focus-registry key for the `/code` workspace chat surface. */
export function codeWorkspaceSurfaceKey(agentId: string): string {
  return `${CODE_WORKSPACE_ROUTE}:${agentId}`;
}

/** Start a brand-new chat in the code workspace: drop stale surface focus,
 *  bump the fresh-session nonce (so the launcher remints even when the URL
 *  stays on `/code?agentId=…`), strip `conversationId` from the URL. */
export function beginFreshCodeChat({
  dispatch,
  router,
  pathname,
  searchParams,
  agentId,
}: {
  dispatch: AppDispatch;
  router: AppRouterInstance;
  pathname: string;
  searchParams: URLSearchParams;
  agentId: string;
}): void {
  dispatch(clearFocus(codeWorkspaceSurfaceKey(agentId)));
  dispatch(bumpFreshSession());
  const next = new URLSearchParams(searchParams.toString());
  next.set("agentId", agentId);
  next.delete("conversationId");
  router.replace(`${pathname}?${next.toString()}`);
}
