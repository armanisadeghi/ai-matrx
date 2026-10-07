"use client";
/**
 * Configures @ai-matrx/rich-content for this app. A CLIENT module on purpose: app/Providers.tsx is
 * a Server Component, and a side-effect import there would evaluate the host's client modules
 * (the captured toast) in the server graph. Wrapping the tree here evaluates the configuration
 * before any child renders, on the server render and in the browser alike.
 */
import type { ReactNode } from "react";
import "./richContentHost";

export function RichContentHostProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
