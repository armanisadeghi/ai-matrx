import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { InitWizardSkeleton } from "@/features/research/components/shared/Skeletons";
import ResearchInitForm from "@/features/research/components/init/ResearchInitForm";

export default function ResearchNewTopicPage() {
  return (
    <>
      <PageHeader>
        <Link
          href="/research/topics"
          className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          aria-label="Back to topics"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
      </PageHeader>
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
