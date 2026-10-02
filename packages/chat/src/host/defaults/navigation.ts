/**
 * Default navigation port: full page loads through `window.location`, links as
 * plain anchors. matrx-frontend overrides with next/navigation + next/link.
 */

import { createElement } from "react";
import type { ChatLinkProps, ChatNavigationPort } from "../contract";

function PlainLink({ href, className, children }: ChatLinkProps) {
  return createElement("a", { href, className }, children);
}

export function createWindowNavigation(): ChatNavigationPort {
  return {
    push(href) {
      if (typeof window !== "undefined") window.location.assign(href);
    },
    replace(href) {
      if (typeof window !== "undefined") window.location.replace(href);
    },
    back() {
      if (typeof window !== "undefined") window.history.back();
    },
    Link: PlainLink,
  };
}
