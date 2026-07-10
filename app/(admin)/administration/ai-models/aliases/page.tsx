import { Suspense } from "react";
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
            Loading…
          </div>
        }
      >
        <AliasesContainer />
      </Suspense>
    </div>
  );
}
