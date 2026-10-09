"use client";
import { useSyncExternalStore } from "react";
import { pageSandbox } from "./page-sandbox";
const subscribe = () => () => undefined;
const origin = () => window.location.origin;
const serverOrigin = () => null;
/** Hydration starts opaque, then restores the separate publisher's existing flags. */
export function usePageSandbox(url: string | null, base: string): string {
  const appOrigin = useSyncExternalStore<string | null>(subscribe, origin, serverOrigin);
  return pageSandbox(url, base, appOrigin);
}
