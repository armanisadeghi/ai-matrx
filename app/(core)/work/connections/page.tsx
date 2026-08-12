import { AiWorkConnections } from "@/features/ai-work/components/AiWorkConnections";
import { AiWorkHeader } from "@/features/ai-work/components/AiWorkHeader";

export function generateMetadata() {
  return { title: "Connections and sync" };
}

export default function WorkConnectionsPage() {
  return (
    <>
      <AiWorkHeader />
      <div className="h-full min-h-0 overflow-hidden pt-[var(--shell-header-h)]">
        <AiWorkConnections />
      </div>
    </>
  );
}
