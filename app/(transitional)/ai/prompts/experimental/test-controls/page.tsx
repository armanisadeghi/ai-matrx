import { fetchAIModels } from "@/features/ai-models/server/ai-models-server";

export const dynamic = "force-dynamic";
import { Card } from "@/components/ui/card";
import { TestControlsWrapper } from "./TestControlsWrapper";

export default async function TestControlsPage() {
  const aiModels = await fetchAIModels();

  return (
    <div className="h-full w-full p-8 overflow-auto">
      <Card className="bg-textured border-gray-200 dark:border-gray-800">
        <div className="p-6 border-b border-border">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Test: Dynamic Model Controls
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Testing actual UI components with dynamic model controls data
          </p>
        </div>

        <TestControlsWrapper models={aiModels} />
      </Card>
    </div>
  );
}
