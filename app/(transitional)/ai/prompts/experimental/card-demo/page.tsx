"use client";

import {
  PromptExecutionCard,
  PromptExecutionCardsGrid,
  createPromptCard,
} from "@/features/prompts/components/dynamic/PromptExecutionCard";
import { Card } from "@/components/ui/card";
import { Book } from "lucide-react";
import {
  fullPageContent,
  vocabularyTerms,
  historicalSignificance,
} from "./constants";

// IMPORTANT: Replace this with your actual prompt ID after you create the "Content Card Expander" prompt
const CONTENT_EXPANDER_PROMPT_ID = "e95d37f4-e983-4f20-a5fd-0fccfe5253a9";

export default function CardDemoPage() {
  // Create a pre-configured card component (Method 1: Factory Pattern)
  const ContentExpanderCard = createPromptCard({
    systemPromptId: CONTENT_EXPANDER_PROMPT_ID,
    auto_run: true,
    allow_chat: true,
    show_variables: false,
    apply_variables: true,
    track_in_runs: true,
    use_pre_execution_input: false,
  });

  return (
    <div className="h-page flex flex-col overflow-hidden bg-textured">
      {/* Header */}
      <div className="flex-none border-b border-border bg-white dark:bg-zinc-900">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-green-600 to-emerald-600">
              <Book className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Educational Content Cards Demo
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Interactive learning cards with AI-powered content expansion
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          {/* Essential Vocabulary Section */}
          <div className="space-y-4">
            <Card className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-emerald-200 dark:border-emerald-800">
              <h2 className="text-xl font-bold text-emerald-900 dark:text-emerald-100">
                Essential Vocabulary
              </h2>
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                Click any term to learn more about it in the context of the
                Persian Empire
              </p>
            </Card>

            <PromptExecutionCardsGrid columns={3}>
              {vocabularyTerms.map((term) => (
                <ContentExpanderCard
                  key={term.title}
                  title={term.title}
                  description={term.description}
                  context={fullPageContent}
                  className="border-emerald-200 hover:border-emerald-400 dark:border-emerald-700 dark:hover:border-emerald-600"
                />
              ))}
            </PromptExecutionCardsGrid>
          </div>

          {/* Historical Significance Section */}
          <div className="space-y-4 mt-8">
            <Card className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border-purple-200 dark:border-purple-800">
              <h2 className="text-xl font-bold text-purple-900 dark:text-purple-100">
                Historical Significance
              </h2>
              <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">
                Explore why these aspects of the Persian Empire matter
              </p>
            </Card>

            <PromptExecutionCardsGrid columns={2}>
              {historicalSignificance.map((concept) => (
                <PromptExecutionCard
                  key={concept.title}
                  systemPromptId={CONTENT_EXPANDER_PROMPT_ID}
                  title={concept.title}
                  description={concept.description}
                  context={fullPageContent}
                  auto_run={true}
                  allow_chat={true}
                  show_variables={false}
                  apply_variables={true}
                  track_in_runs={true}
                  use_pre_execution_input={false}
                  className="border-purple-200 hover:border-purple-400 dark:border-purple-700 dark:hover:border-purple-600"
                />
              ))}
            </PromptExecutionCardsGrid>
          </div>
        </div>
      </div>
    </div>
  );
}
