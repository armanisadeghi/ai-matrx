/**
 * Default navigation port: full page loads through `window.location`, links as
 * plain anchors, the path and query read from `window.location` (kept current
 * across back/forward). matrx-frontend overrides with the package's Next
 * binding (`next/navigation`).
 */

import { createElement } from "react";
import type {
  ChatLinkProps,
  ChatNavigationPort,
  ChatRouter,
} from "../contract";
import { useWindowPathname, useWindowSearchParams } from "./navigation-hooks";

function PlainLink({ prefetch, replace, scroll, ...anchor }: ChatLinkProps) {
  // Routing hints mean nothing to a plain anchor.
  void prefetch;
  void replace;
  void scroll;
  return createElement("a", anchor);
}

const hasWindow = () => typeof window !== "undefined";

const windowRouter: ChatRouter = {
  push(href) {
    if (hasWindow()) window.location.assign(href);
  },
  replace(href) {
    if (hasWindow()) window.location.replace(href);
  },
  back() {
    if (hasWindow()) window.history.back();
  },
  forward() {
    if (hasWindow()) window.history.forward();
  },
  refresh() {
    if (hasWindow()) window.location.reload();
  },
  prefetch() {
    /* a full page load has nothing to prefetch */
  },
};

function useWindowRouter(): ChatRouter {
  return windowRouter;
}

export function createWindowNavigation(): ChatNavigationPort {
  return {
    push: windowRouter.push,
    replace: windowRouter.replace,
    back: windowRouter.back,
    useRouter: useWindowRouter,
    usePathname: useWindowPathname,
    useSearchParams: useWindowSearchParams,
    Link: PlainLink,
  };
}
