"use client";

/**
 * Doors for the records an approval row names (THE DOOR LAW). A keyword has no
 * route of its own — its canonical door is the Keyword Intelligence window,
 * bound to the site the queue is standing in.
 */

import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import type { ApprovalScope } from "./types";

export function KeywordDoor({
  scope,
  phrase,
}: {
  scope: ApprovalScope;
  phrase: string;
}) {
  const openKeyword = useOpenKeywordWindow();
  return (
    <button
      type="button"
      className="font-medium text-primary underline-offset-2 hover:underline"
      title={`Open everything known about "${phrase}"`}
      onClick={(event) => {
        event.stopPropagation();
        openKeyword({
          phrase,
          siteId: scope.siteId,
          brandId: scope.brandId ?? undefined,
          // A site binding always travels with its owning organization.
          organizationId: scope.organizationId ?? undefined,
        });
      }}
    >
      &ldquo;{phrase}&rdquo;
    </button>
  );
}
