import { AiWorkHeader } from "@/features/ai-work/components/AiWorkHeader";
import { SavedRequestsList } from "@/features/ai-work/compose/components/SavedRequestsList";

export function generateMetadata() {
  return { title: "Saved requests" };
}

export default function WorkRequestsPage() {
  return (
    <>
      <AiWorkHeader />
      <div className="h-full min-h-0 overflow-y-auto pt-[var(--shell-header-h)]">
        <SavedRequestsList />
      </div>
    </>
  );
}
