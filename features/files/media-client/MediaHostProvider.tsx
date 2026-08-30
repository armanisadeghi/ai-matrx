/**
 * features/files/media-client/MediaHostProvider.tsx
 *
 * Mounts `@ai-matrx/media`'s MediaProvider ONCE for the whole app, wiring
 * the strangler MediaClient (over today's file handler) and the host ports
 * (next/image adapter, audio playback session, action flows). Every media
 * component/hook from the package resolves through this provider.
 */

"use client";

import type { ReactNode } from "react";
import { MediaProvider } from "@ai-matrx/media/core";
import { mediaClient } from "./client";
import { mediaHostPorts } from "./ports";

export function MediaHostProvider({ children }: { children: ReactNode }) {
  return (
    <MediaProvider
      client={mediaClient}
      ports={mediaHostPorts}
    >
      {children}
    </MediaProvider>
  );
}
