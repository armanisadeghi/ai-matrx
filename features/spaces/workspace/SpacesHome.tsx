"use client";

// features/spaces/workspace/SpacesHome.tsx — /spaces opens the last Space visited, else the first one;
// with no Spaces yet it offers a new page or the Traveling SMM™ OS sample.

import { Button, EmptyState } from "@ai-matrx/design-system/controls";
import { FileText, Plus, TreePalm } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LAST_SPACE_KEY, useSpaces } from "../state/SpacesProvider";
import { LoadAccessState } from "./LoadAccessState";

export function SpacesHome() {
  const router = useRouter();
  const {
    ready,
    byId,
    childrenOf,
    loadError,
    access,
    retryLoad,
    createSpace,
    sample,
  } = useSpaces();
  const first = childrenOf(null)[0]?.id ?? null;
  useEffect(() => {
    if (!ready) return;
    let last: string | null = null;
    try {
      last = window.localStorage.getItem(LAST_SPACE_KEY);
    } catch {
      last = null;
    }
    const target = last && byId.has(last) ? last : first;
    // Keep the address's query (e.g. ?org=) so a link that names an organization still names it after the hop.
    if (target) router.replace(`/spaces/${target}${window.location.search}`);
  }, [ready, first, byId, router]);
  if (!ready || first) return <div className="spaces-page" aria-busy="true" />;
  if (access || loadError)
    return <LoadAccessState access={access ?? "fault"} onRetry={retryLoad} />;
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={<FileText />}
        title="No pages yet"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => void createSpace(null)}
            >
              New page
            </Button>
            <Button
              variant="outline"
              icon={<TreePalm size={16} />}
              disabled={sample.adding}
              onClick={() => void sample.add()}
            >
              {sample.adding
                ? `Adding… ${sample.progress ?? ""}`
                : "Add the Traveling SMM™ OS sample"}
            </Button>
          </div>
        }
      />
    </div>
  );
}
