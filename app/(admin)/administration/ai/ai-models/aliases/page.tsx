import { Suspense } from "react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import AliasesContainer from "@/features/ai-models/components/aliases/AliasesContainer";

export const metadata = {
  title: "AI Model Aliases",
};

export default function AiModelAliasesPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <SuspenseLoader centered={false} message="Loading model aliases…" />
          </div>
        }
      >
        <AliasesContainer />
      </Suspense>
    </div>
  );
}
