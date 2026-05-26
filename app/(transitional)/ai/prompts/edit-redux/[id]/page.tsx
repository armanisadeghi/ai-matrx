import React from "react";
import { PromptBuilderRedux } from "@/features/prompts/components/builder-new/PromptBuilderRedux";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditPromptReduxPage({ params }: PageProps) {
  const { id } = await params;
  return <PromptBuilderRedux promptId={id} />;
}
