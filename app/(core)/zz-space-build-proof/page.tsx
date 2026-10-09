"use client";

/**
 * Build with AI, reattached — the live walk for `useSpaceBuild().reattach`.
 *
 * "Build" starts ONE Space build and saves its conversation id (`onConversationCreated`) in the tab's
 * session. After a reload, "Reattach" opens that same run: the finished result, or the run still going in
 * the same live window. It never starts a second build. The outcome prints below as JSON.
 */

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { useSpaceBuild, type SpaceBuildOutcome } from "@/features/spaces/embed/useSpaceBuild";

const SAVED = "demo.space-build.conversation";

export default function SpaceBuildReattachDemo() {
  const active = useOrganizationRequired();
  const organizationId = active.organizationState === "ready" ? active.organizationId : null;
  const { build, reattach, isRunning, available } = useSpaceBuild();
  const [request, setRequest] = useState("A one-page reading list: a short intro and a table of books with author, status and rating.");
  const [saved, setSaved] = useState<string | null>(() => (typeof window === "undefined" ? null : window.sessionStorage.getItem(SAVED)));
  const [outcome, setOutcome] = useState<SpaceBuildOutcome | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const settle = (work: Promise<SpaceBuildOutcome>) =>
    work.then(setOutcome, (e: unknown) => setFailure(e instanceof Error ? e.message : String(e)));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-3 p-6" data-demo="space-build">
      <textarea className="rounded border p-2 text-sm" rows={3} value={request} onChange={(e) => setRequest(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button
          data-action="build"
          disabled={!available || !organizationId || isRunning}
          onClick={() => {
            if (!organizationId) return;
            setOutcome(null);
            setFailure(null);
            void settle(
              build({
                request,
                organizationId,
                onConversationCreated: (id) => {
                  window.sessionStorage.setItem(SAVED, id);
                  setSaved(id);
                },
              }),
            );
          }}
        >
          Build
        </Button>
        <Button
          data-action="reattach"
          variant="outline"
          disabled={!saved || isRunning}
          onClick={() => {
            if (!saved) return;
            setOutcome(null);
            setFailure(null);
            void settle(reattach(saved));
          }}
        >
          Reattach
        </Button>
      </div>
      <pre data-demo-state className="text-xs">{`organization ${active.organizationState} · build ${available ? "available" : "not available"}`}</pre>
      <pre data-saved-conversation={saved ?? ""} className="text-xs">{saved ? `conversation ${saved}` : "no saved conversation"}</pre>
      {failure ? <pre data-failure className="text-xs text-red-600">{failure}</pre> : null}
      {outcome ? <pre data-outcome className="text-xs">{JSON.stringify(outcome)}</pre> : null}
    </main>
  );
}
