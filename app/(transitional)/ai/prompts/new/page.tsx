import { PromptBuilder } from "@/features/prompts/components/builder/PromptBuilder";
import { fetchAIModels } from "@/features/ai-models/server/ai-models-server";
import { serverToolsService } from "@/utils/supabase/server-tools-service";

export const dynamic = "force-dynamic";

export default async function NewPromptPage() {
  // Fetch AI models and tools in parallel
  const [aiModels, availableTools] = await Promise.all([
    fetchAIModels(),
    serverToolsService.fetchTools(),
  ]);

  // Provide sensible defaults for a new prompt
  const newPromptDefaults = {
    name: "New prompt",
    messages: [
      { role: "system", content: "You're a very helpful assistant" },
      {
        role: "user",
        content:
          "Do you know about {{city}}?\n\nI'm looking for {{what}} there.\n\nPlease provide concise and well-structured list of options.",
      },
    ],
    variableDefaults: [
      { name: "city", defaultValue: "New York" },
      { name: "what", defaultValue: "Hotels" },
    ],
    // settings will be initialized from user preferences or first available model
  };

  return (
    <PromptBuilder
      models={aiModels}
      initialData={newPromptDefaults}
      availableTools={availableTools}
    />
  );
}
