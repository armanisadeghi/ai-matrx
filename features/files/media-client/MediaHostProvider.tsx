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
import { MediaProvider, type MediaProviderProps } from "@ai-matrx/media/core";
import { mediaClient } from "./client";
import { mediaHostPorts } from "./ports";

export function MediaHostProvider({ children }: { children: ReactNode }) {
  return (
    <MediaProvider
      // PACKAGE DEFECT (@ai-matrx/media 0.1.0, reported to the npm-package
      // campaign): tsup emits the DurableSrc unique-symbol brand TWICE — once
      // in dist/index.d.ts (the root types entry this app implements against)
      // and once in the shared d.ts chunk /core and /react consume — so the
      // two structurally-identical MediaClient types are nominally
      // incompatible. This ONE cast at the injection seam bridges the brands
      // until the package ships a single-source dts. Do not add casts
      // anywhere else; delete this one when the fixed version lands.
      client={mediaClient as unknown as MediaProviderProps["client"]}
      ports={mediaHostPorts as unknown as MediaProviderProps["ports"]}
    >
      {children}
    </MediaProvider>
  );
}
