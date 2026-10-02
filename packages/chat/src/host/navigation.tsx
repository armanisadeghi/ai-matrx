"use client";

/**
 * host/navigation — the ONE way package code routes (R10, slice P10).
 *
 * Same names and shapes the call sites used when they imported `next/navigation`
 * and `next/link`, so switching a call site is an import-path change. Each reads
 * the navigation port of the nearest <ChatProvider> (present during the server
 * render too); outside one, the configured host's; else the package default
 * (`window.location` + a plain anchor). The port's hooks are the same functions
 * for the life of the page, so the hook order never changes between renders.
 *
 * Guard: `host/__tests__/no-next-import-outside-next-binding.test.ts`.
 */

import type {
  ChatLinkProps,
  ChatNavigationPort,
  ChatRouter,
  ChatSearchParams,
} from "./contract";
import { getChatHost, isChatHostConfigured } from "./configure";
import { createWindowNavigation } from "./defaults/navigation";
import { useMaybeChatHost } from "./react";

let standIn: ChatNavigationPort | null = null;

function hostlessNavigation(): ChatNavigationPort {
  if (isChatHostConfigured()) return getChatHost().navigation;
  standIn ??= createWindowNavigation();
  return standIn;
}

/** The navigation port this component routes through. */
export function useChatNavigation(): ChatNavigationPort {
  return useMaybeChatHost()?.navigation ?? hostlessNavigation();
}

// The three readers call the port's hook, which the compiler cannot prove
// constant ("use no memo": a named opt-out); each is one call, nothing to memoize.
export function useRouter(): ChatRouter {
  "use no memo";
  return useChatNavigation().useRouter();
}

export function usePathname(): string {
  "use no memo";
  return useChatNavigation().usePathname();
}

export function useSearchParams(): ChatSearchParams {
  "use no memo";
  return useChatNavigation().useSearchParams();
}

export function Link(props: ChatLinkProps) {
  const { Link: HostLink } = useChatNavigation();
  return <HostLink {...props} />;
}
