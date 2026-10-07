"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { setOpen as setBottomOpen } from "@/features/code/redux/terminalSlice";
import { CodeWorkspaceRoute } from "@/features/code/host/CodeWorkspaceRoute";
import { ChatPanelSlot } from "@/features/code/chat/ChatPanelSlot";
import { useOpenSourceEntry } from "@/features/code/hooks/useOpenSourceEntry";
import { useOpenRenderPreview } from "@/features/code/hooks/useOpenRenderPreview";
import { agaAppsAdapter } from "@/features/code/library-sources/adapters/aga-apps";
// Side-effect: Applet file tabs preview through the Applet host.
import "@/features/applets/code-preview/registerAppletSourcePreview";
import type { AppletRow } from "@/features/applets/types";
import { useMandate } from "@ai-matrx/chat/mandates/useMandate";
import { useDeclaredSurfaceMandates } from "@ai-matrx/chat/surfaces/runtime/surface-mandates";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

interface AppletEditPageClientProps {
  app: AppletRow;
}

export function AppletEditPageClient({ app }: AppletEditPageClientProps) {
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const openSourceEntry = useOpenSourceEntry();
  const openRenderPreview = useOpenRenderPreview();
  const bootstrappedRef = useRef(false);
  // The editor's coding agent is a MANDATE — swappable per user at /mandates
  // and rebindnable in the admin console without a deploy.
  const { mandate: promptAppDev } = useMandate(PROMPT_APP_DEV_MANDATE);
  // Disclosure only: the editor's coding agent is named in the top Agents menu.
  useDeclaredSurfaceMandates(CODE_EDITOR_DISCLOSURE);
  const basePath = `/applets/manage/${app.id}`;

  // First-mount bootstrap: open the Applet's entry file + paired preview tab so a
  // brand-new visit lands in a usable state. If the tab is already open in the
  // workspace (user navigated away and came back) we leave tab state untouched.
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    // A person editing an Applet has no sandbox: the terminal starts closed
    // (its tab stays one click away in the bottom bar).
    dispatch(setBottomOpen(false));

    const entry = app.entry || "App.tsx";
    const sourceTabId = agaAppsAdapter.makeTabId(app.id, entry);
    if (store.getState().codeTabs?.byId?.[sourceTabId]) return;

    void openSourceEntry({ sourceId: agaAppsAdapter.sourceId, rowId: app.id, fieldId: entry })
      .then(() => {
        openRenderPreview(sourceTabId);
      })
      .catch((err) => {
        console.error("[applets] failed to open code+preview tabs", err);
      });
  }, [app.id, app.entry, openSourceEntry, openRenderPreview, store, dispatch]);

  return (
    <CodeWorkspaceRoute
      showActivityBar
      defaultSideSize={12}
      focusedLibrarySourceId={agaAppsAdapter.sourceId}
      // This Applet's files only — never every Applet the person can see.
      focusedLibraryRowId={app.id}
      // The chat is about this Applet; the agent's other runs live at /code.
      hideHistory
      rightSlot={
        <ChatPanelSlot
          basePath={`${basePath}/code`}
          mandateAgentId={promptAppDev?.agentId}
          historyToggle={false}
          activeFileVariable="current_code"
        />
      }
    />
  );
}

/** Coding agent specialised for Applet development. The chat panel runs the
 *  agent this mandate resolves to; the URL carries no agent id. */
const PROMPT_APP_DEV_MANDATE = MANDATE_KEYS.agent_apps__prompt_app_dev;

const CODE_EDITOR_DISCLOSURE = [
  { mandateKey: PROMPT_APP_DEV_MANDATE, does: "Writes and fixes this Applet's code with you." },
] as const;
