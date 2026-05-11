// app/EntityProviders.tsx
//
// Provider tree for the `(legacy)` route group — entity-aware. Mirrors the
// structure of `app/Providers.tsx` (slim) but passes `makeEntityStore` to
// `StoreProvider` and inlines the entity-only providers
// (SchemaProvider + EntityProvider + ChipMenuProvider + EditorProvider) so
// every entity route gets them without each having to wrap with `<EntityPack>`.
//
// Phase 1: scaffold only. Imports `makeEntityStore` (currently a re-export of
// `makeStore`). Phase 2 will wire `app/(legacy)/layout.tsx` to use this and
// pass a server-side preloaded `globalCache` so the entity store boots
// complete (no on-demand fetch).
//
// This file is the SOLE app/* surface that imports `lib/redux/entity-store`
// or any of the entity-only provider modules. The slim `Providers.tsx` must
// never import from here.
//
// See `~/.claude/plans/the-entity-system-which-bubbly-wind.md`.

import React from "react";
import StoreProvider from "@/providers/StoreProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { EntityReduxState } from "@/types/reduxTypes";
import { RefProvider } from "@/lib/refs";
import { ToastProvider } from "@/providers/toast-context";
import { ModuleHeaderProvider } from "@/providers/ModuleHeaderProvider";
import { ContextMenuProvider } from "@/providers/ContextMenuProvider";
import { PersistentComponentProvider } from "@/providers/persistance/PersistentComponentProvider";
import { SelectedImagesProvider } from "@/components/image/context/SelectedImagesProvider";
import { UniformHeightProvider } from "@/features/applet/runner/layouts/core/UniformHeightWrapper";
import { ReactQueryProvider } from "@/providers/ReactQueryProvider";
import { TranscriptsProvider } from "@/features/transcripts/context/TranscriptsContext";
import { AudioRecoveryProvider } from "@/features/audio/providers/AudioRecoveryProvider";
import { GlobalRecordingProvider } from "@/providers/GlobalRecordingProvider";
import { RecordingPill } from "@/components/global/RecordingPill";
import { RequestRecoveryProvider } from "@/features/request-recovery/providers/RequestRecoveryProvider";
import { RecoveryWindow } from "@/features/request-recovery/components/RecoveryWindow";
import { RecoveryNudge } from "@/features/request-recovery/components/RecoveryNudge";
import DeferredSingletons from "./DeferredSingletons";
import GlobalTaskShortcut from "@/features/tasks/widgets/GlobalTaskShortcut";
import CreateTaskFromSourceDialog from "@/features/tasks/widgets/CreateTaskFromSourceDialog";
import { CloudFilesPickerHost } from "@/features/files/components/pickers/CloudFilesPickerHost";
import { ConfirmDialogHost } from "@/components/dialogs/confirm/ConfirmDialogHost";

// Phase 4 PR 4.C: deleted both imperative seed sites (setGlobalUserId from
// app/Providers + setGlobalUserIdAndToken from lib/globalState). The
// reactive identity source (lib/sync/identity::attachStore) hooks the
// store at creation time, so non-React consumers always see the current
// Redux state.

// Entity-only providers (kept inline here so entity routes don't have to
// wrap with `<EntityPack>` individually).
import { EntityPack } from "@/providers/packs/EntityPack";

import { makeEntityStore } from "@/lib/redux/entity-store";

interface EntityProvidersProps {
  children: React.ReactNode;
  initialReduxState: EntityReduxState;
}

export function EntityProviders({
  children,
  initialReduxState,
}: EntityProvidersProps) {
  return (
    <ReactQueryProvider>
      <StoreProvider
        initialState={initialReduxState}
        makeStore={makeEntityStore}
      >
        <PersistentComponentProvider>
          <ContextMenuProvider>
            <ToastProvider>
              <RefProvider>
                <TooltipProvider delayDuration={200}>
                  <ModuleHeaderProvider>
                    <UniformHeightProvider>
                      <SelectedImagesProvider>
                        <TranscriptsProvider>
                          <AudioRecoveryProvider>
                            <RequestRecoveryProvider>
                              <GlobalRecordingProvider>
                                <EntityPack>{children}</EntityPack>
                                <RecordingPill />
                              </GlobalRecordingProvider>
                              <RecoveryWindow />
                              <RecoveryNudge />
                              <DeferredSingletons />
                              <GlobalTaskShortcut />
                              <CreateTaskFromSourceDialog />
                              <CloudFilesPickerHost />
                              {/* See app/Providers.tsx for the rationale. */}
                              <ConfirmDialogHost />
                            </RequestRecoveryProvider>
                          </AudioRecoveryProvider>
                        </TranscriptsProvider>
                      </SelectedImagesProvider>
                    </UniformHeightProvider>
                  </ModuleHeaderProvider>
                </TooltipProvider>
              </RefProvider>
            </ToastProvider>
          </ContextMenuProvider>
        </PersistentComponentProvider>
      </StoreProvider>
    </ReactQueryProvider>
  );
}
