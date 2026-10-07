"use client";

import { use } from "react";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { DocumentRecord } from "@/features/documents/components/DocumentRecord";

/**
 * `/documents/[id]` — the route chrome only (RouteHeader, back button, header
 * clearance). Everything about the document itself — load, edit gate, rename,
 * Copy reference, Share, Rulebook notice, the editor and the
 * `matrx-user/documents` surface — is `DocumentRecord`, the same component the
 * Board's Document tile renders.
 */
export default function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <DocumentRecord
      documentId={id}
      // The editor owns a static status/action bar at its very top, so the
      // body takes header clearance instead of scrolling behind the glass —
      // without it that row (and Save / History) sits under the shell header
      // and collides with the avatar.
      bodyClassName="pt-[var(--shell-header-h)]"
      renderHeader={({ title, actions }) => (
        <RouteHeader
          left={
            <>
              {/* The glass Back button is its own group: the name field beside it is a solid control, and a
                row mixing glass and solid trips the tap-target guard. */}
            <span className="flex shrink-0">
              <ChevronLeftTapButton href="/documents" ariaLabel="Back" />
            </span>
              {title}
            </>
          }
          right={actions ?? undefined}
        />
      )}
    />
  );
}
