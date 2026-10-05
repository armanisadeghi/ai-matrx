"use client";

import { useRouter } from "next/navigation";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { BuildProgress } from "./BuildProgress";

/** The person's own build page (the completion notice links here). */
export function AgentBuildPage({ buildId }: { buildId: string }) {
  const router = useRouter();
  return (
    <>
      <RecordPageHeader backHref="/agents" parents={[{ label: "Agents", href: "/agents" }]} record={{ name: "Agent build" }} />
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]" data-matrx-page-scroll>
        <div className="mx-auto w-full max-w-3xl p-4">
          <BuildProgress buildId={buildId} onRebuilt={(next) => router.replace(`/agents/builds/${next}`)} />
        </div>
      </div>
    </>
  );
}
