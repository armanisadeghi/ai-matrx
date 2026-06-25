// app/Providers.tsx
//
// Server Component (no `"use client"`). Stays a thin static shell — every
// provider and leaf widget below is a Client Component that owns its own
// lazy-loading internally. Adding `next/dynamic` here would be invalid
// (`ssr: false` is not allowed in a Server Component) and would defeat
// the architectural point: the *contents* of a heavy widget should be
// dynamic, not the wrapper.
//
// Build-time rule: this file is in the static dep graph of every
// authenticated route, so every import here is parsed for every page.
// Keep imports minimal, prefer `import type` for type-only imports, and
// never import from a barrel `index.ts`. If a widget below is heavy,
// open the widget's own file and lazy-load its heavy children there.

// NOTE: the bundle-leak guard's side-effect import was moved to
// `app/DeferredSingletons.tsx` — that file has `"use client"`, which is
// required for the guard's setTimeout to actually run on the client.
// A side-effect import here (in a Server Component) would only execute
// on the server and never schedule the boot-signal macrotask in the
// browser, leading to false-positive alarms when the lazy window-panels
// chunk first loads. See DeferredSingletons.tsx for the live import.

import React from "react";
import StoreProvider from "@/providers/StoreProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { InitialReduxState } from "@/types/reduxTypes";
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
import { ServerToggleQueryReset } from "@/providers/ServerToggleQueryReset";
// WindowPersistenceManager provides the React context that WindowPanel
// reads via `useWindowPersistence()` — without this mounted, every
// `saveWindow`/`closeWindow` call resolves to the no-op default and
// persistence silently disappears. This is also what runs the one-time
// hydration of `window_sessions` on session boot, the one-shot slug
// migrations, and the idle GC sweep. Keep this OUTSIDE DeferredSingletons
// so the context is available to UnifiedOverlayController's children
// and so hydration begins as soon as the user is authenticated rather
// than waiting on idle. Imports only metadata + service helpers — none
// of the heavy window-panel core files are pulled into this graph.
import { WindowPersistenceManager } from "@/features/window-panels/WindowPersistenceManager";
// ExtensionBridgeSubscriber bridges matrx-extend Chrome extension envelopes
// (Broadcast channel `matrx-extension-bridge:<userId>`) into the
// window-panels overlay system. When the extension publishes
// `{ action: "openPanel", payload: { panelId, instanceId?, data? } }`,
// this subscriber dispatches `openOverlay({...})` exactly like an
// in-app caller would. Mounted at the provider root so it's always
// active for signed-in users; short-circuits when no user is present.
// See docs/MATRX_EXTEND_CONNECTION.md and lib/extension-bridge/.
import { ExtensionBridgeSubscriber } from "@/lib/extension-bridge/ExtensionBridgeSubscriber";
import GlobalTaskShortcut from "@/features/tasks/widgets/GlobalTaskShortcut";
import CreateTaskFromSourceDialog from "@/features/tasks/widgets/CreateTaskFromSourceDialog";
import {
  CloudFilesPickerHost,
  CloudFilesRealtimeProvider,
  UploadGuardHost,
} from "@/features/files";
import { ConfirmDialogHost } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { ValuePromptsDialogHost } from "@/components/dialogs/value-prompts/ValuePromptsDialogHost";
import { AudioModalHost } from "@/providers/AudioModalHost";
import { AudioOutputHost } from "@/providers/AudioOutputHost";
import { AudioPlaybackHost } from "@/features/audio/playback/AudioPlaybackHost";
import { AudioDeviceProvider } from "@/providers/AudioDeviceProvider";

// NOTE: client-capability providers are registered by `register-all`, which is
// imported by `build-tool-injection.ts` (the CLIENT-side consumer) — NOT here.
// This file is a Server Component, so a side-effect import here populates the
// server's registry Map while `buildToolInjection` reads the client's empty
// one (capabilities: [] on every turn → no sandbox/editor binding ever).
// See docs/sandbox/BINDING_POSTMORTEM.md. Do not re-add the import here.

