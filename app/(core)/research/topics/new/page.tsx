import { Suspense } from "react";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { InitWizardSkeleton } from "@/features/research/components/shared/Skeletons";
import ResearchInitForm from "@/features/research/components/init/ResearchInitForm";

export default function ResearchNewTopicPage() {
  return (
    <>
      <RecordPageHeader
        backHref="/research/topics"
        parents={[
          { label: "Research topics", href: "/research/topics" },
        ]}
        record={{ name: "New topic" }}
      />
      <div className="h-dvh w-full overflow-y-auto bg-textured">
        {/* Spacer so initial content starts below the glass header */}
        <div style={{ height: "var(--shell-header-h, 2.75rem)" }} />
        <Suspense fallback={<InitWizardSkeleton />}>
          <ResearchInitForm />
        </Suspense>
      </div>
    </>
  );
}
