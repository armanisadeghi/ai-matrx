import { DesktopBuilderSkeleton } from "@/features/agents/components/builder/AgentBuilderSkeletons";

export default function AgentBuildLoading() {
  return (
    <div className="h-full overflow-hidden">
      <DesktopBuilderSkeleton />
    </div>
  );
}