// Phase 11 — legacy file system providers removed:
//   - lib/redux/fileSystem/Provider (FileSystemProvider)
//   - components/file-system/preview (FilePreviewProvider)
//   - providers/FileSystemProvider (OldFileSystemProvider)
//   - providers/packs/FilesPack
// All file management now lives in features/files/* via Redux + realtime
// middleware. The CloudFilesPickerHost below exposes openFilePicker() /
// openFolderPicker() / openSaveAs() app-wide.
//
// Phase 4 PR 4.C: deleted setGlobalUserId / getGlobalUserId pair and the
// imperative `setGlobalUserIdAndToken` seed. The Redux preloaded state
// (initialReduxState.user) is the source of truth; non-React consumers
// read via `getIdentityContext()` from `@/lib/sync/identity`. See
// `phase-4-plan.md` §5.9.

interface ProvidersProps {
  children: React.ReactNode;
  initialReduxState?: InitialReduxState;
}

export function Providers({ children, initialReduxState }: ProvidersProps) {
  return (
    <ReactQueryProvider>
      <StoreProvider initialState={initialReduxState}>
        <WindowPersistenceManager>
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
                                {/* App-root audio DEVICE manager (mic/speaker
                                selection + permission). Mounted above the
                                recording provider so the persisted mic device is
                                applied to the singleton before the first
                                recording. Renders nothing; effects only. */}
                                <AudioDeviceProvider />
                                <GlobalRecordingProvider>
                                  {children}
                                  <RecordingPill />
                                  <RecoveryWindow />
                                  <RecoveryNudge />
                                  <DeferredSingletons />
                                  <ServerToggleQueryReset />
                                  <ExtensionBridgeSubscriber />
                                  <GlobalTaskShortcut />
                                  <CreateTaskFromSourceDialog />
                                  {/* Cloud-files realtime — mounted globally so
                                  every authed page receives file/folder/share
                                  link updates. Reads userId from Redux and
                                  tears down on sign-out. Replaces five
                                  previous per-route mounts (Phase 0 of the
                                  file-handling consolidation). See
                                  docs/FILE_HANDLING_CONSOLIDATION_PLAN.md. */}
                                  <CloudFilesRealtimeProvider />
                                  {/* Cloud-files imperative pickers:
                                  openFilePicker() / openFolderPicker() / openSaveAs()
                                  are callable from anywhere in the app once this host
                                  mounts. See features/files/components/pickers/. */}
                                  <CloudFilesPickerHost />
                                  {/* Upload guard — exposes the imperative
                                  `requestUpload()` API. Hashes incoming
                                  files, scans Redux for duplicates,
                                  shows the resolution dialog when
                                  needed, then dispatches the upload.
                                  See features/files/upload/. */}
                                  <UploadGuardHost />
                                  {/* Imperative confirm dialog host. Exposes
                                  `confirm({title, variant, ...})` — the
                                  global replacement for `window.confirm`.
                                  See components/dialogs/confirm/. */}
                                  <ConfirmDialogHost />
                                  <ValuePromptsDialogHost />
                                  {/* Imperative audio modal host. Exposes the global
                                  `showAudioModal({ text, title, ... })` helper
                                  (see utils/audio/audioModal.ts). The modal is
                                  next/dynamic — no TTS code loads until first use. */}
                                  <AudioModalHost />
                                  {/* App-root audio OUTPUT singleton — owns the
                                  read-aloud / TTS streaming speaker so playback
                                  survives War Room tab switches and route
                                  changes (it used to die when the Agent+ tab
                                  unmounted). Output-only (no mic permission).
                                  Sibling of GlobalRecordingProvider (audio IN).
                                  Surfaces drive it via voicePlaybackBus
                                  (requestVoicePlayback / stopVoicePlayback). The
                                  Cartesia SDK is next/dynamic — nothing TTS
                                  loads on the server. See providers/AudioOutputHost. */}
                                  <AudioOutputHost />
                                  {/* App-root mirror of the single audio
                                  playback QUEUE (features/audio/playback). Keeps
                                  Redux in sync with the framework-free queue
                                  singleton so Speaker buttons + the playback
                                  window-panel render one shared queue. Imports
                                  only the queue's subscribe API — provider SDKs
                                  (Cartesia/Groq) load lazily on first speak, not
                                  in the app shell. */}
                                  <AudioPlaybackHost />
                                  {/* File preview is delivered via a registered
                                  WindowPanel (`filePreviewWindow`) mounted by
                                  the UnifiedOverlayController — no host needed
                                  here. Anywhere in the app:
                                    import { openFilePreview } from
                                      "@/features/files/components/preview/openFilePreview";
                                    openFilePreview(fileId); */}
                                </GlobalRecordingProvider>
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
        </WindowPersistenceManager>
      </StoreProvider>
    </ReactQueryProvider>
  );
}
