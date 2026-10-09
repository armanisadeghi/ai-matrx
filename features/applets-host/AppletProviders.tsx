// features/applets-host/AppletProviders.tsx — WHAT A RUNNING APPLET NEEDS AROUND IT, AND NOTHING ELSE.
//
// Server Component, like `app/Providers.tsx`, and built from the SAME provider components — this is not a
// second implementation of any of them, only a shorter list. `/applets/<slug>` is a link somebody sent: a
// stranger opens it, React hydrates only after EVERY script the HTML names has loaded, and the definition
// read and the compile both wait for hydration. Measured on the live site 2026-10-09: the page named 270
// scripts (7.2 MB on the wire), 257 of them the whole app's `Providers` (meetings, messaging, sandboxes,
// cloud-file realtime and pickers, upload guard, task shortcuts, the extension bridge, …), and hydration
// landed at 9–36 s while the Applet itself took < 1 s after it.
//
// KEPT, because something an Applet renders reaches it: the store and its auth sync (every read, job and
// selector), the chat host and its surfaces (job streams, LiveRunDisplay, the declared-mandates menu), the
// canvas, associations/detail doors and the agent picker + peek (kind doors, the writing box's agents),
// the data table host (`<DataPage>`), toasts, Alchemy (copy doors), tooltips, the module-header and
// selected-images contexts (their hooks throw without them), realtime (`rows:<alias>` live), media
// (images in kinds), audio (the writing box's mic), the guest allowance bridge, the deferred singletons
// (overlays: the live-run window), and the confirm, clipboard and value-prompt hosts.
//
// LEFT OUT, because no Applet surface reaches them: Meet, Messaging, the sandbox lifecycle and gate,
// request recovery, persistent components, the server-toggle/loopback/retired-API/Google-redirect
// notices, the extension bridge, platform directives, task shortcuts, cloud-file realtime and pickers, the
// upload guard, the scope-mismatch and conversation-rename dialogs, and the model catalog. An Applet that
// one day needs one of these adds it HERE, by name — never by going back to the whole app's list.

import React from "react";

import { RichContentHostProvider } from "@/providers/RichContentHostProvider";
import StoreProvider from "@/providers/StoreProvider";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RefProvider } from "@/lib/refs";
import { AlchemyHost } from "@/components/agent-copy/AlchemyHost";
import { AlchemySessionPortal } from "@/components/agent-copy/AlchemySessionPortal";
import { ToastProvider } from "@/providers/toast-context";
import { ModuleHeaderProvider } from "@/providers/ModuleHeaderProvider";
import { SelectedImagesProvider } from "@/components/image/context/SelectedImagesProvider";
import { ReactQueryProvider } from "@/providers/ReactQueryProvider";
import { AudioSystemHost } from "@/providers/AudioSystemHost";
import { RealtimeHost } from "@/providers/RealtimeHost";
import { WarmupHost } from "@/providers/WarmupHost";
import { AssociationsHost } from "@/features/scopes/host/AssociationsHost";
import { DetailHost } from "@/features/window-panels/detail/DetailHost";
import { AgentCatalogHost } from "@/providers/AgentCatalogHost";
import { ChatHostAdapter } from "@/providers/ChatHostAdapter";
import "@/providers/chat-surface-manifests";
import { ChatSurfaceRegistrations } from "@/providers/ChatSurfaceRegistrations";
import { MatrxDataTableHost } from "@/components/official/MatrxDataTableHost";
import { AgentPeekHost } from "@/providers/AgentPeekHost";
import DeferredSingletonWrapper from "@/app/DeferredSingletonWrapper";
import { WindowPersistenceManager } from "@/features/window-panels/WindowPersistenceManager";
import { MediaHostProvider } from "@/features/files/media-client/MediaHostProvider";
import { ConfirmDialogHost } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { ClipboardFallbackHost } from "@/components/dialogs/clipboard-fallback/ClipboardFallbackHost";
import { ValuePromptsDialogHost } from "@/components/dialogs/value-prompts/ValuePromptsDialogHost";
import { GlobalAuthSync } from "@/features/auth/components/GlobalAuthSync";
import { GuestAiAllowanceBridge } from "@/components/guest/GuestAiAllowanceBridge";

export function AppletProviders({ children }: { children: React.ReactNode }) {
  return (
    <RichContentHostProvider>
      <ReactQueryProvider>
        <StoreProvider>
          <WarmupHost>
            <CanvasHostProvider>
              <ChatHostAdapter>
                <ChatSurfaceRegistrations />
                <AssociationsHost>
                  <DetailHost>
                    <AgentCatalogHost>
                      <MatrxDataTableHost>
                        <WindowPersistenceManager>
                          <ToastProvider>
                            <AlchemyHost>
                              <RefProvider>
                                <TooltipProvider delayDuration={200}>
                                  <ModuleHeaderProvider>
                                    <SelectedImagesProvider>
                                      <RealtimeHost>
                                        <MediaHostProvider>
                                          <AudioSystemHost />
                                          <AlchemySessionPortal />
                                          <GlobalAuthSync />
                                          <GuestAiAllowanceBridge />
                                          {children}
                                          <DeferredSingletonWrapper />
                                          <ConfirmDialogHost />
                                          <ClipboardFallbackHost />
                                          <ValuePromptsDialogHost />
                                          <AgentPeekHost />
                                        </MediaHostProvider>
                                      </RealtimeHost>
                                    </SelectedImagesProvider>
                                  </ModuleHeaderProvider>
                                </TooltipProvider>
                              </RefProvider>
                            </AlchemyHost>
                          </ToastProvider>
                        </WindowPersistenceManager>
                      </MatrxDataTableHost>
                    </AgentCatalogHost>
                  </DetailHost>
                </AssociationsHost>
              </ChatHostAdapter>
            </CanvasHostProvider>
          </WarmupHost>
        </StoreProvider>
      </ReactQueryProvider>
    </RichContentHostProvider>
  );
}
