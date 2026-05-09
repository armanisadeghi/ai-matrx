"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/redux/hooks";
import { CodeWorkspaceRoute } from "@/features/code/host/CodeWorkspaceRoute";
import { ChatPanelSlot } from "@/features/code/chat/ChatPanelSlot";
import { useOpenSourceEntry } from "@/features/code/hooks/useOpenSourceEntry";
import { useOpenRenderPreview } from "@/features/code/hooks/useOpenRenderPreview";
import { agaAppsAdapter } from "@/features/code/library-sources/adapters/aga-apps";
// Side-effect: register `aga-app:` previewer with the render-preview registry.
import "@/features/agent-apps/code-preview/registerAgentAppRenderPreview";
import type { AgentApp } from "@/features/agent-apps/types";

interface AgentAppEditPageClientProps {
  app: AgentApp;
}

export function AgentAppEditPageClient({ app }: AgentAppEditPageClientProps) {
  const store = useAppStore();
  const openSourceEntry = useOpenSourceEntry();
  const openRenderPreview = useOpenRenderPreview();
  const bootstrappedRef = useRef(false);
  const basePath = `/agent-apps/${app.id}`;

  // First-mount bootstrap: open the source file + paired preview tab so a
  // brand-new visit lands in a usable state. If the source tab is already
  // open in the workspace (user navigated away and came back) we leave
  // tab state untouched — the user's last selection wins.
  //
  // We deliberately do NOT inject `?agentId=` from `app.agent_id`. The
  // chat panel is the user's coding agent; `app.agent_id` is the agent
  // that runs *inside* the rendered app and shouldn't hijack the editor.
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const sourceTabId = agaAppsAdapter.makeTabId(app.id);
    if (store.getState().codeTabs?.byId?.[sourceTabId]) return;

    void openSourceEntry({ sourceId: agaAppsAdapter.sourceId, rowId: app.id })
      .then(() => {
        openRenderPreview(sourceTabId);
      })
      .catch((err) => {
        console.error("[agent-apps] failed to open code+preview tabs", err);
      });
  }, [app.id, openSourceEntry, openRenderPreview, store]);

  return (
    <CodeWorkspaceRoute
      defaultSideSize={12}
      focusedLibrarySourceId={agaAppsAdapter.sourceId}
      rightSlot={
        <ChatPanelSlot
          basePath={basePath}
          defaultAgentId={PROMPT_APP_DEV_AGENT_ID}
        />
      }
    />
  );
}

/** Coding agent specialised for prompt-app / agent-app development. The
 *  chat panel boots with this agent on the agent-app editor unless the
 *  user already has `?agentId=` pinned in the URL. */
const PROMPT_APP_DEV_AGENT_ID = "f57cc51e-ee93-48b0-bb75-b7ccb05b6e31";
