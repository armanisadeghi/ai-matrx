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
        <div className="flex items-center w-full min-w-0">
          <Link
            href="/research/topics"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 -ml-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            aria-label="Back to topics"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span className="font-medium">Back to Topics</span>
          </Link>
        </div>
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
