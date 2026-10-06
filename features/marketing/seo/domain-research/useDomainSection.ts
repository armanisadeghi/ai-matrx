"use client";

// features/marketing/seo/domain-research/useDomainSection.ts — one section of
// the domain page over one `seo_domain` action. The mechanics (free probe,
// stale-answer guard, paid buy through the approval dialog) live in the shared
// `tool-door/useToolSection.ts`; this names the tool and the action.
//
// `args === null` means the section cannot run yet (no domain, no site, no seed
// keywords). `buy(true)` buys a fresh read past the reuse window.

import { useToolSection } from "../tool-door/useToolSection";
import type { DomainAction, DomainActionData } from "./types";

export const SEO_DOMAIN_TOOL = "seo_domain";

export function useDomainSection<A extends DomainAction>(
  action: A,
  args: Record<string, unknown> | null,
) {
  const section = useToolSection<DomainActionData[A]>(
    SEO_DOMAIN_TOOL,
    args ? { ...args, action } : null,
  );
  return {
    state: section.state,
    running: section.running,
    buy: (refresh = false) => section.buy(refresh ? { refresh: true } : {}),
    recheck: section.recheck,
    approvalDialog: section.approvalDialog,
  };
}
