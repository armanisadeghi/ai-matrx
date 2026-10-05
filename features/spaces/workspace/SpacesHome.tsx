"use client";

// features/spaces/workspace/SpacesHome.tsx — /spaces opens the last Space visited, else the first one;
// with no Spaces yet it offers a new page or the Traveling SMM™ OS sample.

import { Button, EmptyState } from "@ai-matrx/design-system/controls";
import { FileText, Plus, TreePalm } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LAST_SPACE_KEY, useSpaces } from "../state/SpacesProvider";

export function SpacesHome() {
  const router = useRouter();
  const { ready, byId, childrenOf, loadError, createSpace, sample } = useSpaces();
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
    if (target) router.replace(`/spaces/${target}`);
  }, [ready, first, byId, router]);
  if (!ready || first) return <div className="spaces-page" aria-busy="true" />;
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={<FileText />}
        title={loadError ? "We couldn't load your pages" : "No pages yet"}
        line={loadError ?? undefined}
        action={
          loadError ? undefined : (
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => void createSpace(null)}>
                New page
              </Button>
              <Button variant="outline" icon={<TreePalm size={16} />} disabled={sample.adding} onClick={() => void sample.add()}>
                {sample.adding ? `Adding… ${sample.progress ?? ""}` : "Add the Traveling SMM™ OS sample"}
              </Button>
            </div>
          )
        }
      />
    </div>
  );
}
