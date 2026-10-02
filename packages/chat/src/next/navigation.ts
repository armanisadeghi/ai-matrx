"use client";

/**
 * The Next.js navigation port — part of the package's Next binding
 * (`packages/chat/src/next/**`, the only place package code may import
 * `next/*`; slice P10). A Next host calls `useNextNavigation()` in the render
 * that builds its chat host and passes the result as `navigation`. Package
 * components never import this file: they route through `host/navigation`.
 */

import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ChatNavigationPort } from "../host/contract";

export function useNextNavigation(): ChatNavigationPort {
  const router = useRouter();
  return {
    push: (href) => router.push(href),
    replace: (href) => router.replace(href),
    back: () => router.back(),
    useRouter,
    usePathname,
    useSearchParams,
    Link: NextLink,
  };
}
