import type { Metadata } from "next";
import { OrchestraBuilder } from "@/features/agents/orchestras/components/OrchestraBuilder";

export const metadata: Metadata = {
  title: "Set Builder",
};

export default async function OrchestraBuilderPage({
  params,
}: {
  params: Promise<{ orchestratorId: string }>;
}) {
  const { orchestratorId } = await params;
  return <OrchestraBuilder orchestratorId={orchestratorId} />;
}
