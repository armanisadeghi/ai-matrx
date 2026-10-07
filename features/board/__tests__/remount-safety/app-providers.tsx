/**
 * The app's own provider stack (`app/Providers.tsx`) for the remount-safety
 * suite — the providers a tile body reads from context, in the app's order.
 * Left out: the global hosts that do their own work regardless of any tile
 * (realtime, meet, messaging, audio, recovery, deferred singletons), so the
 * ledger shows only what the tile did.
 */

// The provider stack reaches a server-only module through the chat host's feedback action
// (`ChatHostAdapter` → `actions/feedback.actions` → the notification spine). The browser build
// never loads it; the suite has no server, so the marker module is replaced by an empty one.
jest.mock("server-only", () => ({}));

import type { ReactNode } from "react";
import { Provider } from "react-redux";
import "@/providers/chat-surface-manifests";
// The app's chat host slots (the attach-menu item list, the artifact doors, …). `ChatHostAdapter` imports
// `chatUiRegistrationProfile`, which next.config.js swaps for this file at build time and jest leaves a
// no-op — so the suite registers the same slots the browser build does, or a chat tile draws the stand-ins.
import "@/providers/chatUiRegistration";
import type { AppStore } from "@/lib/redux/store";
import { ReactQueryProvider } from "@/providers/ReactQueryProvider";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { ChatHostAdapter } from "@/providers/ChatHostAdapter";
import { ChatSurfaceRegistrations } from "@/providers/ChatSurfaceRegistrations";
import { AssociationsHost } from "@/features/scopes/host/AssociationsHost";
import { DetailHost } from "@/features/window-panels/detail/DetailHost";
import { AgentCatalogHost } from "@/providers/AgentCatalogHost";
import { MatrxDataTableHost } from "@/components/official/MatrxDataTableHost";
import { ToastProvider } from "@/providers/toast-context";
import { RefProvider } from "@/lib/refs";
import { AlchemyHost } from "@/components/agent-copy/AlchemyHost";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ModuleHeaderProvider } from "@/providers/ModuleHeaderProvider";
import { SelectedImagesProvider } from "@/components/image/context/SelectedImagesProvider";
import { MediaHostProvider } from "@/features/files/media-client/MediaHostProvider";

export function AppProviders({ store, children }: { store: AppStore; children: ReactNode }) {
  return (
    <ReactQueryProvider>
      <Provider store={store}>
        {/* As app/Providers.tsx: the remark chips' durability port (unsent chips are kept server-side). */}
        <ChatSurfaceRegistrations />
        <CanvasHostProvider>
          <ChatHostAdapter>
            <AssociationsHost>
              <DetailHost>
                <AgentCatalogHost>
                <MatrxDataTableHost>
                  <ToastProvider>
                    <AlchemyHost>
                    <RefProvider>
                      <TooltipProvider delayDuration={200}>
                        <ModuleHeaderProvider>
                          <SelectedImagesProvider>
                            <MediaHostProvider>{children}</MediaHostProvider>
                          </SelectedImagesProvider>
                        </ModuleHeaderProvider>
                      </TooltipProvider>
                    </RefProvider>
                    </AlchemyHost>
                  </ToastProvider>
                </MatrxDataTableHost>
                </AgentCatalogHost>
              </DetailHost>
            </AssociationsHost>
          </ChatHostAdapter>
        </CanvasHostProvider>
      </Provider>
    </ReactQueryProvider>
  );
}
